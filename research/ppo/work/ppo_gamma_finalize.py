"""Analyze and package a completed gamma round, using descriptive report paths."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-gamma-r2';ENGINE=WORK/'ppo-gamma-r2-engine';OUT=ROOT/'outputs'
sys.path.insert(0,str(ENGINE))
import numpy as np
import torch
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv,VecNormalize
from ml.env import AgeClanEnv
from ml.experiment import write_json,environment_signature

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))

def trace(run,key):
    manifest=read(run/'manifest.json')
    vector=VecNormalize.load(run/'vecnormalize.pkl',DummyVecEnv([lambda:AgeClanEnv(**manifest['config']['env'])]))
    vector.training=False;vector.norm_reward=False
    try:
        model=MaskablePPO.load(run/'model.zip',env=vector,device='cpu')
        vector.seed(260000);obs=vector.reset()
        mask=vector.envs[0].action_masks()
        with torch.inference_mode():
            tensor,_=model.policy.obs_to_tensor(obs)
            probs=model.policy.get_distribution(tensor,action_masks=mask[None,:]).distribution.probs[0].cpu().numpy()
        group_probs=Counter()
        for i,p in enumerate(probs):group_probs[vector.envs[0].actions[i]['name']]+=float(p)
        initial_distribution={'group_probability':dict(group_probs),'top_actions':[{'id':int(i),'command':vector.envs[0].actions[int(i)],'probability':float(probs[i])} for i in np.argsort(probs)[-5:][::-1]]}
        first_build=first_kill=None;records=[];previous_kills=0
        steps=0
        while True:
            mask=vector.envs[0].action_masks()
            action,_=model.predict(obs,deterministic=True,action_masks=mask[None,:])
            name=vector.envs[0].actions[int(action[0])]['name']
            obs,reward,done,infos=vector.step(action);info=infos[0];steps+=1
            if name=='build' and first_build is None:first_build=steps
            if info['kills']>0 and first_kill is None:first_kill=steps
            if name!='wait' or info['kills']!=previous_kills or done[0]:
                records.append({'step':steps,'action':int(action[0]),'name':name,'game_time':info['game_time'],
                    'kills':info['kills'],'contiguous_cleared':info['contiguous_cleared'],'hp':info['hp'],
                    'reward_terms':info['reward_terms']})
            previous_kills=info['kills']
            if done[0]:break
        result={'python_seed':260000,'game_seed':info['seed'],'first_build_step':first_build,
                'first_kill_step':first_kill,'total_steps':steps,'end_reason':info['end_reason'],
                'initial_action_distribution':initial_distribution,'events':records}
        write_json(BASE/f'diagnostic-trace-{key}.json',result)
        return {k:v for k,v in result.items() if k!='events'}
    finally:vector.close()


def main():
    state=read(BASE/'summary.json');assert state['status']=='complete'
    torch.set_num_threads(1)
    diagnosis={};signatures=[]
    for key,r in state['runs'].items():
        run=BASE/key;manifest=read(run/'manifest.json')
        assert manifest['added_timesteps']==65536 and manifest['actual_timesteps']==131072
        gamma=manifest['config']['ppo']['gamma']
        assert manifest['model']['gamma']==manifest['model']['rollout_gamma']==manifest['model']['normalization_gamma']==gamma
        vector=VecNormalize.load(run/'vecnormalize.pkl',DummyVecEnv([lambda:AgeClanEnv(**manifest['config']['env'])]))
        try:
            model=MaskablePPO.load(run/'model.zip',env=vector,device='cpu')
            assert model.gamma==model.rollout_buffer.gamma==vector.gamma==gamma
            assert all(torch.isfinite(p).all() for p in model.policy.parameters())
            assert manifest['environment']==environment_signature(vector.envs[0])
            signatures.append(manifest['environment'])
        finally:vector.close()
        rows=read(BASE/f'confirmation-{key}.json')['episodes'];assert len(rows)==20
        counts=Counter();reward_terms=Counter()
        for row in rows:
            assert row['end_reason'] in ('castle_destroyed','time_limit')
            for action,n in row['action_counts'].items():counts[manifest['environment']['actions'][int(action)]['name']]+=n
            reward_terms.update(row['reward_totals'])
        diagnosis[key]={'action_counts':dict(counts),'wait_fraction':counts['wait']/sum(counts.values()),
                        'mean_reward_terms':{k:v/20 for k,v in reward_terms.items()}}
    assert all(s==signatures[0] for s in signatures)
    for mode in ('control','imitation'):
        for seed in (42,43):
            assert state['runs'][f'{mode}-{seed}-g099']['parent_sha256']==state['runs'][f'{mode}-{seed}-g0999']['parent_sha256']
    for mode,key in state['selection'].items():diagnosis[key]['trace']=trace(BASE/key,key)
    write_json(BASE/'behavior-analysis.json',diagnosis)
    control_stalled=all(s['median_cleared']<5 for k,s in state['confirmation'].items() if k.startswith('control'))
    next_plan={'status':'planned_not_started','fresh_training_seeds':[44,45,46],
        'steps_per_run':131072,'development_python_seeds':[280000,280009],'confirmation_python_seeds':[290000,290019],
        'finding':'control exploration collapse persists' if control_stalled else 'retest development-selected conditions with fresh initializations',
        'gamma_selection_from_development':state['selection'],
        'reward_current':'defense-v1 unchanged',
        'next_comparison':'If control is stalled, compare ent_coef 0.003 vs 0.03 using fresh initialization, while keeping the chosen gamma and defense-v1 reward fixed. Pair basic/imitation on each seed; freeze conditions before running.',
        'normalization_controls':'Include pure basic with self-generated observation statistics; if using common teacher statistics for actor-only comparison, label that as a separate control arm.',
        'reward_followup':'No construction or idle-time bonus yet. If entropy comparison fails to produce first construction/kill, preregister a potential-based shaping experiment against unchanged defense-v1 and check for build/sell exploitation.',
        'budget_note':'Two entropy conditions x two lineages x three seeds x131072 =1572864 steps; any extra normalization control is budgeted separately. No next-round training was started.'}
    write_json(BASE/'next-round-plan.json',next_plan)
    report=OUT/'PPO_할인율비교_2차_보고서.md'
    extra=['','**모델 재로드 검증·행동 진단**','',
           '8개 모델을 저장 후 다시 읽어 model·rollout_buffer·정규화의 gamma 일치, 유한 가중치, 환경 지문 일치, 누적/추가 스텝을 검사했다. 같은 계열·시드의 두 gamma 조건이 정확히 같은 부모 모델·정규화 파일에서 시작한 것도 SHA256으로 확인했다.',
           '이 실험은 gamma=0.99로 이미 학습한 actor·critic·optimizer에서 전이한 비교다. 처음부터 gamma=0.999로 학습했을 때의 효과와 같다고 단정하지 않는다.']
    if (BASE/'execution-gaps.json').exists():
        gap=read(BASE/'execution-gaps.json')
        extra += [f"실행 중 도구 대기 요청 {gap['tool_requested_wait_ms']/1000:.0f}초에 대해 실제 경과 {gap['tool_observed_wall_seconds']:.1f}초의 공백을 관측했다. 원인은 미확인이다. 모델 파일과 진행 CSV는 이어졌으며 원시 wall_seconds/FPS를 순수 연산 시간이나 장치 성능 비교로 해석하지 않는다."]
    for key,d in diagnosis.items():
        s=state['confirmation'][key]
        extra.append(f"- {key}: 대기 {d['wait_fraction']:.1%}, 건설 {d['action_counts'].get('build',0)}회, 판매 {d['action_counts'].get('sellTower',0)}회(20판 합계). 후보 {s['eligible_tiers'] or '없음'}.")
        if 'trace' in d:
            extra.append(f"  개발 시드 260000 진단: 최초 건설 스텝 {d['trace']['first_build_step']}, 최초 처치 스텝 {d['trace']['first_kill_step']}. 초기 행동 종류별 확률 {d['trace']['initial_action_distribution']['group_probability']}. 전체 사건 순서는 `{BASE / ('diagnostic-trace-'+key+'.json')}`.")
    extra+=['','**진단 후 확정한 다음 회차 계획**','',
            f"기본 계열 대기 정체 지속 여부: {control_stalled}. 새 학습 시드 44·45·46에서 선택한 gamma를 고정하고 엔트로피 계수 0.003/0.03을 비교한다. 기본·모방을 병행하며 각 131,072스텝, 총 1,572,864스텝 계획이다. 기본의 자체 관측 통계와 모방의 시연 통계 차이를 보고하고, 공통 시연 통계 비교군이 필요하면 별도 군으로 예산을 추가한다. 보상은 defense-v1을 우선 유지한다. 탐색 비교로 최초 건설·처치가 생기지 않으면, 잠재함수 기반 보상 형성을 원래 보상과 별도 비교하고 건설·판매 보상 악용을 검사한다. 이 단계는 계획이며 아직 실행하지 않았다.",
            f"상세 계획: `{BASE / 'next-round-plan.json'}`. 진단/검증/패키징 스크립트: `{WORK / 'ppo_gamma_finalize.py'}`.",
            '', '과거 보고서 경로 정정과 PPO 표시 경로 연결 복구를 지침에 반영했다. 새 실험의 매니페스트 부모 경로도 내용 기반 경로로 저장한다. 과거 동결 ZIP과 모델 매니페스트는 당시의 이력을 유지한다.']
    with report.open('a',encoding='utf-8') as f:f.write('\n'.join(extra)+'\n')
    package=OUT/'ppo_gamma_r2';package.mkdir(exist_ok=False)
    shutil.copytree(BASE,package/'experiment',ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(ENGINE,package/'engine',ignore=shutil.ignore_patterns('__pycache__'))
    for name in ('ppo_gamma_round.py','ppo_gamma_finalize.py','ppo_update_report_paths.py'):shutil.copy2(WORK/name,package/name)
    shutil.copy2(report,package/report.name)
    (package/'README.md').write_text('8개 gamma 비교 모델과 관측 정규화, 학습 설정, 에피소드 평가, 독립 엔진 사본을 포함합니다. 재평가는 같은 Python 의존성 환경에서 engine을 PYTHONPATH에 넣고 python -m ml.evaluate --run-dir experiment/모델명 --episodes 20 --seed 270000 으로 실행합니다. 초기 부모 모델은 상위 실험의 별도 자료이며 manifest.json의 내용 기반 경로에 기록돼 있습니다.\n',encoding='utf-8')
    inventory={str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('*') if p.is_file()}
    write_json(package/'sha256.json',inventory)
    archive=OUT/'PPO_할인율비교_2차_실험자료.zip'
    with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,strict_timestamps=False) as z:
        for p in package.rglob('*'):
            if p.is_file():z.write(p,p.relative_to(package))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name,digest in inventory.items():assert hashlib.sha256(z.read(name.replace('\\','/'))).hexdigest()==digest
    write_json(BASE/'verification.json',{'status':'passed','model_reload_count':8,'added_ppo_steps':524288,
        'confirmation_episodes':160,'paired_parent_hashes':True,'gamma_consistency':True,
        'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive_bytes':archive.stat().st_size})
    print(json.dumps({'confirmation':state['confirmation'],'selection':state['selection'],
          'behavior':diagnosis,'archive':str(archive)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
