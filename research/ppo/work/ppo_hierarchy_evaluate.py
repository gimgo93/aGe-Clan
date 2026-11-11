"""Re-evaluate a fixed-units flat/hierarchical run from work or an exported bundle."""
import argparse,hashlib,json,sys
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-dir',type=Path,required=True)
parser.add_argument('--episodes',type=int,default=20)
parser.add_argument('--seed',type=int,default=320000)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
if not 1<=args.episodes<=10000 or not 0<=args.seed<=2**32-args.episodes:parser.error('Invalid episodes or seed')
if args.output.exists():parser.error('Output already exists')
HERE=Path(__file__).absolute().parent
BASE=HERE/'experiment' if (HERE/'experiment/engine').is_dir() else Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-hierarchy-v1')
ENGINE=BASE/'engine'
sys.path.insert(0,str(ENGINE))
import numpy as np
import torch
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv
from ml.fixed_env import FixedScaleEnv
from ml.experiment import environment_signature
meta=json.loads((args.run_dir/'manifest.json').read_text(encoding='utf-8'))
assert meta['status']=='complete'
assert meta['input_scaling']==json.loads((BASE/'feature-scaling.json').read_text(encoding='utf-8'))
for name,expected in meta.get('new_source_sha256',{}).items():
    assert hashlib.sha256((ENGINE/'ml'/name).read_bytes()).hexdigest()==expected,name
torch.set_num_threads(1)
vector=DummyVecEnv([lambda:FixedScaleEnv(**meta['config']['env'])])
try:
    assert environment_signature(vector.envs[0].unwrapped)==meta['environment']
    model=MaskablePPO.load(args.run_dir/'model.zip',env=vector,device='cpu')
    assert model.policy.action_net.out_features==(183 if meta['architecture']=='hierarchy' else 173)
    rows=[]
    for seed in range(args.seed,args.seed+args.episodes):
        vector.seed(seed);obs=vector.reset();steps=invalid=0;counts={};action_ids={};build_types={}
        while True:
            mask=vector.envs[0].action_masks()
            action,_=model.predict(obs,deterministic=True,action_masks=mask[None,:])
            assert mask[int(action[0])]
            name=vector.envs[0].unwrapped.actions[int(action[0])]['name'];counts[name]=counts.get(name,0)+1
            action_id=str(int(action[0]));action_ids[action_id]=action_ids.get(action_id,0)+1
            if name=='build':
                kind=vector.envs[0].unwrapped.actions[int(action[0])]['args'][0]
                build_types[kind]=build_types.get(kind,0)+1
            obs,reward,done,infos=vector.step(action);steps+=1;info=infos[0]
            invalid+=int('error' in info['action_result'])
            if done[0]:
                rows.append({'python_seed':seed,'game_seed':info['seed'],'steps':steps,'invalid_actions':invalid,
                    'action_counts':counts,'action_id_counts':action_ids,'build_type_counts':build_types,
                    **{k:info[k] for k in ('wave','contiguous_cleared','end_reason','kills','hp','leaks','damage_taken','reward_totals')}})
                break
    report={'run':str(args.run_dir.absolute()),'schema':meta['schema'],'episodes':rows,
        'mean_cleared':float(np.mean([r['contiguous_cleared'] for r in rows])),
        'median_cleared':float(np.median([r['contiguous_cleared'] for r in rows])),
        'censored':sum(r['end_reason']=='time_limit' for r in rows)}
    with args.output.open('x',encoding='utf-8') as stream:
        stream.write(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='episodes'},ensure_ascii=False))
finally:vector.close()
