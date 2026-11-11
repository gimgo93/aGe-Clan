"""Conditional third experiment: explicit AI investment limits, no wave cutoff."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from copy import deepcopy
import time,json
import numpy as np
import torch
from ppo_intermediate_select import ROOT,BASE,OLD,ENGINE,ENV,read,sha,evaluate,make_env
from ml.experiment import write_json,environment_signature,check_policy_transfer
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.logger import configure
CAP=BASE/'investment-budget'

def select_and_evaluate(candidates,stage,start,progress):
    results={}
    with ProcessPoolExecutor(max_workers=2) as pool:
        pending={pool.submit(evaluate,c,stage,start,5):c['key'] for c in candidates}
        for f in as_completed(pending):
            r=f.result();results[r['candidate']['key']]=r['summary'];write_json(progress,results)
    def rank(c):
        s=results[c['key']];return s['performance']['in_band'],-abs(s['performance']['median']-32.5),s['diversity']['command_root_tower_pass_games']
    return max(candidates,key=rank),results

def main():
    assert not read(BASE/'moderate-parent-ppo/final-result.json')['summary']['adoptable']
    CAP.mkdir(exist_ok=True)
    plan={'status':'preregistered','training_seed':47,'parent':'hierarchy-47-imitation PPO131072 final model',
        'max_castle_levels':[6,8,10,12],'capacity_screen_python_seeds':[520000,520004],
        'ppo_additional_steps':16384,'learning_rate':.00003,'checkpoints':[4096,8192,12288,16384],
        'development_python_seeds':[540000,540004],'confirmation_python_seeds':[550000,550019],
        'selection':'same band fraction, closeness32.5, diversity; no confirmation-set reselection',
        'criteria':'unchanged median30-35,80%inband,no censor/invalid,behavioral diversity',
        'change':'Only AI upgradeCastle is unavailable at a selected castle level; other commands/engine/waves/rewards remain intact',
        'reason':'Full-action PPO promotes survival past middle tier; moderate parents have high dispersion. Test a stable high-performing parent under an explicit investment budget.',
        'next_if_failed':'Do not adopt; design middle-tier demonstration curriculum and broader paired seed study.'}
    if not (CAP/'preregistered-plan.json').exists():write_json(CAP/'preregistered-plan.json',plan)
    parent=OLD/'runs/hierarchy-47-imitation/model.zip';meta=read(OLD/'runs/hierarchy-47-imitation/manifest.json')
    frozen=CAP/'parent-model.zip'
    if not frozen.exists():frozen.write_bytes(parent.read_bytes())
    assert sha(frozen)==sha(parent)
    base={'architecture':'hierarchy','training_seed':47,'ppo_steps':131072,'path':str(frozen),'source':str(parent),'sha256':sha(frozen),
        'initialization':'expanded-imitation','bc_selected_update':meta['imitation']['selected_update'],'environment':meta['environment'],
        'input_scaling':meta['input_scaling'],'inference':'deterministic','parent':str(parent),'parent_sha256':sha(frozen)}
    candidates=[dict(deepcopy(base),key=f'hierarchy-47-budget{cap}-parent',policy_constraints={'max_castle_level':cap}) for cap in plan['max_castle_levels']]
    write_json(CAP/'screen-candidates.json',candidates)
    chosen,screen=select_and_evaluate(candidates,'capacity-screen',520000,CAP/'screen-progress.json')
    write_json(CAP/'budget-selection-before-training.json',{'candidate':chosen,'screen':screen[chosen['key']]})
    train_selected(chosen,plan)

def train_selected(chosen,plan):
    torch.set_num_threads(1);level=chosen['policy_constraints']['max_castle_level'];run=CAP/f'castle{level}-ppo';run.mkdir(exist_ok=True)
    if not (run/'manifest.json').exists():
        assert not (run/'progress.csv').exists(),'Inspect partial run before retrying'
        vector=DummyVecEnv([lambda:make_env(chosen)]);logger=configure(str(run),['csv'])
        try:
            check_policy_transfer(chosen['environment'],environment_signature(vector.envs[0].unwrapped))
            model=MaskablePPO.load(chosen['path'],env=vector,device='cpu');model.learning_rate=plan['learning_rate'];model.lr_schedule=lambda _:plan['learning_rate']
            for group in model.policy.optimizer.param_groups:group['lr']=plan['learning_rate']
            model.set_logger(logger);model.set_random_seed(47);torch.manual_seed(300047);np.random.seed(300047);began=time.perf_counter()
            model.learn(16384,reset_num_timesteps=False,callback=CheckpointCallback(4096,str(run/'checkpoints'),name_prefix='ppo'))
            model.save(run/'model.zip');write_json(run/'manifest.json',{'status':'complete','parent':chosen,'additional_ppo_steps':16384,
                'actual_total_ppo_steps':model.num_timesteps,'wall_seconds':time.perf_counter()-began,'learning_rate':plan['learning_rate'],
                'capacity_wrapper_sha256':sha(ENGINE/'ml/capacity_env.py')})
        finally:logger.close();vector.close()
    candidates=[]
    for extra in plan['checkpoints']:
        steps=131072+extra;path=run/'checkpoints'/f'ppo_{steps}_steps.zip'
        c=deepcopy(chosen);c.update(key=f'hierarchy-47-budget{level}-ppo{steps}',path=str(path),source=str(path),sha256=sha(path),
            ppo_steps=steps,additional_ppo_steps=extra,learning_rate=plan['learning_rate']);candidates.append(c)
    write_json(CAP/'trained-candidates.json',candidates)
    selected,dev=select_and_evaluate(candidates,'capacity-development',540000,CAP/'development-progress.json')
    write_json(CAP/'selection-before-confirmation.json',{'candidate':selected,'development':dev[selected['key']]})
    final=evaluate(selected,'capacity-confirmation',550000,20);write_json(CAP/'final-result.json',final)
    print('FINAL',json.dumps(final['summary']),flush=True)
if __name__=='__main__':main()
