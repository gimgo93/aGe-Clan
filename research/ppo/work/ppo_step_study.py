"""Frozen-data, paired-parent PPO budget study; local CPU, no game deployment."""
from pathlib import Path
from collections import Counter,defaultdict
from concurrent.futures import ProcessPoolExecutor,as_completed
from copy import deepcopy
from datetime import datetime
import sys,json,time,hashlib
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구');BASE=ROOT/'work/ppo-step-budget-v1';ENGINE=BASE/'engine';OUT=ROOT/'outputs'
sys.path.insert(0,str(ENGINE))
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.hierarchical import HierarchicalPolicy,NAME_GROUP
from ml.experiment import environment_signature,runtime_versions
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.logger import configure
ENV={'frame_skip':10,'max_ticks':120000,'target_wave':0,'reward_mode':'defense-v1'}
PPO={'learning_rate':.0001,'n_steps':256,'batch_size':64,'n_epochs':4,'gamma':.99,'ent_coef':.003}
BUDGETS=[65536,131072,262144]
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,data):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for attempt in range(30):
        try:tmp.replace(p);break
        except PermissionError:
            if attempt==29:raise
            time.sleep(.05)
def weights(policy):return hashlib.sha256(b''.join(v.detach().cpu().numpy().tobytes() for v in policy.state_dict().values())).hexdigest()
def stats(rows,mode):
    x=np.array([r['contiguous_cleared'] for r in rows]);n=len(rows);c=sum(r['end_reason']=='time_limit' for r in rows);invalid=sum(r['invalid_actions'] for r in rows)
    eligible=[]
    for tier,lo,hi in [('beginner',20,25),('intermediate',30,35),('advanced',40,float('inf'))]:
        if (mode=='basic' or tier!='beginner') and not c and not invalid and lo<=np.median(x)<=hi and np.mean((x>=lo)&(x<=hi))>=.8:eligible.append(tier)
    diversity=sum(r['nonwait_command_kinds']>=5 and r['nonwait_root_kinds']>=3 and len(r['build_type_counts'])>=2 for r in rows)
    concentration=sum(r['max_nonwait_command_share']<=.8 for r in rows);distinct=len({r['sequence_sha256'] for r in rows})
    return {'episodes':n,'mean':float(x.mean()),'median':float(np.median(x)),'sd':float(x.std(ddof=1)) if n>1 else 0.,'p10':float(np.quantile(x,.1)),
        'min':int(x.min()),'max':int(x.max()),'max_started':max(r['wave'] for r in rows),'in_middle':int(((x>=30)&(x<=35)).sum()),
        'censored':c,'invalid':invalid,'eligible_tiers':eligible,'diversity_games':diversity,'concentration_games':concentration,'distinct_sequences':distinct,
        'diversity_pass':diversity/n>=.8 and concentration/n>=.8 and distinct>=min(5,n),'mean_wait_share':float(np.mean([r['wait_share'] for r in rows]))}

def evaluate(model_or_path,key,mode,stage,start,count,budget):
    path=BASE/'evaluations'/f'{stage}-{key}-s{budget}.json'
    if path.exists():return read(path)
    torch.set_num_threads(1);model=MaskablePPO.load(model_or_path,device='cpu') if isinstance(model_or_path,(str,Path)) else model_or_path
    began=time.perf_counter();envs=[FixedScaleEnv(**ENV) for _ in range(min(4,count))];rows=[];active={};next_id=0
    def begin(j):
        nonlocal next_id
        seed=start+next_id;next_id+=1;obs,info=envs[j].reset(seed=seed)
        active[j]={'obs':obs,'seed':seed,'counts':Counter(),'types':Counter(),'roots':Counter(),'sequence':[],'steps':0,'invalid':0}
    try:
        for j in range(len(envs)):begin(j)
        while active:
            ids=list(active);obs=np.stack([active[j]['obs'] for j in ids]);masks=np.stack([envs[j].action_masks() for j in ids])
            actions,_=model.predict(obs,deterministic=True,action_masks=masks)
            for k,j in enumerate(ids):
                state=active[j];a=int(actions[k]);assert masks[k,a];cmd=envs[j].unwrapped.actions[a];name=cmd['name'];state['counts'][name]+=1
                if name!='wait':state['roots'][NAME_GROUP[name]]+=1;state['sequence'].append([state['steps'],a])
                if name=='build':state['types'][cmd['args'][0]]+=1
                obs,reward,terminated,truncated,info=envs[j].step(a);state['obs']=obs;state['steps']+=1;state['invalid']+=int('error' in info['action_result'])
                if terminated or truncated:
                    counts=state['counts'];nonwait=state['steps']-counts.get('wait',0)
                    rows.append({'python_seed':state['seed'],'game_seed':info['seed'],'steps':state['steps'],'invalid_actions':state['invalid'],
                        'action_counts':dict(counts),'build_type_counts':dict(state['types']),'root_counts':dict(state['roots']),
                        'nonwait_command_kinds':sum(n!='wait' for n in counts),'nonwait_root_kinds':len(state['roots']),
                        'max_nonwait_command_share':max((v/nonwait for n,v in counts.items() if n!='wait'),default=1.),
                        'wait_share':counts.get('wait',0)/state['steps'],'sequence_sha256':hashlib.sha256(json.dumps(state['sequence']).encode()).hexdigest(),
                        **{n:info[n] for n in ('wave','contiguous_cleared','end_reason','hp','kills','leaks','reward_totals')}})
                    if next_id<count:begin(j)
                    else:del active[j]
        rows.sort(key=lambda r:r['python_seed']);result={'key':key,'initialization':mode,'stage':stage,'budget':budget,'episodes':rows,'summary':stats(rows,mode),'wall_seconds':time.perf_counter()-began}
        write(path,result);print('EVAL',stage,key,budget,json.dumps(result['summary']),flush=True);return result
    finally:
        for env in envs:env.close()

class Sampler:
    """Same seed schedule in both architectures: middle230/reference26, half wait."""
    def __init__(self,data,actions,seed):
        self.rng=np.random.default_rng(seed);groups=defaultdict(list)
        for i,(label,wave,role) in enumerate(zip(data['labels'],data['waves'],data['roles'])):
            a=actions[int(label)];root=NAME_GROUP[a['name']];sub=a['args'][0] if a['name']=='build' else a['name']+str(a.get('args',[]))
            groups[(int(role),root,sub,min(int(wave)//10,4))].append(i)
        self.ids=[np.array(v,dtype=np.int64) for v in groups.values()];keys=list(groups);self.pools={}
        for role in (0,1):
            wait=[i for i,k in enumerate(keys) if k[0]==role and k[1]==0];other=[i for i,k in enumerate(keys) if k[0]==role and k[1]!=0]
            roots={keys[i][1] for i in other};subs={r:{keys[i][2] for i in other if keys[i][1]==r} for r in roots}
            bands={(r,s):sum(k[0]==role and k[1]==r and k[2]==s for k in keys) for r in roots for s in subs[r]}
            p=np.array([1/len(roots)/len(subs[keys[i][1]])/bands[keys[i][1:3]] for i in other]);p/=p.sum()
            self.pools[role]=(wait,other,p)
    def sample(self):
        groups=[]
        for role,n in ((0,115),(1,13)):
            wait,other,p=self.pools[role];groups.extend(self.rng.choice(wait,n));groups.extend(self.rng.choice(other,n,p=p))
        groups=np.array(groups);result=np.empty(256,dtype=np.int64)
        for group in np.unique(groups):
            positions=np.flatnonzero(groups==group);result[positions]=self.rng.choice(self.ids[group],len(positions))
        return result

def validation(model,obs,data,actions):
    losses=[];correct=nonwait_correct=nonwait_n=0;roots=np.array([NAME_GROUP[actions[int(a)]['name']] for a in data['labels']])
    with torch.inference_mode():
        for start in range(0,len(obs),1024):
            y=torch.from_numpy(data['labels'][start:start+1024]);dist=model.policy.get_distribution(obs[start:start+1024],data['masks'][start:start+1024])
            loss=-dist.log_prob(y);pred=dist.get_actions(deterministic=True);losses.extend(loss.cpu().numpy());correct+=int((pred==y).sum());nw=y!=0;nonwait_correct+=int(((pred==y)&nw).sum());nonwait_n+=int(nw.sum())
    losses=np.array(losses);macro=[]
    for role in (0,1):macro.append(float(np.mean([losses[(data['roles']==role)&(roots==r)].mean() for r in np.unique(roots[data['roles']==role])])))
    return {'accuracy':correct/len(obs),'nonwait_accuracy':nonwait_correct/nonwait_n,'macro_role_root_nll':(230*macro[0]+26*macro[1])/256,'role_macro_nll':macro}

class PostUpdateCheckpoints(BaseCallback):
    def __init__(self,run,key):super().__init__();self.run=run;self.key=key;self.saved=[]
    def save(self,budget):
        path=self.run/'checkpoints'/f'ppo_{budget}.zip';path.parent.mkdir(exist_ok=True);self.model.save(path)
        assert self.model._n_updates==budget//PPO['n_steps']*PPO['n_epochs']
        record={'steps':budget,'gradient_epochs':self.model._n_updates,'model_sha256':sha(path),'weights_sha256':weights(self.model.policy),'post_update':True}
        write(path.with_suffix('.json'),record);self.saved.append(record);write(self.run/'checkpoint-progress.json',{'saved':self.saved});print('PPO CHECKPOINT',self.key,budget,flush=True)
    def _on_rollout_start(self):
        if self.num_timesteps in BUDGETS[:-1]:self.save(self.num_timesteps)
    def _on_step(self):return True

def train_job(arch,seed,mode):
    torch.set_num_threads(1);key=f'{arch}-{seed}-{mode}';run=BASE/'runs'/key;run.mkdir(parents=True,exist_ok=False)
    vector=DummyVecEnv([lambda:Monitor(FixedScaleEnv(**ENV),str(run/'episodes.monitor.csv'),info_keywords=('contiguous_cleared','wave','leaks','end_reason'))]);logger=None
    try:
        env=vector.envs[0].unwrapped;actions=env.actions
        model=MaskablePPO(HierarchicalPolicy if arch=='hierarchy' else 'MlpPolicy',vector,policy_kwargs={'action_table':actions} if arch=='hierarchy' else {},seed=seed,device='cpu',verbose=0,**PPO)
        original={k:v.detach().clone() for k,v in model.policy.state_dict().items()};initial_hash=weights(model.policy);bc={'performed_updates':0,'selected_update':0};began=time.perf_counter()
        if mode=='imitation':
            data={k:v for k,v in np.load(BASE/'data/teacher-training.npz').items()};val={k:v for k,v in np.load(BASE/'data/teacher-validation.npz').items()}
            scale=feature_scales(env.feature_names);obs=torch.from_numpy(np.clip(data['observations']/scale,-20,20).astype(np.float32));vo=torch.from_numpy(np.clip(val['observations']/scale,-20,20).astype(np.float32));labels=torch.from_numpy(data['labels'])
            sampler=Sampler(data,actions,seed);actor=list(model.policy.mlp_extractor.policy_net.parameters())+list(model.policy.action_net.parameters());optimizer=torch.optim.Adam(actor,lr=.001)
            best=(-float('inf'),)*3;selected_state=None;history=[];bcstart=time.perf_counter()
            for update in range(1,8001):
                model.policy.set_training_mode(True);ids=sampler.sample();dist=model.policy.get_distribution(obs[ids],data['masks'][ids]);loss=-dist.log_prob(labels[ids]).mean();optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(actor,1.);optimizer.step()
                if update not in (2000,4000,8000):continue
                fit=validation(model,vo,val,actions);game=evaluate(model,key,mode,'bc-select',612000,5,update)['summary'];score=(game['in_middle'],-abs(game['median']-32.5),-fit['macro_role_root_nll'])
                history.append({'update':update,'game':game,'validation':fit});path=run/'bc-checkpoints'/f'u{update}.zip';path.parent.mkdir(exist_ok=True);model.save(path)
                if score>best:best=score;selected_state={k:v.detach().clone() for k,v in model.policy.state_dict().items()};selected=update
                write(run/'bc-progress.json',{'status':'running','history':history,'latest_update':update});print('BC',key,update,flush=True)
            model.policy.load_state_dict(selected_state)
            for k,v in model.policy.state_dict().items():
                if 'value_net' in k:assert torch.equal(v,original[k])
            assert not model.policy.optimizer.state
            bc={'performed_updates':8000,'selected_update':selected,'history':history,'wall_seconds':time.perf_counter()-bcstart,'sample_presentations':8000*256,'selected_sample_presentations':selected*256,
                'training_sha256':sha(BASE/'data/teacher-training.npz'),'validation_sha256':sha(BASE/'data/teacher-validation.npz')}
            write(run/'bc-progress.json',{'status':'complete',**bc});del data,val,obs,vo,labels,optimizer,sampler
        initial=run/'initial.zip';model.save(initial)
        meta={'key':key,'architecture':arch,'seed':seed,'initialization':mode,'initial_random_weights_sha256':initial_hash,'parent_model_sha256':sha(initial),'parent_weights_sha256':weights(model.policy),
            'bc':bc,'env':ENV,'ppo':PPO,'budgets':BUDGETS,'environment':environment_signature(env),'runtime':runtime_versions(),'input_scaling':read(BASE/'feature-scaling.json')}
        write(run/'initial-manifest.json',meta)
        model.set_random_seed(seed);torch.manual_seed(seed+100000);np.random.seed(seed+100000);logger=configure(str(run),['csv']);model.set_logger(logger);callback=PostUpdateCheckpoints(run,key)
        print('PPO START',key,flush=True);training_start=time.perf_counter();model.learn(BUDGETS[-1],callback=callback);callback.save(BUDGETS[-1]);assert len(callback.saved)==3
        meta.update(status='complete',actual_timesteps=model.num_timesteps,training_wall_seconds=time.perf_counter()-training_start,total_wall_seconds=time.perf_counter()-began,checkpoints=callback.saved)
        write(run/'manifest.json',meta);development={}
        for budget in [0]+BUDGETS:
            path=initial if budget==0 else run/'checkpoints'/f'ppo_{budget}.zip';development[str(budget)]=evaluate(path,key,mode,'development',620000,5,budget)['summary']
        write(run/'development.json',development);return key,{'training':meta,'development':development}
    finally:
        if logger:logger.close()
        vector.close()

def evaluation_job(key,budget,stage,start,count):
    mode=key.split('-')[-1];run=BASE/'runs'/key;path=run/'initial.zip' if budget==0 else run/'checkpoints'/f'ppo_{budget}.zip'
    return key,budget,evaluate(path,key,mode,stage,start,count,budget)['summary']

def live_report(state):
    lines=['**PPO 학습 스텝 증가 실험 진행**','',f"상태: {state['status']}. 아래 값은 파일에서 확인한 완료 결과이며 대기 중 조건을 완료로 표시하지 않는다.",'',
        '학습 시드42·43,기본/모방×기존/계층8조건,각262,144스텝.65,536/131,072/262,144의 경사 업데이트 후 모델을 비교한다. 보상·gamma·행동은 예산별로 동일하다.',
        f"완료 학습 조건 {len(state.get('runs',{}))}/8. 비교 평가 완료 {len(state.get('comparison',{}))}/32. CPU4worker·torch1thread.",'',
        f"실제 로그 `{BASE/'training.log'}`,전체 상태 `{BASE/'study-state.json'}`,조건별 CSV는 `{BASE/'runs'}`."]
    if state.get('errors'):lines+=['',str(state['errors'])]
    (OUT/'PPO_학습스텝증가_진행현황.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

def main():
    assert read(BASE/'data-audit.json')['status']=='passed';assert read(BASE/'transport-verification.json')['status']=='passed';assert not (BASE/'study-state.json').exists(),'Study exists; inspect rather than reinitializing'
    state={'status':'training','started_kst':datetime.now().isoformat(),'runs':{},'comparison':{}}
    plan={'training_seeds':[42,43],'architectures':['flat','hierarchy'],'initializations':['basic','imitation'],'budgets':BUDGETS,'total_interactions':8*BUDGETS[-1],
        'env':ENV,'ppo':PPO,'worker_count':4,'teacher_quality':str(BASE/'teacher-quality.json'),'training_data_sha256':sha(BASE/'data/teacher-training.npz'),
        'validation_data_sha256':sha(BASE/'data/teacher-validation.npz'),'bc_selection_python_seeds':[612000,612004],'development_python_seeds':[620000,620004],
        'comparison_python_seeds':[630000,630019],'middle_confirmation_python_seeds':[640000,640019],'comparison_includes_initial':True}
    write(BASE/'preregistered-study.json',plan);write(BASE/'study-state.json',state);live_report(state)
    try:
        with ProcessPoolExecutor(max_workers=4) as pool:
            pending={pool.submit(train_job,a,s,m):(a,s,m) for m in ('imitation','basic') for s in (42,43) for a in ('flat','hierarchy')}
            for f in as_completed(pending):
                key,result=f.result();state['runs'][key]=result;write(BASE/'study-state.json',state);live_report(state)
            for a in ('flat','hierarchy'):
                for s in (42,43):assert state['runs'][f'{a}-{s}-basic']['training']['initial_random_weights_sha256']==state['runs'][f'{a}-{s}-imitation']['training']['initial_random_weights_sha256']
            candidates=[(key,budget,run['development'][str(budget)]) for key,run in state['runs'].items() for budget in BUDGETS]
            key,budget,dev=max(candidates,key=lambda c:(c[2]['in_middle'],-abs(c[2]['median']-32.5),c[2]['diversity_games']))
            selection={'key':key,'budget':budget,'development':dev,'selection':'development only; frozen before630000/640000'}
            write(BASE/'middle-selection-before-confirmation.json',selection);state['middle_selection']=selection;state['status']='comparison';write(BASE/'study-state.json',state);live_report(state)
            pending={pool.submit(evaluation_job,key,budget,'comparison',630000,20):(key,budget) for key in state['runs'] for budget in [0]+BUDGETS}
            for f in as_completed(pending):
                key,budget,result=f.result();state['comparison'][f'{key}-s{budget}']=result;write(BASE/'study-state.json',state);live_report(state)
            key,budget,middle=evaluation_job(selection['key'],selection['budget'],'middle-confirmation',640000,20);state['middle_confirmation']=middle
        state.update(status='complete',finished_kst=datetime.now().isoformat());write(BASE/'study-state.json',state);live_report(state);print('STEP STUDY COMPLETE',flush=True)
    except BaseException as exc:
        state.update(status='failed',errors=repr(exc));write(BASE/'study-state.json',state);live_report(state);raise
if __name__=='__main__':main()
