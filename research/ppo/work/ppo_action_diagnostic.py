"""Development-only deterministic versus sampled-policy diagnostic, no learning."""
from pathlib import Path
import sys,json
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
BASE=ROOT/'work/ppo-gamma-r2'
sys.path[:0]=[str(ROOT/'work/ppo-gamma-r2-engine'),str(ROOT/'work')]
from ml.env import AgeClanEnv
from ml.experiment import write_json
from stable_baselines3.common.vec_env import DummyVecEnv,VecNormalize
from sb3_contrib import MaskablePPO
import torch
from ppo_gamma_round import summary
def main():
    torch.set_num_threads(1)
    report={}
    for seed in (42,43):
        key=f'control-{seed}-g099';run=BASE/key
        manifest=json.loads((run/'manifest.json').read_text(encoding='utf-8'))
        vector=VecNormalize.load(run/'vecnormalize.pkl',DummyVecEnv([lambda:AgeClanEnv(**manifest['config']['env'])]))
        vector.training=False;vector.norm_reward=False
        rows=[]
        try:
            model=MaskablePPO.load(run/'model.zip',env=vector,device='cpu')
            for game_seed in range(260000,260010):
                torch.manual_seed(900000+game_seed)
                vector.seed(game_seed);obs=vector.reset();steps=invalid=0
                counts={};first_build=None;first_kill=None
                while True:
                    action,_=model.predict(obs,deterministic=False,action_masks=vector.envs[0].action_masks()[None,:])
                    name=vector.envs[0].actions[int(action[0])]['name']
                    counts[name]=counts.get(name,0)+1
                    obs,reward,done,infos=vector.step(action);info=infos[0];steps+=1
                    invalid+=int('error' in info['action_result'])
                    if name=='build' and first_build is None:first_build=steps
                    if info['kills']>0 and first_kill is None:first_kill=steps
                    if done[0]:
                        rows.append({'python_seed':game_seed,'game_seed':info['seed'],'action_sampling_seed':900000+game_seed,
                            'steps':steps,'invalid_actions':invalid,'action_counts_by_name':counts,'first_build_step':first_build,
                            'first_kill_step':first_kill,**{k:info[k] for k in ('wave','contiguous_cleared','end_reason','kills','hp')}})
                        break
            result={'purpose':'development diagnostic only; not tier confirmation','deterministic':False,'episodes':rows,
                    'summary':summary(rows,'control')}
            write_json(BASE/f'sampled-diagnostic-{key}.json',result)
            report[key]=result['summary']
            print(key,json.dumps(result['summary']),flush=True)
        finally:vector.close()
    write_json(BASE/'sampled-diagnostic-summary.json',report)
if __name__=='__main__':main()
