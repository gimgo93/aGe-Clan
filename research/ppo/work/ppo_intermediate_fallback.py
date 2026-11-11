"""Predeclared short PPO budget from a moderate imitation checkpoint."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
import json,sys,time,hashlib
import numpy as np
import torch
from ppo_intermediate_select import BASE,OLD,ENGINE,ENV,ROOT,read,sha,evaluate,summarize
from ml.fixed_env import FixedScaleEnv
from ml.experiment import write_json,environment_signature,check_policy_transfer
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.logger import configure
FALLBACK=BASE/'moderate-parent-ppo'

def train(lr):
    torch.set_num_threads(1);key=f'flat-47-bc4000-lr{lr:g}';run=FALLBACK/key;run.mkdir(parents=True,exist_ok=True)
    manifest=run/'manifest.json'
    if manifest.exists():return read(manifest)
    assert not (run/'progress.csv').exists(),'Partial training: inspect before resume'
    parent=OLD/'bc-checkpoints/flat-47-imitation/u4000/model.zip';oldmeta=read(OLD/'initial/flat-47-imitation/manifest.json')
    vector=DummyVecEnv([lambda:FixedScaleEnv(**ENV)]);logger=configure(str(run),['csv'])
    try:
        current=environment_signature(vector.envs[0].unwrapped);check_policy_transfer(oldmeta['environment'],current)
        model=MaskablePPO.load(parent,env=vector,device='cpu');assert model.num_timesteps==0 and not model.policy.optimizer.state
        model.learning_rate=lr
        model.lr_schedule=lambda _:lr
        for group in model.policy.optimizer.param_groups:group['lr']=lr
        model.set_logger(logger);model.set_random_seed(47);torch.manual_seed(200047);np.random.seed(200047)
        began=time.perf_counter();model.learn(16384,callback=CheckpointCallback(4096,str(run/'checkpoints'),name_prefix='ppo'))
        model.save(run/'model.zip')
        result={'key':key,'training_seed':47,'parent':str(parent),'parent_sha256':sha(parent),'bc_updates':4000,
            'ppo_steps':model.num_timesteps,'learning_rate':lr,'environment':current,'input_scaling':oldmeta['input_scaling'],
            'architecture':'flat','initialization':'expanded-imitation','wall_seconds':time.perf_counter()-began,'config':ENV,
            'reward':'unchanged defense-v1','gamma':model.gamma,'ent_coef':model.ent_coef}
        write_json(manifest,result);return result
    finally:logger.close();vector.close()

def main():
    prior=read(BASE/'final-result.json');assert not prior['summary']['adoptable'],'Existing intermediate passed; fallback unnecessary'
    FALLBACK.mkdir(exist_ok=True)
    plan={'status':'preregistered','training_seed':47,'parent':str(OLD/'bc-checkpoints/flat-47-imitation/u4000/model.zip'),
        'learning_rates':[.00003,.0001],'ppo_steps_per_condition':16384,'checkpoints':[4096,8192,12288,16384],
        'development_python_seeds':[480000,480004],'confirmation_python_seeds':[490000,490019],
        'criteria':'same performance and diversity as original plan; rank band fraction then closeness32.5 then diversity',
        'hypothesis':'A moderate BC parent plus short PPO can retain middle-tier performance while adapting economic and defensive behavior.',
        'reward_actions_gamma':'unchanged defense-v1,173 actions,gamma0.99; no wave cap or forced defeat',
        'next_if_failed':'Measure wave-band dispersion and train a middle-strength multi-tower teacher curriculum with disjoint seeds; no adoption on failure.'}
    if not (FALLBACK/'preregistered-plan.json').exists():write_json(FALLBACK/'preregistered-plan.json',plan)
    with ProcessPoolExecutor(max_workers=2) as pool:metas=list(pool.map(train,plan['learning_rates']))
    candidates=[]
    for meta in metas:
        for steps in plan['checkpoints']:
            path=FALLBACK/meta['key']/'checkpoints'/f'ppo_{steps}_steps.zip'
            candidates.append({'key':meta['key']+f'-ppo{steps}','path':str(path),'source':str(path),'sha256':sha(path),
                'architecture':'flat','training_seed':47,'ppo_steps':steps,'environment':meta['environment'],
                'input_scaling':meta['input_scaling'],'initialization':'expanded-imitation','bc_selected_update':4000,'inference':'deterministic',
                'parent':meta['parent'],'parent_sha256':meta['parent_sha256'],'learning_rate':meta['learning_rate']})
    write_json(FALLBACK/'candidates.json',candidates);results={}
    with ProcessPoolExecutor(max_workers=2) as pool:
        pending={pool.submit(evaluate,c,'fallback-development',480000,5):c['key'] for c in candidates}
        for f in as_completed(pending):
            r=f.result();results[r['candidate']['key']]=r['summary'];write_json(FALLBACK/'development-progress.json',results)
    def rank(c):
        s=results[c['key']];return s['performance']['in_band'],-abs(s['performance']['median']-32.5),s['diversity']['command_root_tower_pass_games']
    chosen=max(candidates,key=rank)
    write_json(FALLBACK/'selection-before-confirmation.json',{'candidate':chosen,'development':results[chosen['key']]})
    final=evaluate(chosen,'fallback-confirmation',490000,20);write_json(FALLBACK/'final-result.json',final)
    print('FINAL',json.dumps(final['summary']),flush=True)
if __name__=='__main__':main()
