from pathlib import Path
import sys,hashlib,json
import numpy as np
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구');BASE=ROOT/'work/ppo-step-budget-v1';OLD=ROOT/'work/ppo-expanded-demo-v2'
sys.path.insert(0,str(BASE/'engine'))
from ml.env import AgeClanEnv
from ml.experiment import environment_signature,check_policy_transfer,write_json
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    assert read(BASE/'collection-complete.json')['status']=='complete';assert read(BASE/'transport-verification.json')['status']=='passed'
    audit={'status':'passed','splits':{},'reference_batch':26,'middle_batch':230,'batch_wait_nonwait':'50/50within each role'}
    with AgeClanEnv(target_wave=0,max_ticks=120000,reward_mode='defense-v1') as env:
        signature=environment_signature(env);check_policy_transfer(read(OLD/'data-audit.json')['environment'],signature)
        for split in ('training','validation'):
            meta=read(BASE/f'data/{split}.json');n=meta['samples'];assert meta['actions']==env.actions and meta['features']==env.feature_names
            arrays={}
            for name,dtype,shape in [('observations','<f4',(n,len(env.feature_names))),('masks','u1',(n,len(env.actions))),('labels','<u2',(n,)),('episode_ids','<u4',(n,)),('teacher_ids','u1',(n,))]:
                p=BASE/f'data/{split}-{name}.bin';assert p.stat().st_size==np.prod(shape)*np.dtype(dtype).itemsize
                arrays[name]=np.fromfile(p,dtype=dtype).reshape(shape)
            arrays['labels']=arrays['labels'].astype(np.int64);arrays['masks']=arrays['masks'].astype(bool)
            arrays['waves']=arrays['observations'][:,env.feature_names.index('wave')].astype(np.int16);arrays['roles']=np.zeros(n,dtype=np.uint8)
            assert np.isfinite(arrays['observations']).all() and arrays['masks'][np.arange(n),arrays['labels']].all()
            source=OLD/f'data/teacher-{split}.npz';ref={k:v for k,v in np.load(source).items()}
            ref['roles']=np.ones(len(ref['labels']),dtype=np.uint8);ref['teacher_ids']=ref['teacher_ids']+100
            middle_ids=set(map(int,arrays['episode_ids']));reference_ids=set(map(int,ref['episode_ids']));assert middle_ids.isdisjoint(reference_ids)
            merged={key:np.concatenate([arrays[key],ref[key]]) for key in arrays}
            assert merged['masks'][np.arange(len(merged['labels'])),merged['labels']].all()
            path=BASE/f'data/teacher-{split}.npz';assert not path.exists();np.savez_compressed(path,**merged)
            audit['splits'][split]={'middle_samples':n,'middle_episodes':len(meta['episodes']),'middle_build_counts':meta['build_type_counts'],
                'reference_samples':len(ref['labels']),'reference_sha256':digest(source),'reference_source':str(source),
                'total_samples':len(merged['labels']),'npz_sha256':digest(path),'path':str(path),'engine_seeds':sorted(middle_ids|reference_ids)}
            assert len({env.actions[int(a)]['args'][0] for a in merged['labels'] if env.actions[int(a)]['name']=='build'})==5
    assert set(audit['splits']['training']['engine_seeds']).isdisjoint(audit['splits']['validation']['engine_seeds'])
    audit['environment']=signature;write_json(BASE/'data-audit.json',audit);print(json.dumps(audit['splits'],ensure_ascii=False))
if __name__=='__main__':main()
