"""Freeze the evaluated intermediate candidate; adopt only on both gates."""
from pathlib import Path
from collections import Counter
import json,hashlib,shutil,subprocess,sys
from ppo_intermediate_select import ROOT,BASE,ENGINE,read,sha,ENV
from ml.experiment import write_json,runtime_versions
from sb3_contrib import MaskablePPO
OUT=ROOT/'outputs'

REPLAY='''from pathlib import Path
import argparse,hashlib,json,sys
import torch
p=argparse.ArgumentParser();p.add_argument('--python-seed',type=int,required=True);args=p.parse_args()
base=Path(__file__).resolve().parent
inventory=json.loads((base/'sha256.json').read_text(encoding='utf-8'))
for rel,digest in inventory.items():
    assert hashlib.sha256((base/rel).read_bytes()).hexdigest()==digest,rel
sys.path.insert(0,str(base/'engine'))
from ml.fixed_env import FixedScaleEnv
from ml.capacity_env import CapacityEnv
from sb3_contrib import MaskablePPO
config=json.loads((base/'config.json').read_text(encoding='utf-8'))
torch.set_num_threads(1);model=MaskablePPO.load(base/'model.zip',device='cpu')
sequence=[];counts={}
constraints=config.get('policy_constraints')
factory=CapacityEnv(max_castle_level=constraints['max_castle_level'],**config['env']) if constraints else FixedScaleEnv(**config['env'])
with factory as env:
    scaling=json.loads((base/config['input_scaling']).read_text(encoding='utf-8'))['scales']
    assert list(scaling)==env.unwrapped.feature_names
    assert all(float(scale)==float(scaling[name]) for name,scale in zip(env.unwrapped.feature_names,env.scales))
    assert json.loads((base/config['actions']).read_text(encoding='utf-8'))==env.unwrapped.actions
    obs,info=env.reset(seed=args.python_seed);steps=0
    while True:
        mask=env.action_masks();a,_=model.predict(obs,deterministic=config['inference']['deterministic'],action_masks=mask);a=int(a);assert mask[a]
        name=env.unwrapped.actions[a]['name'];counts[name]=counts.get(name,0)+1
        if name!='wait':sequence.append([steps,a])
        obs,reward,terminated,truncated,info=env.step(a);steps+=1
        if terminated or truncated:break
print(json.dumps({'python_seed':args.python_seed,'game_seed':info['seed'],'contiguous_cleared':info['contiguous_cleared'],
    'wave':info['wave'],'end_reason':info['end_reason'],'steps':steps,'action_counts':counts,
    'nonwait_sequence_sha256':hashlib.sha256(json.dumps(sequence).encode()).hexdigest()}))
'''

def main():
    initial=read(BASE/'final-result.json');fallback=BASE/'moderate-parent-ppo/final-result.json'
    capacity=BASE/'investment-budget/final-result.json'
    stages=[(initial,BASE/'selection-before-confirmation.json')]
    if fallback.exists():stages.append((read(fallback),BASE/'moderate-parent-ppo/selection-before-confirmation.json'))
    if capacity.exists():stages.append((read(capacity),BASE/'investment-budget/selection-before-confirmation.json'))
    def devrank(item):
        s=read(item[1])['development'];return s['performance']['in_band'],-abs(s['performance']['median']-32.5),s['diversity']['command_root_tower_pass_games']
    passing=[item for item in stages if item[0]['summary']['adoptable']]
    result=max(passing or stages,key=devrank)[0]
    c=result['candidate'];s=result['summary'];adopt=s['adoptable']
    target=OUT/'ppo_intermediate_policy';assert not (target/'config.json').exists(),'Existing package: inspect before replacing'
    target.mkdir(exist_ok=True)
    assert sha(c['path'])==c['sha256'];shutil.copy2(c['path'],target/'model.zip')
    files=['package.json','lib/game-engine.js','lib/trees.js','public/game/game.js','public/game/balance.js',
        'ml/__init__.py','ml/env.py','ml/fixed_env.py','ml/capacity_env.py','ml/hierarchical.py','ml/experiment.py','ml/bridge.mjs','ml/fast_masks.mjs']
    for rel in files:
        source=ENGINE/rel;dest=target/'engine'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
    # Standalone inference uses Node built-ins, never the game website's frontend packages.
    write_json(target/'engine/package.json',{'type':'module','private':True,'engines':{'node':'>=22.13.0'}})
    shutil.copy2(BASE/'feature-scaling.json',target/'feature-scaling.json')
    write_json(target/'action-table.json',c['environment']['actions'])
    model=MaskablePPO.load(target/'model.zip',device='cpu')
    config={'status':'adopted' if adopt else 'not_adopted','difficulty':'intermediate','training_seed':c['training_seed'],
        'architecture':c['architecture'],'initialization':c['initialization'],'bc_selected_update':c['bc_selected_update'],
        'ppo_steps':c['ppo_steps'],'ppo_gradient_epochs_completed':model._n_updates,'checkpoint_note':'PPO callback snapshot before the final rollout gradient update',
        'optimized_interaction_steps':model._n_updates//model.n_epochs*model.n_steps,
        'ppo_training':{'learning_rate':float(model.lr_schedule(1.0)),'gamma':model.gamma,'entropy_coefficient':model.ent_coef,
            'rollout_steps':model.n_steps,'batch_size':model.batch_size,'epochs_per_rollout':model.n_epochs,'device':'cpu'},
        'policy_key':c['key'],'inference':{'deterministic':True,'decision_seconds':1.0,'state_dependent':True,'game_seed':'independent runtime input'},
        'env':ENV,'input_scaling':'feature-scaling.json','model':'model.zip','actions':'action-table.json',
        'policy_constraints':c.get('policy_constraints'),'additional_ppo_steps':c.get('additional_ppo_steps'),
        'source_checkpoint':c['source'],'model_sha256':c['sha256'],'confirmation_python_seeds':result['python_seeds'],
        'selection':'development games only; frozen before independent confirmation',
        'acceptance':{'wave_metric':'actual contiguous cleared at defeat','median':[30,35],'fraction_in_30_35':.8,
            'no_censoring':True,'no_invalid_actions':True,'diversity':'see selection plan and evidence'},
        'summary':s,'state_response_probe':result['state_response_probe'],'runtime':runtime_versions(),
        'compatibility':'unchanged engine rules/actions/features; legality adapter verified against original oracle and complete paired episode'}
    write_json(target/'config.json',config);write_json(target/'confirmation-evidence.json',result)
    for name in ['mask-verification.json','transition-verification.json']:shutil.copy2(BASE/name,target/name)
    (target/'replay.py').write_text(REPLAY,encoding='utf-8')
    versions=runtime_versions()
    (target/'requirements.txt').write_text('\n'.join(f'{k}=={v}' for k,v in versions.items() if k!='python')+'\n',encoding='utf-8')
    (target/'README.md').write_text('**중급 정책 검토 묶음**\n\n상태는 config.json의 status를 확인한다. not_adopted 정책은 검토용이며 중급 등록이 아니다.\n\n'
        'model.zip은 저장 PPO 가중치, config.json은 학습 시드·계보·입력/추론/환경 설정, confirmation-evidence.json은 독립20판 기록이다.\n'
        'engine은 오프라인 추론에 필요한 파일만 포함한다. Python 환경과 Node 실행 파일은 별도다. 현재 로컬 ppo-venv로 실행할 수 있다.\n\n'
        f'PowerShell 예: `& "{ROOT / "work/ppo-venv/Scripts/python.exe"}" "{target / "replay.py"}" --python-seed {result["episodes"][0]["python_seed"]}`\n\n'
        'replay.py는 SHA256을 검사하고 엔진을 실행해 함락까지 진행한다. 게임 RNG 시드는 입력이며 학습 시드와 다르다.\n',encoding='utf-8')
    inventory={str(p.relative_to(target)).replace('\\','/'):sha(p) for p in sorted(target.rglob('*')) if p.is_file() and p.name!='sha256.json'}
    write_json(target/'sha256.json',inventory)
    seed=result['episodes'][0]['python_seed']
    ran=subprocess.run([sys.executable,str(target/'replay.py'),'--python-seed',str(seed)],capture_output=True,text=True,encoding='utf-8',check=True)
    replay=json.loads(ran.stdout);expected=result['episodes'][0]
    for key in ['game_seed','contiguous_cleared','wave','end_reason','steps','action_counts','nonwait_sequence_sha256']:assert replay[key]==expected[key],key
    write_json(target/'replay-verification.json',{'status':'passed','replayed':replay,'model_sha256':sha(target/'model.zip')})
    inventory['replay-verification.json']=sha(target/'replay-verification.json');write_json(target/'sha256.json',inventory)
    registry={'version':1,'intermediate':{'status':'adopted','config':str(target/'config.json'),'training_seed':c['training_seed'],'policy_key':c['key']} if adopt else None,
        'candidate':{'status':'adopted' if adopt else 'not_adopted','config':str(target/'config.json'),'performance_pass':s['performance']['pass'],'diversity_pass':s['diversity']['pass']},
        'game_deployment':'not performed; local registry only'}
    write_json(OUT/'PPO_난이도정책_등록부.json',registry)
    p=s['performance'];d=s['diversity'];allcounts=Counter();builds=Counter()
    for row in result['episodes']:allcounts.update(row['action_counts']);builds.update(row['build_type_counts'])
    lines=['**중급 PPO 설정·행동 가변성 결과**','',f"판정: {'중급 로컬 정책으로 채택' if adopt else '채택 보류: 사전 성능·가변성 기준을 모두 충족하지 않음'}. 운영 게임 배포는 하지 않았다.",'',
        f"선정 후보: `{c['key']}`, 학습 시드{c['training_seed']}, {c['architecture']} 구조, 확장 시연 모방{c['bc_selected_update']:,}회 체크포인트에서 PPO{c['ppo_steps']:,}스텝. 시드 번호 자체가 난이도를 결정하지 않으며 이 저장 가중치·입력 단위·행동 선택 설정을 함께 고정한다.",
        '시드47을 유지한 이유: 기존47·48 체크포인트의 개발 비교에서47계열이 목표 구간에 더 가까웠고, 중간 모방 부모를 고정해 학습률과 PPO 예산의 영향을 살펴보기 위해서다. 같은 단계 안에서 부모와 난수 계보를 유지했고, 시드 번호를 바꾸어 목표 웨이브를 맞추지는 않았다.',
        f"독립 확인 {p['episodes']}판: 평균{p['mean']:.2f}, 중앙값{p['median']}, 실제 연속 완료{p['min']}–{p['max']}웨이브. 30–35구간 {p['in_band']}/{p['episodes']}판. 제한 종료{p['censored']}·무효 행동{p['invalid']}. 35웨이브에서 강제 종료하지 않고 함락까지 측정했다.",
        f"행동 가변성: 종류5개·상위3범주·건설2종 기준 {d['command_root_tower_pass_games']}/{p['episodes']}판, 대기 외 최빈 행동80% 이하 {d['concentration_pass_games']}/{p['episodes']}판, 서로 다른 행동·결정시각 시퀀스 {d['distinct_nonwait_sequences']}종. 대기 외 명령 종류 범위{d['command_kind_range']}. 평균 대기 비중{d['mean_wait_share']:.1%}.",
        f"공통 유효 행동 마스크를 적용한 서로 다른 자연 관측 비교 {result['state_response_probe']['total_pairs']}회 중{result['state_response_probe']['changed_pairs']}회에서 선택이 달라졌다. 역순 쌍의 중복을 포함하는 보조 비교이며 독립 표본의 통계 검정이나 전술 품질 보장은 아니다. 같은 상태·같은 마스크에서는 결정적 선택이고, 게임이 달라지면 관측에 따라 행동이 바뀐다.",
        f"전체 확인 게임의 행동 수: {dict(allcounts)}. 타워 건설: {dict(builds)}.",'',
        '선정 과정: 기존 확장 시연 PPO 중간 체크포인트를 별도 개발5판으로 비교하고 한 개를 먼저 동결한 뒤 확인20판을 실행했다. 확인 결과를 보고 다른 기존 모델을 같은 확인 게임으로 재선정하지 않았다.']
    if fallback.exists():
        fs=read(fallback)['summary']['performance']
        lines+=['기존 후보가 조건을 충족하지 못해, 시드47의 중간 성능 BC4,000 부모에서 LR0.00003/0.0001을 짝지어 각각16,384스텝 추가했다. 4,096 간격8체크포인트를 새 개발480000–480004에서 선택하고 새 확인490000–490019를 썼다.',f"이 단계 확인 평균{fs['mean']:.2f}·중앙값{fs['median']}·범위{fs['min']}–{fs['max']}·구간{fs['in_band']}/20판이었다."]
    if capacity.exists():
        cr=read(capacity);cc=cr['candidate'];cp=cr['summary']['performance']
        lines+=[f"분산이 줄지 않아 시드47의 강한 계층형 PPO131,072스텝 부모에서 AI 성 투자 한도6/8/10/12를 개발520000–520004로 비교했다. 선택한 한도{cc['policy_constraints']['max_castle_level']}에서 LR0.00003으로16,384스텝 추가하고, 개발540000–540004에서 체크포인트를 선택한 뒤 확인550000–550019로 검증했다. 이 조건 선정 모델의 총 PPO 스텝은{cc['ppo_steps']:,}, 추가분은{cc['additional_ppo_steps']:,}이다. 확인 평균{cp['mean']:.2f}·중앙값{cp['median']}·범위{cp['min']}–{cp['max']}·구간{cp['in_band']}/20판이었다.",
            '한도 도달 후 AI의 upgradeCastle만 마스킹하는 명시적 행동 변경이다. 엔진의 성 최고20레벨 규칙·인간 플레이·웨이브 진행은 바꾸지 않았다. 도달 가능한 문명/체력/공격력 증가를 제한하므로 전체 행동을 허용한 모델과 같은 조건의 비교라고 주장하지 않는다. 이 조건의 기본/모방 짝 비교는 아직 없다.']
    lines+=['모든 단계에서 기준을 통과한 후보만 채택 대상으로 삼았다. 검토용 묶음에 담을 대표 후보의 순위도 각 단계의 개발 구간 포함률→중앙값32.5근접도→가변성 수로 정했으며, 확인 결과를 이용해 통과 기준을 조정하지 않았다.',
        f"문서의460000·490000·550000 등의 범위는 Python 평가용 시드다. 실제 엔진에는 Gym RNG가 변환한 uint32가 들어간다. 대표 후보 확인 첫 판 Python{result['episodes'][0]['python_seed']} → 엔진{result['episodes'][0]['game_seed']}이며, 전20판 대응은 confirmation-evidence.json에 기록했다. 학습 시드47은 초기 가중치·학습 난수 계보이고 평가 게임 시드와 다르다."]
    lines+=['','|독립 확인 단계|평균|중앙값|범위|목표 구간|가변성|','|---|---:|---:|---|---:|---|']
    for stage,index in zip(['기존 PPO 체크포인트','중간 모방 부모+짧은 PPO','성 투자 한도+PPO'],range(len(stages))):
        ss=stages[index][0]['summary'];pp=ss['performance'];lines.append(f"|{stage}|{pp['mean']:.2f}|{pp['median']}|{pp['min']}–{pp['max']}|{pp['in_band']}/20|{ss['diversity']['pass']}|")
    lines+=[f"대표 체크포인트의 수집 상호작용은{c['ppo_steps']:,}스텝이고, 최적화에 사용된 rollout은{model._n_updates//model.n_epochs}개/{config['optimized_interaction_steps']:,}스텝이다. 저장 callback이 마지막 rollout의 경사 업데이트 전에 실행되므로 마지막256스텝은 이 체크포인트 가중치에 아직 반영되지 않았다. 모방 업데이트와 PPO 경사 epoch{model._n_updates}회도 서로 다른 단위다."]
    lines+=['','|개발 후보|평균|중앙값|30–35 판수|가변성|','|---|---:|---:|---:|---|']
    for progress in [BASE/'development-progress.json',BASE/'moderate-parent-ppo/development-progress.json',BASE/'investment-budget/screen-progress.json',BASE/'investment-budget/development-progress.json']:
        if progress.exists():
            for key,value in read(progress).items():
                a=value['performance'];lines.append(f"|{key}|{a['mean']:.2f}|{a['median']}|{a['in_band']}/5|{value['diversity']['pass']}|")
    lines+=['','보상·행동 변경: 즉시 보상 defense-v1을 유지했다. 처치당+0.01, 실제 웨이브 종료 시 처치 비율0–1, 체력 피해당−0.02, 무효 행동−0.05, 함락−10이며 이번 목표 종료 보너스는 비활성이다. gamma0.99는 미래 보상의 할인율로 보상 항목 자체와 다르다. 173개 행동 ID 및148개 입력의 고정 단위를 유지했고, 투자 한도 실험만 위에 명시한 추가 마스크를 적용한다. 중급을 맞추기 위한 강제 패배·웨이브 상한·유리한 게임 시드 선별은 사용하지 않았다.',
        '빠른 마스크는 별도 평가 엔진 사본에만 적용했다. 1,517실제·경계 상태에서262,441개 판정과 원래 구현이 일치했고, 동일 게임 한 판2,953스텝의 관측·마스크·보상·전이·함락 결과가 일치했다. 실행 중인 기본/모방 대조 실험의 엔진과 원본 모델은 수정하지 않았다.','',
        '**파일 및 실제 상호 작용**','',
        f"- 후보 동결·평가: `{ROOT/'work/ppo_intermediate_select.py'}`가 `{OLD_PATH()}`의 PPO ZIP을 읽고 `{BASE/'candidates'}`에 동결했다. `{ENGINE/'ml/fixed_env.py'}` → `{ENGINE/'ml/env.py'}` → Node `{ENGINE/'ml/bridge.mjs'}` → `{ENGINE/'lib/game-engine.js'}` 호출로 게임을 실행하고 개발·확인 JSON에 결과를 저장했다.",
        f"- 추가 학습 제어: `{ROOT/'work/ppo_intermediate_fallback.py'}`. 실행한 경우 `{BASE/'moderate-parent-ppo'}`의 계획·훈련CSV·체크포인트·독립 평가로 저장했다.",
        f"- 투자 한도 제어: `{ROOT/'work/ppo_intermediate_capacity.py'}` → `{ENGINE/'ml/capacity_env.py'}`가 성 강화 마스크를 추가하고 실제 성 레벨이 한도를 넘지 않는지 평가 매 스텝 검사했다. 결과는 `{BASE/'investment-budget'}`와 `capacity-*.json`에 저장한다.",
        f"- 결과 정리: `{ROOT/'work/ppo_intermediate_report.py'}`가 선택된 ZIP을 `{target/'model.zip'}`로 복사하고 `config.json`·`action-table.json`·`feature-scaling.json`·검증 자료·엔진·SHA256을 묶었다. `replay.py`는 이 묶음만 읽어 독립 확인 첫 판을 재생했고 행동 시퀀스와 최종 성과가 일치했다.",
        f"- 로컬 난이도 등록: `{OUT/'PPO_난이도정책_등록부.json'}`. 두 기준을 통과할 때만 intermediate 항목에 정책을 등록한다. 기본/모방 장기 비교는 `{ROOT/'work/ppo-expanded-demo-v2'}`에서 별도 진행한다.",
        f"- 최종 묶음 검증: `{ROOT/'work/ppo_intermediate_verify_bundle.py'}`가 입력 단위·행동 표·설정 기반 추론을 검사하는 replay.py를 동기화하고 동일 확인 게임을 다시 재생했다. `{target/'replay-verification.json'}`에 기록했으며24개 파일의 SHA256과 행동 시퀀스·함락 결과가 모두 일치했다.",
        '', '다음 계획: '+('추가 학습 없이 이 가중치를 동결하고 새 확인 시드20판과 실제 게임 연결을 검증한다. 성능 드리프트가 있으면 등록을 재검토한다.' if adopt else '중급으로 확정하지 않는다. 이번 분포와 시연 추종 오차를 분석한 뒤, 중간 수준의 다종 타워 교사 시연을 두 구조에 동일하게 제공하는 별도 실험을 설계한다. 새 학습 시드49·50, 각65,536PPO스텝, 기본/모방 짝 비교, 개발500000–500009·확인510000–510019를 사용하며 같은 성능·가변성 기준을 유지한다. 이 후속 실험은 아직 실행하지 않았다.')]
    (OUT/'PPO_중급설정_가변성_결과보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    write_json(OUT/'PPO_중급설정_결과.json',{'status':registry['candidate']['status'],'selected':c,'summary':s,'state_response_probe':result['state_response_probe'],'package':str(target),'replay':'passed'})
    print(json.dumps({'registry':registry,'summary':s},ensure_ascii=False),flush=True)
def OLD_PATH():return ROOT/'work/ppo-expanded-demo-v2/runs'
if __name__=='__main__':main()
