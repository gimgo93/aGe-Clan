"""Intermediate checkpoint selection with preregistered, disjoint game seeds."""
from pathlib import Path
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib,importlib.util,json,sys,time
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
BASE=ROOT/'work/ppo-intermediate-v1';OLD=ROOT/'work/ppo-expanded-demo-v2';ENGINE=BASE/'engine'
sys.path.insert(0,str(ENGINE))
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.hierarchical import NAME_GROUP
from ml.experiment import environment_signature,check_policy_transfer,write_json
from sb3_contrib import MaskablePPO
ENV={'frame_skip':10,'max_ticks':120000,'target_wave':0,'reward_mode':'defense-v1'}
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def predict(model,obs,mask):
    a,_=model.predict(obs,deterministic=True,action_masks=mask)
    return int(a)
def make_env(candidate):
    constraints=candidate.get('policy_constraints')
    if constraints:
        from ml.capacity_env import CapacityEnv
        return CapacityEnv(max_castle_level=constraints['max_castle_level'],**ENV)
    return FixedScaleEnv(**ENV)
def summarize(rows):
    x=np.array([r['contiguous_cleared'] for r in rows]);n=len(x)
    performance={'episodes':n,'mean':float(x.mean()),'median':float(np.median(x)),'min':int(x.min()),'max':int(x.max()),
        'in_band':int(((x>=30)&(x<=35)).sum()),'censored':sum(r['end_reason']=='time_limit' for r in rows),
        'invalid':sum(r['invalid_actions'] for r in rows)}
    performance['pass']=bool(30<=np.median(x)<=35 and performance['in_band']/n>=.8 and not performance['censored'] and not performance['invalid'])
    diversity={'command_root_tower_pass_games':sum(r['nonwait_command_kinds']>=5 and r['nonwait_root_kinds']>=3 and len(r['build_type_counts'])>=2 for r in rows),
        'concentration_pass_games':sum(r['max_nonwait_command_share']<=.8 for r in rows),
        'distinct_nonwait_sequences':len({r['nonwait_sequence_sha256'] for r in rows}),
        'command_kind_range':[min(r['nonwait_command_kinds'] for r in rows),max(r['nonwait_command_kinds'] for r in rows)],
        'mean_wait_share':float(np.mean([r['wait_share'] for r in rows]))}
    diversity['pass']=diversity['command_root_tower_pass_games']/n>=.8 and diversity['concentration_pass_games']/n>=.8 and diversity['distinct_nonwait_sequences']>=min(5,n)
    return {'performance':performance,'diversity':diversity,'adoptable':performance['pass'] and diversity['pass']}

def evaluate(candidate,stage,start,count):
    torch.set_num_threads(1);key=candidate['key'];dest=BASE/f'{stage}-{key}.json'
    if dest.exists():return read(dest)
    model=MaskablePPO.load(candidate['path'],device='cpu');assert model.num_timesteps==candidate['ppo_steps']
    model.policy.set_training_mode(False)
    rows=[];probes=[];began=time.perf_counter()
    with make_env(candidate) as env:
        check_policy_transfer(candidate['environment'],environment_signature(env.unwrapped))
        for seed in range(start,start+count):
            obs,info=env.reset(seed=seed);counts=Counter();types=Counter();roots=Counter();phases={};nonwait=[];invalid=steps=0;maxcastle=1
            while True:
                mask=env.action_masks();a=predict(model,obs,mask);assert mask[a]
                command=env.unwrapped.actions[a];name=command['name'];counts[name]+=1
                if name!='wait':
                    roots[NAME_GROUP[name]]+=1;nonwait.append([steps,a])
                    wave=int(obs[env.unwrapped.feature_names.index('wave')]*50+1e-4)
                    bucket='0-10' if wave<=10 else ('11-25' if wave<=25 else '26+')
                    phases.setdefault(bucket,Counter())[name]+=1
                if name=='build':types[command['args'][0]]+=1
                if steps%100==0 and len(probes)<240:probes.append((obs.copy(),mask.copy()))
                obs,reward,terminated,truncated,info=env.step(a);steps+=1;invalid+=int('error' in info['action_result'])
                castle=round(float(obs[env.unwrapped.feature_names.index('castle')])*5);maxcastle=max(maxcastle,castle)
                if candidate.get('policy_constraints'):assert castle<=candidate['policy_constraints']['max_castle_level']
                if terminated or truncated:
                    nw=steps-counts['wait']
                    rows.append({'python_seed':seed,'game_seed':info['seed'],'steps':steps,'invalid_actions':invalid,
                        'action_counts':dict(counts),'build_type_counts':dict(types),'root_counts':dict(roots),'phase_counts':phases,'max_castle_level':maxcastle,
                        'nonwait_command_kinds':len(counts)-(1 if counts['wait'] else 0),'nonwait_root_kinds':len(roots),
                        'max_nonwait_command_share':max((v/nw for k,v in counts.items() if k!='wait'),default=1.),
                        'wait_share':counts['wait']/steps,'nonwait_sequence_sha256':hashlib.sha256(json.dumps(nonwait).encode()).hexdigest(),
                        **{k:info[k] for k in ('wave','contiguous_cleared','end_reason','hp','kills','leaks','reward_totals')}})
                    break
            print(stage,key,seed,rows[-1]['contiguous_cleared'],flush=True)
        # Common legal masks eliminate legal-set changes as an explanation of response differences.
        changed=total=0;examples=[]
        for i in range(0,len(probes),3):
            j=(i+len(probes)//2)%len(probes);o1,m1=probes[i];o2,m2=probes[j];common=m1&m2
            if common.sum()<2 or np.array_equal(o1,o2):continue
            a1=predict(model,o1,common);a2=predict(model,o2,common);total+=1;changed+=a1!=a2
            if a1!=a2 and len(examples)<5:examples.append({'probe_pair':[i,j],'common_legal':int(common.sum()),'action_ids':[a1,a2]})
        result={'candidate':candidate,'stage':stage,'python_seeds':[start,start+count-1],'episodes':rows,'summary':summarize(rows),
            'state_response_probe':{'changed_pairs':changed,'total_pairs':total,'examples':examples,'auxiliary_only':True},'wall_seconds':time.perf_counter()-began}
        write_json(dest,result);return result

def verify_transition(candidate):
    dest=BASE/'transition-verification.json'
    if dest.exists():assert read(dest)['status']=='passed';return
    spec=importlib.util.spec_from_file_location('original_env',OLD/'engine/ml/env.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    torch.set_num_threads(1);model=MaskablePPO.load(candidate['path'],device='cpu')
    with module.AgeClanEnv(**ENV) as old,FixedScaleEnv(**ENV) as new:
        oldobs,oldinfo=old.reset(seed=459999);obs,info=new.reset(seed=459999);scale=feature_scales(old.feature_names)
        assert oldinfo==info;steps=0
        while True:
            np.testing.assert_array_equal(np.clip(oldobs/scale,-20,20).astype(np.float32),obs)
            oldmask=old.action_masks();mask=new.action_masks();np.testing.assert_array_equal(oldmask,mask)
            a=predict(model,obs,mask);oldobs,r1,t1,c1,i1=old.step(a);obs,r2,t2,c2,info=new.step(a)
            assert (r1,t1,c1,i1)==(r2,t2,c2,info);steps+=1
            if t1 or c1:break
        write_json(dest,{'status':'passed','steps':steps,'python_seed':459999,'game_seed':info['seed'],'contiguous_cleared':info['contiguous_cleared'],
            'checks':['every observation','every 173-bit legal mask','rewards','termination','full info and wave outcomes'],'candidate':candidate['key']})

def inventory():
    dest=BASE/'candidate-inventory.json'
    if dest.exists():return read(dest)
    candidates=[]
    for seed in (47,48):
        for arch in ('flat','hierarchy'):
            run=f'{arch}-{seed}-imitation';meta=read(OLD/'initial'/run/'manifest.json')
            for steps in (32768,65536,98304,131072):
                source=OLD/'runs'/run/'checkpoints'/f'ppo_{steps}_steps.zip'
                if not source.exists() or time.time()-source.stat().st_mtime<10:continue
                key=f'{arch}-{seed}-ppo{steps}';target=BASE/'candidates'/key/'model.zip';target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(source.read_bytes());assert sha(target)==sha(source)
                candidates.append({'key':key,'architecture':arch,'training_seed':seed,'ppo_steps':steps,'path':str(target),'source':str(source),
                    'sha256':sha(target),'initialization':'expanded-imitation','bc_selected_update':meta['imitation']['selected_update'],
                    'environment':meta['environment'],'input_scaling':meta['input_scaling'],'inference':'deterministic'})
    write_json(dest,candidates);return candidates

def main():
    assert read(BASE/'mask-verification.json')['status']=='passed'
    candidates=inventory();assert candidates;verify_transition(candidates[0]);results={}
    with ProcessPoolExecutor(max_workers=2) as pool:
        pending={pool.submit(evaluate,c,'development',460000,5):c['key'] for c in candidates}
        for f in as_completed(pending):
            r=f.result();results[r['candidate']['key']]=r['summary'];write_json(BASE/'development-progress.json',results)
    def rank(c):
        s=results[c['key']];p=s['performance'];d=s['diversity']
        return p['in_band'],-abs(p['median']-32.5),d['command_root_tower_pass_games']
    chosen=max(candidates,key=rank)
    write_json(BASE/'selection-before-confirmation.json',{'candidate':chosen,'development':results[chosen['key']],'criterion':'in_band, closeness32.5, diversity_count'})
    # Confirm only the frozen selected policy; no selection on the confirmation games.
    final=evaluate(chosen,'confirmation',470000,20);write_json(BASE/'final-result.json',final)
    print('FINAL',json.dumps(final['summary']),flush=True)
if __name__=='__main__':main()
