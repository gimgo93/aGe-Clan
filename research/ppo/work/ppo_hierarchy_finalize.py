"""Audit all paired fresh runs and package results using descriptive paths."""
from pathlib import Path
import hashlib,json,shutil,sys,zipfile,subprocess
from collections import Counter
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-hierarchy-v1';ENGINE=BASE/'engine';OUT=ROOT/'outputs'
sys.path.insert(0,str(ENGINE))
from ml.fixed_env import FixedScaleEnv
from ml.hierarchical import HierarchicalPolicy,NAME_GROUP
from ml.experiment import write_json,environment_signature
from sb3_contrib import MaskablePPO

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def weight_hash(policy):return hashlib.sha256(b''.join(v.detach().cpu().numpy().tobytes() for v in policy.state_dict().values())).hexdigest()

def main():
    torch.set_num_threads(1)
    state=read(BASE/'summary.json');assert state['status']=='complete' and len(state['runs'])==12
    assert len(state['confirmation'])==12
    behavior={};eligible={};paired=[];models={};implementation_defaults={}
    for key,meta in state['runs'].items():
        assert meta['actual_timesteps']==meta['added_timesteps']==131072
        assert meta['input_scaling']==read(BASE/'feature-scaling.json')
        assert meta['config']['ppo']['gamma']==.99
        assert meta['imitation']['updates']==(2000 if meta['initialization']=='imitation' else 0)
        with FixedScaleEnv(**meta['config']['env']) as env:
            model=MaskablePPO.load(BASE/'runs'/key/'model.zip',env=env,device='cpu')
            assert isinstance(model.policy,HierarchicalPolicy)==(meta['architecture']=='hierarchy')
            assert model.policy.action_net.out_features==(183 if meta['architecture']=='hierarchy' else 173)
            assert model.gamma==model.rollout_buffer.gamma==.99
            assert weight_hash(model.policy)==meta['trained_weights_sha256']
            implementation_defaults[key]={'gae_lambda':model.gae_lambda,'clip_range':model.clip_range(1.),
                'vf_coef':model.vf_coef,'max_grad_norm':model.max_grad_norm,
                'normalize_advantage':model.normalize_advantage,'target_kl':model.target_kl,
                'net_arch':model.policy.net_arch,'activation':model.policy.activation_fn.__name__,
                'optimizer':type(model.policy.optimizer).__name__,'device':str(model.device)}
            assert all(torch.isfinite(p).all() for p in model.policy.parameters())
            assert environment_signature(env.unwrapped)==meta['environment']
            obs,info=env.reset(seed=310000);mask=env.action_masks()
            tensor,_=model.policy.obs_to_tensor(obs)
            with torch.inference_mode():
                dist=model.policy.get_distribution(tensor,mask)
                probs=dist.distribution.probs[0].numpy()
                action=dist.get_actions(deterministic=True).item()
            assert mask[action] and np.isclose(probs.sum(),1)
            masses={str(g):sum(float(probs[i]) for i,c in enumerate(env.unwrapped.actions) if NAME_GROUP[c['name']]==g) for g in range(6)}
            models[key]=model
        result=read(BASE/f'confirmation-{key}.json');rows=result['episodes'];assert len(rows)==20
        assert [r['python_seed'] for r in rows]==list(range(320000,320020))
        assert all(r['invalid_actions']==0 for r in rows)
        counts=Counter();terms=Counter()
        for row in rows:counts.update(row['action_counts']);terms.update(row['reward_totals'])
        development=read(BASE/f'development-{key}.json')['episodes']
        initial=read(BASE/f'initial-{key}.json')['episodes']
        assert [r['python_seed'] for r in development[:3]]==[r['python_seed'] for r in initial]
        behavior[key]={'action_counts_20_games':dict(counts),'wait_fraction':counts['wait']/sum(counts.values()),
            'mean_reward_terms':{k:v/20 for k,v in terms.items()},'initial_game_category_probability':masses,
            'initial_game_action_id':action,'parameters':meta['parameters'],
            'initial_matched3_mean_cleared':float(np.mean([r['contiguous_cleared'] for r in initial])),
            'trained_matched3_mean_cleared':float(np.mean([r['contiguous_cleared'] for r in development[:3]])),
            'games_with_build':sum(r['first_build_step'] is not None for r in rows),
            'games_with_kill':sum(r['first_kill_step'] is not None for r in rows)}
        eligible[key]=result['summary']['eligible_tiers']
    for architecture in ('flat','hierarchy'):
        for seed in (44,45,46):
            a=state['runs'][f'{architecture}-{seed}-basic'];b=state['runs'][f'{architecture}-{seed}-imitation']
            assert a['initial_random_weights_sha256']==b['initial_random_weights_sha256']
            initial=[]
            for mode in ('basic','imitation'):
                p=BASE/'initial'/f'{architecture}-{seed}-{mode}'/'model.zip'
                initial.append(MaskablePPO.load(p,device='cpu').policy.state_dict())
            assert all(torch.equal(v,initial[1][k]) for k,v in initial[0].items() if 'value_net' in k)
    for mode in ('basic','imitation'):
        for seed in (44,45,46):
            a=state['confirmation'][f'flat-{seed}-{mode}'];b=state['confirmation'][f'hierarchy-{seed}-{mode}']
            paired.append({'initialization':mode,'seed':seed,'flat_mean':a['mean_cleared'],'hierarchy_mean':b['mean_cleared'],
                'difference':b['mean_cleared']-a['mean_cleared'],'flat_median':a['median_cleared'],'hierarchy_median':b['median_cleared']})
    write_json(BASE/'behavior-analysis.json',behavior)
    write_json(BASE/'implementation-defaults.json',implementation_defaults)
    write_json(BASE/'paired-results.json',paired)
    write_json(BASE/'tier-screening.json',{'development_selected':state['selection'],'eligible_per_model':eligible,
        'interpretation':'Non-selected configurations are exploratory. Verify selected candidates on more independent games before game integration.'})
    teacher=np.load(BASE/'data/teacher-training.npz')
    action_table=next(iter(state['runs'].values()))['environment']['actions']
    teacher_names=Counter();teacher_builds=Counter()
    for label in teacher['labels']:
        command=action_table[int(label)];teacher_names[command['name']]+=1
        if command['name']=='build':teacher_builds[command['args'][0]]+=1
    teacher_profile={'samples':len(teacher['labels']),'action_counts':dict(teacher_names),'build_type_counts':dict(teacher_builds),
        'scope':'Frozen teacher training games only; no evaluation games included'}
    write_json(BASE/'teacher-action-profile.json',teacher_profile)
    basic_best=max(state['confirmation'][k]['median_cleared'] for k in state['runs'] if k.endswith('-basic'))
    next_plan={'status':'planned_not_started','development_selected':state['selection'],
        'architecture_effect_by_training_seed':paired,'basic_best_confirmed_median':basic_best,
        'training_seeds':[47,48,49],'development_game_seeds':[330000,330009],
        'confirmation_game_seeds':[340000,340019],'proposed_steps_per_run':131072,
        'priority':'If tier candidates exist, freeze them and expand independent evaluation before integration. If deterministic basic is below 20, first audit conditional greedy versus joint-global argmax versus seeded sampling on saved policies, including first construction/kill. Then compare exploration entropy 0.003 vs 0.03 at selected architecture before introducing reward shaping.',
        'decoder_diagnostic':'Use a new preregistered development set, keep policy-sampling seeds separate from game seeds and do not count repeated sampling trials as independent game seeds. This diagnostic does not retrain the model.',
        'reward':'Keep defense-v1 while isolating architecture or exploration changes. Potential-based shaping, if needed, must be a distinct paired experiment with unchanged-reward control and build/sell exploit checks.',
        'imitation':'If learning degrades the initial imitation policy, preserve the initial checkpoint and compare lower actor learning rate against unchanged-rate control before adding more PPO steps.',
        'teacher_scope':teacher_profile,
        'advanced_teacher_followup':'Existing teacher games end at wave20 and may cover too few tower types/economy actions. If imitation plateaus, evaluate diversified rule-based teachers against this SAME engine and collect high-wave training-only demonstrations in a separate experiment. Keep reward and architecture controls and report extra data/compute; do not silently mix different engine rules.',
        'limits':'Only three training seeds and 20 confirmation games per model; censored results are lower bounds.'}
    write_json(BASE/'next-round-plan.json',next_plan)
    verification={'status':'passed','model_reload_count':12,'paired_initial_weights':True,'critic_unchanged_during_imitation':True,
        'total_ppo_steps':1572864,'verification_smoke_steps_separate':512,'imitation_updates':12000,
        'initial_evaluation_games':36,'development_games':120,'confirmation_games':240,
        'invalid_actions_confirmation':0,'paired_input_scaling_identical':True}
    write_json(BASE/'final-verification.json',verification)
    lines=['','**학습 완료 결과와 다음 판단**','',
        '12개 모델을 저장 후 다시 읽어 가중치 해시·유한값·구조 종류·관측 정의·gamma와 실제 동작을 확인했다. 같은 구조·시드의 기본/모방 초기 가중치가 일치하고, 모방 중 critic이 변하지 않은 것도 확인했다.',
        '', '|초기화|학습 시드|기존 구조 평균 완료|계층 구조 평균 완료|차이|',
        '|---|---:|---:|---:|---:|']
    for r in paired:lines.append(f"|{r['initialization']}|{r['seed']}|{r['flat_mean']:.2f}|{r['hierarchy_mean']:.2f}|{r['difference']:+.2f}|")
    lines+=['','초기화 진단 36판, 개발 120판, 최종 확인 240판을 완료했다. 아래 행동 횟수는 각 모델 최종 확인 20판 합계다. 초기화와 PPO 후 비교는 같은 개발 첫 3판끼리 비교하며 20판 최종 확인 분포와 혼동하지 않는다.']
    for key,b in behavior.items():
        lines.append(f"- {key}: 파라미터 {b['parameters']}, 건설 {b['action_counts_20_games'].get('build',0)}회, 판매 {b['action_counts_20_games'].get('sellTower',0)}회, 대기 {b['wait_fraction']:.1%}. 동일 개발 3판 초기화 평균 {b['initial_matched3_mean_cleared']:.2f} → PPO 후 {b['trained_matched3_mean_cleared']:.2f}. 난이도 후보 {eligible[key] or '없음'}.")
        if state['runs'][key]['initialization']=='imitation':
            fit=state['runs'][key]['imitation']['validation']
            lines.append(f"  모방 초기화 직후 별도 시연 검증 정확도 {fit['accuracy']:.2%}, 대기 외 행동 정확도 {fit['nonwait_accuracy']:.2%}, 결합 교차 엔트로피 {fit['cross_entropy']:.4f}. 게임 성능과 별개의 지표다.")
    lines+=['','**범위와 해석 제한**','',
        '이전 42·43 실험과 이번 44·45·46 실험은 입력 정규화도 달라 직접적인 차이를 행동 구조만의 효과라고 부르지 않는다. 이번 내부 flat 대조군과 계층군은 같은 고정 입력 단위를 사용한다. 계층 구조는 출력 파라미터 수와 초기 탐색 분포도 바꾸므로 구조 변경 패키지의 효과를 측정한다.',
        '같은 시연 업데이트 2,000회가 두 구조에서 같은 모방 정확도를 뜻하지는 않는다. 구조별 훈련/검증 정확도와 초기화 직후 게임 성능을 별도로 기록했다. 계층 엔트로피는 모든 합법 경로의 확률을 반영하는 정확한 결합 엔트로피이며, 단순히 선택된 분기의 엔트로피만 더한 값이 아니다. 유효하지만 이번에 선택되지 않은 분기는 그 확률에 따라 기여하고, 도달 불가능한 분기는 0이다.',
        f"훈련 시연의 실제 건설 타워 종류별 수는 {dict(teacher_builds)}다. 시연은 20웨이브까지의 과거 전략으로, 고급 웨이브용 다양한 타워·경제·연구 전략을 제공한 것이 아니다. 모방 성능이 정체되면 같은 실제 엔진에서 더 다양한 규칙 기반 교사 전략을 먼저 평가하고, 별도 훈련 시드에서 높은 웨이브 시연을 수집하는 비교를 계획한다. 추가 자료와 계산 비용을 보고하고 보상·구조 변경과 섞지 않는다.",
        'PPO 상호작용 예산은 군별로 같지만 계층 연산과 모방 단계의 실제 시간 비용은 다르다. 원시 wall_seconds는 PC의 실행 공백·다른 작업·절전 영향을 포함할 수 있으므로 순수 CPU 성능으로 해석하지 않는다.',
        '시드 번호 자체로 난이도를 결정하지 않는다. 저장된 가중치와 실행 방식·입력 단위를 묶은 정책이 평가 분포에서 목표를 만족해야 한다. 발견한 후보도 독립 표본 확대와 게임 입력 호환 검사를 거쳐야 한다.',
        '', '**다음 회차 계획**','',
        f"개발 평가에서 미리 선택한 후보는 {state['selection']}다. 최종 확인 조건별 후보 판정은 tier-screening.json에 저장했다. 후보가 있으면 정책을 동결하고 독립 평가를 확대한다. 기본 모델이 20웨이브 미만이면 최초 건설·처치와 행동 확률을 진단하고 선택 구조에서 entropy 0.003/0.03 비교를 우선한다. 모방 정책이 PPO 후 나빠지면 초기화 체크포인트를 보존하고 더 낮은 actor 학습률을 대조군과 비교한다. 새 시드 47·48·49, 각 131,072스텝, 개발 330000–330009·최종 확인 340000–340019를 후속 예비 계획으로 저장했다. 보상은 별도 가설을 정하기 전 defense-v1을 유지한다. 다음 회차는 아직 실행하지 않았다.",
        f"상세 계획 `{BASE / 'next-round-plan.json'}`. 감사·집계·패키징 파일 `{WORK / 'ppo_hierarchy_finalize.py'}`."]
    report=OUT/'PPO_계층행동_직접학습_보고서.md'
    with report.open('a',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
    package=OUT/'ppo_hierarchy_v1';package.mkdir(exist_ok=False)
    shutil.copytree(BASE,package/'experiment',ignore=shutil.ignore_patterns('__pycache__'))
    for name in ('ppo_hierarchy_train.py','ppo_hierarchy_verify.py','ppo_hierarchy_finalize.py','ppo_hierarchy_evaluate.py'):shutil.copy2(WORK/name,package/name)
    shutil.copy2(report,package/report.name)
    (package/'README.md').write_text('계층 정책 직접 학습과 flat 대조군, 기본/모방 초기화, 시드 44·45·46의 실험 자료입니다. 동일 Python 의존성 환경과 Node.js가 필요합니다(관측한 Node 버전은 experiment/engine-runtime.json). 이 폴더에서 python ppo_hierarchy_evaluate.py --run-dir experiment/runs/hierarchy-44-basic --episodes 20 --seed 320000 --output 새결과.json 으로 재평가할 수 있습니다. 모델별 manifest.json의 input_scaling/schema/environment를 확인해야 하며, 기존 VecNormalize 평가기는 이 고정 단위 모델에 그대로 사용할 수 없습니다. 평가 스크립트는 묶음 안의 엔진·정책을 사용하고 출력 파일이 이미 있으면 거절합니다. verification-model은 512스텝 통합 검증 전용으로, 난이도 후보가 아닙니다.\n',encoding='utf-8')
    # Exercise the exported entry point against the exported models/engine, not the work copy.
    for mode,key in state['selection'].items():
        output=package/f'replay-{mode}.json'
        completed=subprocess.run([sys.executable,str(package/'ppo_hierarchy_evaluate.py'),
            '--run-dir',str(package/'experiment/runs'/key),'--episodes','1','--seed','320000','--output',str(output)],
            capture_output=True,text=True,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        assert completed.returncode==0,completed.stderr
        actual=read(output)['episodes'][0]
        expected=read(BASE/f'confirmation-{key}.json')['episodes'][0]
        for metric in ('game_seed','wave','contiguous_cleared','end_reason','kills','hp','leaks','reward_totals'):
            assert actual[metric]==expected[metric],(key,metric)
    verification['exported_entrypoint_replays']=2
    write_json(BASE/'final-verification.json',verification)
    shutil.copy2(BASE/'final-verification.json',package/'experiment/final-verification.json')
    with report.open('a',encoding='utf-8') as f:
        f.write(f'\n내보낸 자료의 재평가 진입점 `{package / "ppo_hierarchy_evaluate.py"}`을 실제로 실행해 기본/모방 선택 모델을 각각 게임 시드 320000에서 재생했다. 두 결과 모두 원래 확인 평가의 엔진 시드·시작/완료 웨이브·종료 이유·처치·HP·누수·보상 항목과 일치했다. 이 2판은 같은 게임을 재생한 검증이며 독립 표본 수에 추가하지 않는다.\n')
    shutil.copy2(report,package/report.name)
    inventory={str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('*') if p.is_file()}
    write_json(package/'sha256.json',inventory)
    archive=OUT/'PPO_계층행동_직접학습_실험자료.zip'
    with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,strict_timestamps=False) as z:
        for p in package.rglob('*'):
            if p.is_file():z.write(p,p.relative_to(package))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name,h in inventory.items():assert hashlib.sha256(z.read(name.replace('\\','/'))).hexdigest()==h
    write_json(OUT/'PPO_계층행동_직접학습_자료검증.json',{**verification,'archive':str(archive),'bytes':archive.stat().st_size,
        'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(inventory)})
    print(json.dumps({'paired':paired,'selection':state['selection'],'tiers':eligible,'verification':verification},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
