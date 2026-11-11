from pathlib import Path
import importlib.util,sys,time,json
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구');BASE=ROOT/'work/ppo-step-budget-v1'
sys.path.insert(0,str(BASE/'engine'))
from ml.env import AgeClanEnv
from ml.fixed_env import feature_scales
from ml.experiment import environment_signature,check_policy_transfer,write_json
from sb3_contrib import MaskablePPO
spec=importlib.util.spec_from_file_location('old_env',ROOT/'work/ppo-intermediate-v1/engine/ml/env.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
torch.set_num_threads(1)
cfg={'frame_skip':10,'max_ticks':120000,'target_wave':0,'reward_mode':'defense-v1'}
model=MaskablePPO.load(ROOT/'outputs/ppo_intermediate_policy/model.zip',device='cpu')
with mod.AgeClanEnv(**cfg) as old,AgeClanEnv(**cfg) as new:
    metadata=json.loads((ROOT/'work/ppo-expanded-demo-v2/initial/flat-47-imitation/manifest.json').read_text(encoding='utf-8'))
    check_policy_transfer(metadata['environment'],environment_signature(new))
    o1,i1=old.reset(seed=590000);o2,i2=new.reset(seed=590000);assert i1==i2
    scales=feature_scales(new.feature_names);steps=0;actions=[];oldtime=newtime=0.
    while True:
        np.testing.assert_array_equal(o1,o2);t=time.perf_counter();m1=old.action_masks();oldtime+=time.perf_counter()-t
        t=time.perf_counter();m2=new.action_masks();newtime+=time.perf_counter()-t;np.testing.assert_array_equal(m1,m2)
        a,_=model.predict(np.clip(o2/scales,-20,20),deterministic=True,action_masks=m2);a=int(a);actions.append(a)
        t=time.perf_counter();o1,r1,t1,c1,i1=old.step(a);oldtime+=time.perf_counter()-t
        t=time.perf_counter();o2,r2,t2,c2,i2=new.step(a);newtime+=time.perf_counter()-t
        assert (r1,t1,c1,i1)==(r2,t2,c2,i2);steps+=1
        if t1 or c1:break
    write_json(BASE/'transport-verification.json',{'status':'passed','steps':steps,'contiguous_cleared':i2['contiguous_cleared'],'python_seed':590000,'game_seed':i2['seed'],
        'same':['all observations','all 173-bit action masks','all rewards','termination','complete info'],'old_io_seconds':oldtime,'cached_io_seconds':newtime,
        'environment':environment_signature(new)})
    print(json.dumps({'status':'passed','steps':steps,'old_io_seconds':oldtime,'cached_io_seconds':newtime}))
