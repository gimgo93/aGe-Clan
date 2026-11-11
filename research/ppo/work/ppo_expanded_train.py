"""Shared expanded demonstrations, validation-selected imitation, then paired PPO."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from collections import defaultdict,Counter
from copy import deepcopy
from datetime import datetime
from pathlib import Path
import hashlib,json,sys,time
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-expanded-demo-v2';ENGINE=BASE/'engine';OUT=ROOT/'outputs'
sys.path.insert(0,str(ENGINE))
from ml.hierarchical import HierarchicalPolicy,NAME_GROUP
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.experiment import environment_signature,write_json,runtime_versions
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.logger import configure
CONFIG={'total_timesteps':131072,'env':{'frame_skip':10,'max_ticks':120000,'target_wave':0,'reward_mode':'defense-v1'},
        'ppo':{'n_steps':256,'batch_size':64,'n_epochs':4,'learning_rate':.0001,'gamma':.99,'ent_coef':.003}}
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def weights(policy):return hashlib.sha256(b''.join(v.detach().numpy().tobytes() for v in policy.state_dict().values())).hexdigest()
def stats(rows,mode):
    x=[r['contiguous_cleared'] for r in rows];c=sum(r['end_reason']=='time_limit' for r in rows)
    eligible=[]
    for tier,lo,hi in [('beginner',20,25),('intermediate',30,35),('advanced',40,float('inf'))]:
        if (mode=='basic' or tier!='beginner') and not c and lo<=np.median(x)<=hi and sum(lo<=v<=hi for v in x)/len(x)>=.8:eligible.append(tier)
    return {'episodes':len(rows),'mean':float(np.mean(x)),'median':float(np.median(x)),
            'min':min(x),'max':max(x),'max_started':max(r['wave'] for r in rows),'censored':c,
            'invalid':sum(r['invalid_actions'] for r in rows),'eligible_tiers':eligible}

def rollout(model,key,mode,stage,start,count):
    path=BASE/f'{stage}-{key}.json'
    if path.exists():return read(path)['summary']
    vector=DummyVecEnv([lambda:FixedScaleEnv(**CONFIG['env'])]);rows=[]
    try:
        for seed in range(start,start+count):
            vector.seed(seed);obs=vector.reset();steps=invalid=0;counts=Counter();types=Counter()
            assert vector.reset_infos[0]['seed'] not in set(range(410000,410036))|set(range(411000,411012))
            while True:
                mask=vector.envs[0].action_masks()
                action,_=model.predict(obs,deterministic=True,action_masks=mask[None,:]);a=int(action[0]);assert mask[a]
                cmd=vector.envs[0].unwrapped.actions[a];counts[cmd['name']]+=1
                if cmd['name']=='build':types[cmd['args'][0]]+=1
                obs,r,done,infos=vector.step(action);info=infos[0];steps+=1;invalid+=int('error' in info['action_result'])
                if done[0]:
                    assert info['end_reason'] in ('castle_destroyed','time_limit')
                    rows.append({'python_seed':seed,'game_seed':info['seed'],'steps':steps,'invalid_actions':invalid,
                        'action_counts':dict(counts),'build_type_counts':dict(types),
                        **{k:info[k] for k in ('wave','contiguous_cleared','end_reason','hp','kills','leaks','reward_totals')}})
                    break
        result={'stage':stage,'student_policy':key,'episodes':rows,'summary':stats(rows,mode)}
        write_json(path,result);print(stage,key,json.dumps(result['summary']),flush=True)
        return result['summary']
    finally:vector.close()

class Sampler:
    """Identical stratified sample schedule for both architectures at each seed."""
    def __init__(self,data,actions,seed):
        self.rng=np.random.default_rng(seed);groups=defaultdict(list)
        for i,(label,wave) in enumerate(zip(data['labels'],data['waves'])):
            a=actions[int(label)];root=NAME_GROUP[a['name']]
            subtype=a['args'][0] if a['name']=='build' else a['name']+str(a.get('args',[]))
            groups[(root,subtype,min(int(wave)//10,4))].append(i)
        self.ids=[np.asarray(v,dtype=np.int64) for v in groups.values()];keys=list(groups)
        self.wait=np.asarray([i for i,k in enumerate(keys) if k[0]==0]);self.other=np.asarray([i for i,k in enumerate(keys) if k[0]!=0])
        roots=set(keys[i][0] for i in self.other)
        subs={r:set(keys[i][1] for i in self.other if keys[i][0]==r) for r in roots}
        bands={(r,s):sum(k[0]==r and k[1]==s for k in keys) for r in roots for s in subs[r]}
        self.prob=np.asarray([1/len(roots)/len(subs[keys[i][0]])/bands[keys[i][:2]] for i in self.other]);self.prob/=self.prob.sum()
    def sample(self):
        strata=np.concatenate((self.rng.choice(self.wait,128),self.rng.choice(self.other,128,p=self.prob)))
        result=np.empty(256,dtype=np.int64)
        for group in np.unique(strata):
            positions=np.flatnonzero(strata==group);result[positions]=self.rng.choice(self.ids[group],len(positions))
        return result

def metrics(model,obs,data):
    labels=data['labels'];losses=[];predictions=[];root_ok=[];type_ok=[];pad_ok=[]
    with torch.inference_mode():
        for i in range(0,len(labels),512):
            y=torch.from_numpy(labels[i:i+512]);dist=model.policy.get_distribution(obs[i:i+512],data['masks'][i:i+512])
            losses.extend((-dist.log_prob(y)).numpy().tolist());predictions.extend(dist.get_actions(deterministic=True).numpy().tolist())
            if isinstance(model.policy,HierarchicalPolicy):
                choice=dist.conditional.argmax(-1);nodes=dist.path_nodes[y];children=dist.path_children[y]
                ok=choice.gather(1,nodes)==children
                root_ok.extend(ok[:,0].numpy().tolist())
                builds=(y>=1)&(y<=130)
                type_ok.extend(ok[builds,1].numpy().tolist());pad_ok.extend(ok[builds,2].numpy().tolist())
    labels=np.asarray(labels);losses=np.asarray(losses);predictions=np.asarray(predictions)
    # Balance the validation loss over engine command kinds, not all waiting frames.
    names=np.asarray([NAME_GROUP[model.get_env().envs[0].unwrapped.actions[int(y)]['name']] for y in labels])
    result={'accuracy':float((predictions==labels).mean()),'nonwait_accuracy':float((predictions[labels!=0]==labels[labels!=0]).mean()),
            'joint_nll':float(losses.mean()),'macro_root_nll':float(np.mean([losses[names==r].mean() for r in np.unique(names)]))}
    if root_ok:result.update(root_accuracy=float(np.mean(root_ok)),teacher_forced_build_type_accuracy=float(np.mean(type_ok)),teacher_forced_pad_accuracy=float(np.mean(pad_ok)))
    return result

def train_job(arch,seed,mode):
    torch.set_num_threads(1);key=f'{arch}-{seed}-{mode}';run=BASE/'runs'/key;initial=BASE/'initial'/key
    run.mkdir(parents=True,exist_ok=False);initial.mkdir(parents=True,exist_ok=False)
    config=deepcopy(CONFIG);config['seed']=seed
    vector=DummyVecEnv([lambda:Monitor(FixedScaleEnv(**config['env']),str(run/'episodes.monitor.csv'),info_keywords=('contiguous_cleared','wave','leaks','end_reason'))])
    began=time.perf_counter();logger=None
    try:
        raw=vector.envs[0].unwrapped;actions=raw.actions
        model=MaskablePPO(HierarchicalPolicy if arch=='hierarchy' else 'MlpPolicy',vector,
            policy_kwargs={'action_table':actions} if arch=='hierarchy' else {},seed=seed,device='cpu',verbose=0,**config['ppo'])
        original={k:v.detach().clone() for k,v in model.policy.state_dict().items()};random_hash=weights(model.policy)
        imitation={'updates_performed':0,'selected_update':0,'history':[]}
        if mode=='imitation':
            print('BC START',key,flush=True)
            training=np.load(BASE/'data/teacher-training.npz');validation=np.load(BASE/'data/teacher-validation.npz')
            scale=feature_scales(raw.feature_names)
            obs=torch.from_numpy(np.clip(training['observations']/scale,-20,20).astype(np.float32));labels=torch.from_numpy(training['labels'])
            valobs=torch.from_numpy(np.clip(validation['observations']/scale,-20,20).astype(np.float32))
            sampler=Sampler(training,actions,seed)
            actor=list(model.policy.mlp_extractor.policy_net.parameters())+list(model.policy.action_net.parameters())
            optimizer=torch.optim.Adam(actor,lr=.001);best=(-float('inf'),)*3;best_state=None;stale=0;history=[];bc_start=time.perf_counter()
            for update in range(1,8001):
                model.policy.set_training_mode(True);ids=sampler.sample()
                dist=model.policy.get_distribution(obs[ids],training['masks'][ids]);loss=-dist.log_prob(labels[ids]).mean()
                optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(actor,1.);optimizer.step()
                if update not in (500,1000,2000,4000,8000):continue
                print('BC CHECKPOINT',key,update,flush=True)
                fit=metrics(model,valobs,validation)
                game=rollout(model,key,mode,f'bc-u{update}',412000,5)
                score=(game['median'],game['mean'],-fit['macro_root_nll'])
                history.append({'update':update,'validation':fit,'validation_game':game,'elapsed_seconds':time.perf_counter()-bc_start})
                checkpoint=BASE/'bc-checkpoints'/key/f'u{update}';checkpoint.mkdir(parents=True)
                model.save(checkpoint/'model.zip');write_json(checkpoint/'validation.json',history[-1])
                write_json(run/'bc-progress.json',{'status':'running','history':history,'latest_update':update})
                if score>best:
                    best=score;best_state={k:v.detach().clone() for k,v in model.policy.state_dict().items()};selected=update;stale=0
                else:stale+=1
                if update>=4000 and stale>=2:break
            assert best_state is not None
            model.policy.load_state_dict(best_state)
            for k,v in model.policy.state_dict().items():
                if 'value_net' in k:assert torch.equal(v,original[k])
            assert not model.policy.optimizer.state
            imitation={'updates_performed':update,'selected_update':selected,'history':history,
                'wall_seconds':time.perf_counter()-bc_start,'dataset_sha256':digest(BASE/'data/teacher-training.npz'),
                'validation_dataset_sha256':digest(BASE/'data/teacher-validation.npz'),'sample_presentations':update*256}
            write_json(run/'bc-progress.json',{'status':'complete',**imitation})
        meta={'status':'complete','stage':'initial','architecture':arch,'initialization':mode,'seed':seed,'config':config,
            'schema':'hierarchical-v1' if arch=='hierarchy' else 'flat-173','input_scaling':read(BASE/'feature-scaling.json'),
            'environment':environment_signature(raw),'initial_random_weights_sha256':random_hash,'imitation':imitation,
            'actual_timesteps':0,'algorithm':'MaskablePPO','runtime':runtime_versions()}
        model.save(initial/'model.zip');write_json(initial/'manifest.json',meta)
        initial_score=rollout(model,key,mode,'initial',412000,5)
        torch.manual_seed(seed+100000);np.random.seed(seed+100000)
        logger=configure(str(run),['csv']);model.set_logger(logger)
        print('PPO START',key,flush=True)
        model.learn(131072,callback=CheckpointCallback(32768,str(run/'checkpoints'),name_prefix='ppo'))
        assert model.num_timesteps==131072
        model.save(run/'model.zip');meta.update(stage='trained',actual_timesteps=131072,initial_score=initial_score,
            wall_seconds=time.perf_counter()-began,parameters=sum(p.numel() for p in model.policy.parameters()),trained_weights_sha256=weights(model.policy),
            source_sha256={n:digest(ENGINE/'ml'/n) for n in ('hierarchical.py','fixed_env.py')})
        write_json(run/'manifest.json',meta);write_json(run/'config.json',config)
        development=rollout(model,key,mode,'development',420000,10)
        write_json(BASE/f'next-after-{key}.json',{'status':'planned','development':development,
            'hypothesis':'Inspect selected BC checkpoint vs PPO and rare-action coverage before more training',
            'seeds':[49,50],'budget_per_run':131072,'development_game_seeds':[440000,440009],
            'confirmation_game_seeds':[450000,450019],'criterion':'same tier-band median and >=80% rule; no censoring; beginner basic only'})
        return key,{'training':meta,'development':development}
    finally:
        if logger:logger.close()
        vector.close()

def confirmation_job(key):
    meta=read(BASE/'runs'/key/'manifest.json');torch.set_num_threads(1)
    with FixedScaleEnv(**CONFIG['env']) as env:
        model=MaskablePPO.load(BASE/'runs'/key/'model.zip',env=env,device='cpu')
        assert weights(model.policy)==meta['trained_weights_sha256']
        return key,rollout(model,key,meta['initialization'],'confirmation',430000,20)

def report(state):
    audit=read(BASE/'data-audit.json')
    lines=['**확장 시연·검증 기반 초기화·PPO 진행 보고서**','',f"상태: {state['status']}. 시작 {state['started']}.",'',
        '기존/계층 구조에 정확히 같은 새 시연과 추출 규칙을 제공한다. 기본 초기화 대조군에는 시연이나 시연 통계가 들어가지 않는다. 교사 성능과 PPO 학생 성능을 구분한다.',
        '계층형은 상위 선택→타워 종류→위치의 조건부 로그 확률 합으로 모방 손실을 계산한다. 검증에서 상위·타워·위치 정확도를 따로 기록한다. 최종 행동의 결합 확률을 PPO에 사용한다.',
        '대기 50%·나머지 50% 배치이며, 나머지는 상위 행동 종류→세부 종류→웨이브 구간을 고르게 추출한다. 기존 구조에도 같은 배치를 준다. 모방 체크포인트 500/1000/2000/4000/8000에서 같은 학생 검증 게임 5판과 별도 시연 검증 손실을 비교한다. 최소 4000 이후 두 차례 개선이 없으면 조기 종료한다. 검증 게임 중앙값→평균→종류 균형 NLL로 모델을 고른다. 실제 수행 업데이트와 선택 업데이트는 별도다.',
        '학습 시드47·48, 기존/계층×기본/새 모방8조건, 각PPO131072스텝(총1048576). 입력148고정 단위, 행동173, defense-v1 보상, gamma0.99, entropy0.003, LR0.0001, rollout256/batch64/epoch4를 유지한다. 목표 종료0·최대120000틱이며 제한 종료는 최대 성과의 하한이다.',
        '개발 Python 시드420000–420009, 최종430000–430019. 시연 직접 엔진 시드410000–410035/411000–411011, 학생 초기화 선택 Python시드412000–412004와 구분한다. 목표는 기본 초급20–25·중급30–35·고급40이상, 중앙값/80%구간/제한종료없음 조건이다.',
        '새 시연과 초기화 선택 절차, 학습 시드가 이전 회차와 함께 바뀌므로 과거 결과와의 차이를 새 시연만의 인과 효과라고 부르지 않는다. 이번 회차 안의 두 구조 비교가 주 분석이다. 교사 ID는 학생에게 주지 않고 미래 RNG도 사용하지 않는다. 교사의 일부 위치 판단은 학생의 구간별 관측보다 정밀할 수 있다.',
        '',f"훈련 시연 {audit['data']['training']['episodes']}판/{audit['data']['training']['samples']}상태, 검증 {audit['data']['validation']['episodes']}판/{audit['data']['validation']['samples']}상태.",
        f"훈련 타워별 건설 {audit['data']['training']['build_type_counts']}.",'',
        '|평가|조건|판수|평균 완료|중앙값|범위|최고 시작|제한 종료|',
        '|---|---|---:|---:|---:|---|---:|---:|']
    for stage in ('development','confirmation'):
        for key,s in state.get(stage,{}).items():lines.append(f"|{stage}|{key}|{s['episodes']}|{s['mean']:.2f}|{s['median']}|{s['min']}~{s['max']}|{s['max_started']}|{s['censored']}|")
    lines+=['',f"개발 선택: {state.get('selection',{})}",'',
        '**실제 파일과 상호 작용**','',
        f'- 제어·초기화·학습·평가·자동 보고: `{WORK / "ppo_expanded_train.py"}`.',
        f'- 교사·수집: `{BASE / "teachers.mjs"}`, `{BASE / "collect.mjs"}`. Node의 TrainingSession이 `{ENGINE / "lib/game-engine.js"}`를 실행해 원본 관측/마스크/정답을 바이너리로 저장한다.',
        f'- 변환·감사: `{WORK / "ppo_expanded_prepare.py"}` → `{BASE / "data-audit.json"}`와 data/teacher-training.npz·teacher-validation.npz. 두 구조가 동일 SHA256의 파일을 읽는다.',
        f'- 학생: `{ENGINE / "ml/hierarchical.py"}`·fixed_env.py → env.py → JSONL → bridge.mjs → 게임 엔진. 배우는 단계와 별개로 게임 행동 한 번당0.1초 tick10회만 진행한다.',
        f'- 모델/모방 체크포인트/학습 CSV/검증 게임/최종 평가/다음 계획: `{BASE}`. 모방 중 진행은 각runs/조건/bc-progress.json, PPO 중 진행은 progress.csv에 기록한다.',
        f'- 보고서: `{OUT / "PPO_확장시연_학습진행보고서.md"}`. 프로세스가 결과 도착 시 갱신한다. 실행 실패 시 상태와 오류를 기록한다.']
    if state.get('errors'):lines+=['',f"오류: {state['errors']}"]
    (OUT/'PPO_확장시연_학습진행보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

def main():
    assert read(BASE/'data-audit.json')['status']=='passed'
    assert read(BASE/'initialization-verification.json')['status']=='passed'
    assert not (BASE/'summary.json').exists(),'Existing round: inspect before restarting'
    state={'status':'running','started':datetime.now().isoformat(),'runs':{},'development':{},'confirmation':{}}
    write_json(BASE/'preregistered-plan.json',{'config':CONFIG,'training_seeds':[47,48],'architectures':['flat','hierarchy'],
        'initializations':['basic','imitation'],'bc_checkpoints':[500,1000,2000,4000,8000],
        'bc_selection':'student validation median, mean, negative macro-root NLL; min4000 before patience2 early stop',
        'batch':'half wait; half uniformly by root/subtype/wave band; identical RNG seed schedules',
        'student_validation_python_seeds':[412000,412004],'development_python_seeds':[420000,420009],
        'confirmation_python_seeds':[430000,430019],'ppo_total':1048576,
        'datasets':{s:a['npz_sha256'] for s,a in read(BASE/'data-audit.json')['data'].items()}})
    write_json(BASE/'summary.json',state);report(state)
    try:
        with ProcessPoolExecutor(max_workers=2) as pool:
            pending={pool.submit(train_job,arch,seed,mode):(arch,seed,mode) for mode in ('imitation','basic') for seed in (47,48) for arch in ('flat','hierarchy')}
            for future in as_completed(pending):
                try:key,r=future.result()
                except BaseException as exc:
                    state.update(status='failed',errors={str(pending[future]):repr(exc)})
                    write_json(BASE/'summary.json',state);report(state)
                    for f in pending:f.cancel()
                    raise
                state['runs'][key]=r['training'];state['development'][key]=r['development']
                write_json(BASE/'summary.json',state);report(state)
            for arch in ('flat','hierarchy'):
                for seed in (47,48):assert state['runs'][f'{arch}-{seed}-basic']['initial_random_weights_sha256']==state['runs'][f'{arch}-{seed}-imitation']['initial_random_weights_sha256']
            state['selection']={}
            for mode in ('basic','imitation'):
                def rank(arch):
                    ss=[state['development'][f'{arch}-{seed}-{mode}'] for seed in (47,48)]
                    return sum(s['median'] for s in ss),sum(s['mean'] for s in ss)
                arch=max(('flat','hierarchy'),key=rank)
                state['selection'][mode]=max((f'{arch}-{seed}-{mode}' for seed in (47,48)),key=lambda k:(state['development'][k]['median'],state['development'][k]['mean']))
            write_json(BASE/'selection-before-confirmation.json',state)
            for future in as_completed([pool.submit(confirmation_job,k) for k in state['runs']]):
                key,s=future.result();state['confirmation'][key]=s;write_json(BASE/'summary.json',state);report(state)
        state.update(status='complete',finished=datetime.now().isoformat());write_json(BASE/'summary.json',state);report(state)
        write_json(BASE/'next-round-plan.json',{'status':'planned_not_started','basis':state['selection'],
            'next':'Freeze qualifying candidates for more independent evaluation. If imitation regresses, compare smaller actor learning rate on same initial checkpoints. If basic stalls, audit decoding and exploration before reward changes.',
            'seeds':[49,50],'budget_per_run':131072,'development_game_seeds':[440000,440009],'confirmation_game_seeds':[450000,450019]})
        print('EXPANDED DEMO ROUND COMPLETE',flush=True)
    except BaseException as exc:
        state.update(status='failed',errors=state.get('errors',{'exception':repr(exc)}));write_json(BASE/'summary.json',state);report(state);raise
if __name__=='__main__':main()
