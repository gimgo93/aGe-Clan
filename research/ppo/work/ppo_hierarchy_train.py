"""Fresh flat versus learned hierarchy, paired basic/imitation, seeds 44--46."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from copy import deepcopy
from datetime import datetime
import hashlib,json,sys,time
from pathlib import Path
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-hierarchy-v1';ENGINE=BASE/'engine';OUT=ROOT/'outputs'
sys.path[:0]=[str(ENGINE),str(WORK)]
from ml.hierarchical import HierarchicalPolicy
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.experiment import environment_signature,runtime_versions,write_json
from sb3_contrib import MaskablePPO
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.logger import configure
from stable_baselines3.common.vec_env import DummyVecEnv
from ppo_gamma_round import summary as summarize

CONFIG={'total_timesteps':131072,'torch_threads':1,
    'env':{'frame_skip':10,'max_ticks':120000,'target_wave':0,'reward_mode':'defense-v1'},
    'ppo':{'n_steps':256,'batch_size':64,'n_epochs':4,'learning_rate':.0001,'gamma':.99,'ent_coef':.003}}

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def weight_hash(policy):
    return hashlib.sha256(b''.join(v.detach().cpu().numpy().tobytes() for v in policy.state_dict().values())).hexdigest()

def schema(architecture):
    return 'hierarchical-v1:6-root/type/pad;conditional-greedy' if architecture=='hierarchy' else 'flat-173:global-greedy'

def evaluation(run,key,stage,start,n):
    path=BASE/f'{stage}-{key}.json'
    if path.exists():return read(path)['summary']
    meta=read(run/'manifest.json')
    assert meta['status']=='complete' and meta['input_scaling']==read(BASE/'feature-scaling.json')
    vector=DummyVecEnv([lambda:FixedScaleEnv(**CONFIG['env'])])
    try:
        assert meta['environment']==environment_signature(vector.envs[0].unwrapped)
        model=MaskablePPO.load(run/'model.zip',env=vector,device='cpu')
        assert model.policy.action_net.out_features==(183 if meta['architecture']=='hierarchy' else 173)
        rows=[]
        for seed in range(start,start+n):
            vector.seed(seed);obs=vector.reset();steps=invalid=0;counts={};first_build=first_kill=None
            while True:
                action,_=model.predict(obs,deterministic=True,action_masks=vector.envs[0].action_masks()[None,:])
                a=int(action[0]);name=vector.envs[0].unwrapped.actions[a]['name']
                counts[name]=counts.get(name,0)+1
                obs,reward,done,infos=vector.step(action);info=infos[0];steps+=1
                invalid+=int('error' in info['action_result'])
                if name=='build' and first_build is None:first_build=steps
                if info['kills']>0 and first_kill is None:first_kill=steps
                if done[0]:
                    assert info['end_reason'] in ('castle_destroyed','time_limit')
                    rows.append({'python_seed':seed,'game_seed':info['seed'],'steps':steps,'invalid_actions':invalid,
                        'action_counts':counts,'first_build_step':first_build,'first_kill_step':first_kill,
                        **{k:info[k] for k in ('wave','contiguous_cleared','end_reason','kills','hp','leaks','damage_taken','reward_totals')}})
                    break
        s=summarize(rows,'control' if meta['initialization']=='basic' else 'imitation')
        write_json(path,{'model':str(run),'input_scaling':meta['input_scaling'],'schema':meta['schema'],
            'stage':stage,'episodes':rows,'summary':s})
        print(stage,key,json.dumps(s),flush=True)
        return s
    finally:vector.close()

def accuracy(model,observations,masks,labels):
    total=0.;correct=0;nonwait=0;nonwait_correct=0
    with torch.inference_mode():
        for start in range(0,len(labels),512):
            end=start+512
            dist=model.policy.get_distribution(observations[start:end],masks[start:end])
            target=labels[start:end]
            total-=float(dist.log_prob(target).sum())
            matches=dist.get_actions(deterministic=True)==target
            correct+=int(matches.sum());nonwait+=int((target!=0).sum())
            nonwait_correct+=int((matches&(target!=0)).sum())
    return {'accuracy':correct/len(labels),'nonwait_accuracy':nonwait_correct/nonwait,'cross_entropy':total/len(labels)}

def train_job(architecture,seed,mode):
    torch.set_num_threads(1)
    key=f'{architecture}-{seed}-{mode}';run=BASE/'runs'/key;initial=BASE/'initial'/key
    if (run/'manifest.json').exists():
        meta=read(run/'manifest.json');assert meta['status']=='complete'
        return key,{'training':meta,'development':evaluation(run,key,'development',310000,10)}
    run.mkdir(parents=True,exist_ok=False);initial.mkdir(parents=True,exist_ok=False)
    config=deepcopy(CONFIG);config['seed']=seed
    write_json(run/'config.json',config)
    vector=DummyVecEnv([lambda:Monitor(FixedScaleEnv(**config['env']),str(run/'episodes.monitor.csv'),
        info_keywords=('contiguous_cleared','wave','leaks','end_reason'))])
    began=time.perf_counter();logger=None
    try:
        raw=vector.envs[0].unwrapped
        signature=environment_signature(raw)
        policy=HierarchicalPolicy if architecture=='hierarchy' else 'MlpPolicy'
        kwargs={'action_table':raw.actions} if architecture=='hierarchy' else {}
        model=MaskablePPO(policy,vector,policy_kwargs=kwargs,seed=seed,device='cpu',verbose=0,**config['ppo'])
        original={k:v.detach().clone() for k,v in model.policy.state_dict().items()}
        initial_hash=weight_hash(model.policy)
        imitation={'updates':0,'samples':0,'wall_seconds':0.,'validation':None}
        if mode=='imitation':
            start=time.perf_counter()
            training=np.load(BASE/'data/teacher-training.npz');validation=np.load(BASE/'data/teacher-validation.npz')
            assert set(training['episode_ids']).isdisjoint(validation['episode_ids'])
            scale=feature_scales(raw.feature_names)
            observations=torch.from_numpy(np.clip(training['observations']/scale,-20,20).astype(np.float32))
            labels=torch.from_numpy(training['labels']);masks=training['masks']
            waits=np.flatnonzero(training['labels']==0);other=np.flatnonzero(training['labels']!=0)
            actor=list(model.policy.mlp_extractor.policy_net.parameters())+list(model.policy.action_net.parameters())
            optimizer=torch.optim.Adam(actor,lr=.001);rng=np.random.default_rng(seed)
            for update in range(2000):
                ids=np.concatenate((rng.choice(waits,128),rng.choice(other,128)))
                distribution=model.policy.get_distribution(observations[ids],masks[ids])
                loss=-distribution.log_prob(labels[ids]).mean()
                optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(actor,1.);optimizer.step()
            for k,v in model.policy.state_dict().items():
                if 'value_net' in k:assert torch.equal(v,original[k]),k
            assert len(model.policy.optimizer.state)==0
            valobs=torch.from_numpy(np.clip(validation['observations']/scale,-20,20).astype(np.float32))
            imitation={'updates':2000,'batch_size':256,'balanced_wait_nonwait':True,'samples':len(labels),
                'sample_presentations':512000,'wall_seconds':time.perf_counter()-start,
                'training':accuracy(model,observations,masks,labels),
                'validation':accuracy(model,valobs,validation['masks'],torch.from_numpy(validation['labels']))}
        init_meta={'status':'complete','stage':'initial','architecture':architecture,'schema':schema(architecture),
            'initialization':mode,'seed':seed,'initial_random_weights_sha256':initial_hash,
            'input_scaling':read(BASE/'feature-scaling.json'),'environment':signature,'imitation':imitation,
            'algorithm':'MaskablePPO','actual_timesteps':0,'config':config}
        model.save(initial/'model.zip');write_json(initial/'manifest.json',init_meta)
        initial_result=evaluation(initial,key,'initial',310000,3)
        logger=configure(str(run),['csv']);model.set_logger(logger)
        print('TRAIN',key,'131072 steps',flush=True)
        callback=CheckpointCallback(32768,str(run/'checkpoints'),name_prefix='ppo')
        training_start=time.perf_counter()
        model.learn(config['total_timesteps'],callback=callback)
        training_seconds=time.perf_counter()-training_start
        assert model.num_timesteps==131072 and model.gamma==model.rollout_buffer.gamma==.99
        model.save(run/'model.zip')
        meta={**init_meta,'stage':'trained','actual_timesteps':model.num_timesteps,'added_timesteps':model.num_timesteps,
            'parent_initialization':str(initial),'initial_evaluation':initial_result,
            'runtime':runtime_versions(),'created_at':datetime.now().isoformat(),
            'wall_seconds':time.perf_counter()-began,'ppo_wall_seconds':training_seconds,
            'parameters':sum(p.numel() for p in model.policy.parameters()),'conditional_logits':model.policy.action_net.out_features,
            'new_source_sha256':{name:sha(ENGINE/'ml'/name) for name in ('hierarchical.py','fixed_env.py')},
            'trained_weights_sha256':weight_hash(model.policy)}
        write_json(run/'manifest.json',meta)
    finally:
        if logger is not None:logger.close()
        vector.close()
    development=evaluation(run,key,'development',310000,10)
    write_json(BASE/f'next-after-{key}.json',{'status':'planned','development':development,
        'reason':'Assess whether architecture learns construction and higher waves under unchanged reward',
        'next':'Compare all architecture/initialization pairs before changing reward. If both stall, separate exploration or potential-shaping experiments from architecture changes.',
        'proposed_new_training_seeds':[47,48,49],'development_game_seeds':[330000,330009],
        'confirmation_game_seeds':[340000,340019],'proposed_steps_per_run':131072,
        'criterion':'same median >=80% tier-band rule, no censoring, beginner basic only'})
    return key,{'training':meta,'development':development}

def confirmation_job(key):return key,evaluation(BASE/'runs'/key,key,'confirmation',320000,20)

def report(state):
    lines=['**PPO 계층형 행동 직접 학습 비교 보고서**','',f"상태: {state['status']}",'',
        '목표: 기본 초기화 초급 20–25, 중급 30–35, 고급 40 이상. 주 지표는 실제 연속 완료 웨이브다. 누수가 있어도 웨이브 종료는 완료에 포함되며, 누수·성 피해를 별도로 기록한다. 함락까지 측정하고 제한 종료는 하한으로 표시한다.',
        '', '**이번 변경과 비교 조건**','',
        '- flat은 기존 173개 행동에 각각 점수를 내는 구조다. hierarchy는 대기/건설/강화·수리/경제·연구/전투/판매 6개 상위 선택과 조건부 하위 선택을 직접 학습한다. 건설은 타워 종류 5개 → 위치 26개다. 숫자 순서로 5개씩 묶는 추가 단계는 채택하지 않았다.',
        '- 계층 구조의 내부 노드 11개에서 총 183개 조건부 로짓을 출력한다. 가능한 최종 게임 행동은 173개로 동일하다. 모든 선택이 끝나면 기존 엔진 행동 한 개를 실행하며 추가 시간은 흐르지 않는다. 상위 선택을 직접 배우므로 기존 flat 확률 합산 진단과 구분된다.',
        '- PPO는 경로상 조건부 로그 확률의 합을 최종 행동의 로그 확률로 사용한다. 엔트로피는 173개 최종 행동의 결합 분포에서 정확히 계산하며, 도달할 수 없는 분기의 기여는 0이다. 결정적 평가는 각 단계의 최빈값을 순서대로 고른다. flat의 결정적 평가는 전체 최빈값이다. 따라서 구조와 그에 맞는 실행 방식의 비교다.',
        '- 관측은 고정 단위로 나누고 [-20,20]으로 제한한다. 시간 12000, 금 1000, 수정 50, HP 140, 웨이브 50 등 전체 정의를 feature-scaling.json에 사전 기록했다. 데이터에서 학습한 평균/분산은 없으며 기본/모방에 동일하다. 기본 초기화 계열에는 시연의 가중치나 관측 통계가 들어가지 않는다.',
        '- 보상 defense-v1 유지: 처치 +0.01, 웨이브 종료 시 처치 비율 0~1, 성 피해 −0.02/HP, 무효 행동 −0.05, 함락 −10. target_wave=0이라 목표 보너스 없음. gamma 0.99, entropy 계수 0.003, LR 0.0001, rollout 256, batch 64, epoch 4, frame_skip 10, max_ticks 120000 유지.',
        '- 새 학습 시드 44·45·46에서 처음부터 시작한다. flat/계층 × 기본/모방 × 3시드, 12회, 모델별 131,072스텝, 총 1,572,864스텝 계획이다. 같은 구조·같은 시드의 기본/모방 초기 가중치는 같고 모방은 actor만 2,000회 업데이트한다. 서로 다른 구조의 출력 차원과 파라미터 수는 기록한다.',
        '- 모방은 기존 훈련 시연 20에피소드(210000–210019), 검증 5에피소드(211000–211004)만 사용한다. 기존 20웨이브까지의 시연이므로 높은 웨이브 시연을 새로 제공한 것은 아니다. 구조마다 같은 데이터·업데이트 2,000회·배치 256(wait/nonwait 절반)을 사용하고 계산 비용을 별도로 기록한다.',
        '- 초기화 직후 개발 시드 310000–310002로 3판 진단, 학습 후 개발 310000–310009로 10판, 최종 확인 320000–320019로 20판 평가한다. 실제 엔진 uint32 시드는 JSON에 별도 기록한다. 개발 완료 중앙값 합→평균 합으로 기본/모방별 구조를 선정하고, 선택 구조에서 시드를 고른 뒤 독립 최종 확인을 연다.',
        '- 난이도 후보는 최종 완료 중앙값이 목표 구간에 있고 80% 이상이 같은 구간이며 제한 종료가 없어야 한다. 초급은 기본 계열만 허용한다. 512스텝 통합 검증 모델은 실험 학습 예산과 별도이며 실험 초기화에 재사용하지 않았다.',
        '', '|평가|모델|판수|평균 완료|중앙값|최소~최대|최고 시작|제한 종료|',
        '|---|---|---:|---:|---:|---|---:|---:|']
    for stage in ('initial','development','confirmation'):
        for key,s in state.get(stage,{}).items():
            lines.append(f"|{stage}|{key}|{s['episodes']}|{s['mean_cleared']:.2f}|{s['median_cleared']:.1f}|{s['min_cleared']}~{s['max_cleared']}|{s['max_started']}|{s['censored']}|")
    lines+=['',f"개발 선택: {state.get('selection',{})}",'',
        '**정확한 로컬 파일과 상호 작용**','',
        f'- 제어·초기화·학습·평가·보고: `{WORK / "ppo_hierarchy_train.py"}`.',
        f'- 조건부 분포/정책: `{ENGINE / "ml/hierarchical.py"}`. 기존 MaskablePPO가 이 정책의 결합 로그 확률과 엔트로피를 받아 PPO 비율과 클리핑을 계산한다.',
        f'- 고정 입력 래퍼: `{ENGINE / "ml/fixed_env.py"}` → `{ENGINE / "ml/env.py"}` → 표준입출력 JSONL → Node `{ENGINE / "ml/bridge.mjs"}` → `{ENGINE / "lib/game-engine.js"}`와 trees.js. 엔진이 행동 하나와 0.1초 tick 10회를 처리해 관측·보상·행동 유효성을 반환한다.',
        f'- 모델/초기화 모델/체크포인트/학습 CSV/평가 JSON/다음 계획: `{BASE}`.',
        f'- 사용 시연 사본: `{BASE / "data"}`. 원본은 `{WORK / "ppo-next/learning"}`의 teacher-training/validation.npz와 JSON이다.',
        f'- 사전 검증: `{WORK / "ppo_hierarchy_verify.py"}` → `{BASE / "verification.json"}`. 확률 합·정확한 결합 엔트로피·조건부 로그 확률·무효 행동 0·유한 경사·비활성 분기 경사·실제 게임 동일 tick·512스텝 PPO·저장/재로드를 검증했다.',
        f'- 보고서: `{OUT / "PPO_계층행동_직접학습_보고서.md"}`.',
        '기존 모델·게임 개발 폴더의 소스는 변경하지 않았다. 새 엔진 사본에서 정책·입력 래퍼만 추가하고 원래 게임 규칙 지문을 대조했다.']
    (OUT/'PPO_계층행동_직접학습_보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

def main():
    assert read(BASE/'verification.json')['status']=='passed'
    state_path=BASE/'summary.json'
    if state_path.exists():raise RuntimeError('Round already exists; inspect before resuming')
    state={'status':'running','started':datetime.now().isoformat(),'runs':{},'initial':{},'development':{},'confirmation':{}}
    write_json(BASE/'preregistered-plan.json',{'config':CONFIG,'architectures':['flat','hierarchy'],'initializations':['basic','imitation'],
        'training_seeds':[44,45,46],'total_training_steps':1572864,'parallel_workers':2,
        'development_seeds':[310000,310009],'confirmation_seeds':[320000,320019],
        'selection':'per initialization: maximum sum development medians over 3 seeds, then means; flat breaks exact ties',
        'input_scaling':read(BASE/'feature-scaling.json'),'entropy':'exact final joint action entropy',
        'deterministic':'flat global argmax; hierarchy conditional greedy',
        'teacher_data':{p.name:sha(p) for p in (BASE/'data').iterdir() if p.is_file()}})
    write_json(state_path,state);report(state)
    try:
        with ProcessPoolExecutor(max_workers=2) as pool:
            jobs=[pool.submit(train_job,architecture,seed,mode) for seed in (44,45,46) for architecture in ('flat','hierarchy') for mode in ('basic','imitation')]
            for job in as_completed(jobs):
                key,r=job.result();state['runs'][key]=r['training'];state['initial'][key]=r['training']['initial_evaluation'];state['development'][key]=r['development']
                write_json(state_path,state);report(state)
            for arch in ('flat','hierarchy'):
                for seed in (44,45,46):
                    a=state['runs'][f'{arch}-{seed}-basic'];b=state['runs'][f'{arch}-{seed}-imitation']
                    assert a['initial_random_weights_sha256']==b['initial_random_weights_sha256']
            state['selection']={}
            for mode in ('basic','imitation'):
                def rank(arch):
                    ss=[state['development'][f'{arch}-{s}-{mode}'] for s in (44,45,46)]
                    return sum(s['median_cleared'] for s in ss),sum(s['mean_cleared'] for s in ss)
                arch=max(('flat','hierarchy'),key=rank)
                key=max((f'{arch}-{s}-{mode}' for s in (44,45,46)),key=lambda k:(state['development'][k]['median_cleared'],state['development'][k]['mean_cleared']))
                state['selection'][mode]=key
            write_json(BASE/'selection-before-confirmation.json',state)
            write_json(state_path,state);report(state)
            jobs=[pool.submit(confirmation_job,key) for key in state['runs']]
            for job in as_completed(jobs):
                key,s=job.result();state['confirmation'][key]=s
                write_json(state_path,state);report(state)
        state.update(status='complete',finished=datetime.now().isoformat());write_json(state_path,state);report(state)
        print('HIERARCHY TRAINING ROUND COMPLETE',flush=True)
    except BaseException as exc:
        state.update(status='failed',error=repr(exc));write_json(state_path,state);report(state);raise
if __name__=='__main__':main()
