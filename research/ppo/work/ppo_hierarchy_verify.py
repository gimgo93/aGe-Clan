"""Probability algebra, masks, gradients, serialization and real PPO integration."""
from pathlib import Path
import json,sys,hashlib
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
BASE=ROOT/'work/ppo-hierarchy-v1';ENGINE=BASE/'engine'
sys.path.insert(0,str(ENGINE))
from ml.hierarchical import HierarchicalDistribution,HierarchicalPolicy,make_tree
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.env import AgeClanEnv
from ml.experiment import environment_signature,write_json
from sb3_contrib import MaskablePPO

def main():
    torch.set_num_threads(1);torch.manual_seed(73001)
    env_config={'target_wave':0,'frame_skip':10,'max_ticks':120000,'reward_mode':'defense-v1'}
    with FixedScaleEnv(**env_config) as env:
        actions=env.unwrapped.actions;features=env.unwrapped.feature_names
        dist=HierarchicalDistribution(actions)
        logits=torch.zeros((1,dist.logit_count),requires_grad=True)
        dist.proba_distribution(logits)
        p=dist.distribution.probs[0]
        # All six root categories get exactly 1/6 despite unequal leaf counts.
        # Derive the six category memberships from command metadata.
        from ml.hierarchical import NAME_GROUP
        groups=[[i for i,a in enumerate(actions) if NAME_GROUP[a['name']]==g] for g in range(6)]
        assert all(torch.allclose(p[ids].sum(),torch.tensor(1/6),atol=1e-6) for ids in groups)
        manual_entropy=np.log(6)+(np.log(5)+np.log(26)+np.log(7)+np.log(5)+np.log(4)+np.log(26))/6
        assert abs(dist.entropy().item()-manual_entropy)<1e-5
        masks=np.random.default_rng(73002).random((128,len(actions)))<.3;masks[:,0]=True
        random_logits=torch.randn((128,dist.logit_count),requires_grad=True)
        dist.proba_distribution(random_logits);dist.apply_masking(masks)
        probs=dist.distribution.probs
        assert torch.allclose(probs.sum(1),torch.ones(128),atol=1e-6)
        assert bool((probs[~torch.as_tensor(masks)]==0).all())
        for _ in range(20):
            sampled=dist.sample();assert all(masks[i,int(a)] for i,a in enumerate(sampled))
        mode=dist.mode();assert all(masks[i,int(a)] for i,a in enumerate(mode))
        selected=dist.sample()
        logp=dist.log_prob(selected)
        factor_logs=(dist.conditional.flatten(1)[:,dist.path_indices]*dist.path_active).sum(-1)
        assert torch.allclose(logp,factor_logs.gather(1,selected[:,None]).squeeze(1),atol=2e-6)
        (-logp.mean()-.003*dist.entropy().mean()).backward()
        assert torch.isfinite(random_logits.grad).all()
        wait_logits=torch.randn((1,dist.logit_count),requires_grad=True)
        only_wait=np.zeros((1,len(actions)),bool);only_wait[:,0]=True
        dist.proba_distribution(wait_logits);dist.apply_masking(only_wait)
        assert dist.mode().item()==0 and dist.entropy().item()==0
        (-dist.log_prob(torch.tensor([0])).sum()).backward()
        assert torch.allclose(wait_logits.grad,torch.zeros_like(wait_logits.grad),atol=1e-7)
        # Actual engine states must support distribution sampling without illegal commands.
        obs,info=env.reset(seed=73003)
        for step in range(200):
            mask=env.action_masks()
            dist.proba_distribution(torch.randn((1,dist.logit_count)));dist.apply_masking(mask)
            action=dist.sample().item();obs,reward,term,trunc,info=env.step(action)
            assert 'error' not in info['action_result']
            if term or trunc:obs,info=env.reset(seed=73003+step+1)
        scale=feature_scales(features)
        assert len(scale)==148 and (scale>0).all()
        write_json(BASE/'feature-scaling.json',{'version':'fixed-units-v1','source':'predeclared engineering units, not fitted to demonstrations or evaluation',
            'formula':'clip(raw_observation / scale, -20, 20)','scales':dict(zip(features,map(float,scale)))})
        signature=environment_signature(env.unwrapped)
    # Exactly the same one-step game transition under the wrapper, no intermediate ticks.
    with FixedScaleEnv(**env_config) as scaled,AgeClanEnv(**env_config) as raw:
        a,ia=scaled.reset(seed=73004);b,ib=raw.reset(seed=73004)
        assert np.allclose(a,np.clip(b/scale,-20,20))
        for action in [0]*40:
            a,ra,ta,ua,ia=scaled.step(action);b,rb,tb,ub,ib=raw.step(action)
            assert np.allclose(a,np.clip(b/scale,-20,20)) and (ra,ta,ua,ia)==(rb,tb,ub,ib)
    verify=BASE/'verification-model';verify.mkdir(exist_ok=False)
    with FixedScaleEnv(**dict(env_config,max_ticks=2000)) as env:
        model=MaskablePPO(HierarchicalPolicy,env,policy_kwargs={'action_table':actions},seed=73005,
            n_steps=128,batch_size=64,n_epochs=2,learning_rate=.0001,device='cpu',verbose=0)
        model.learn(512);model.save(verify/'model.zip')
        obs,info=env.reset(seed=73006);mask=env.action_masks()
        expected,_=model.predict(obs,deterministic=True,action_masks=mask)
        tensor,_=model.policy.obs_to_tensor(obs)
        with torch.no_grad():expected_log=model.policy.get_distribution(tensor,mask).distribution.logits.clone()
        restored=MaskablePPO.load(verify/'model.zip',env=env,device='cpu')
        actual,_=restored.predict(obs,deterministic=True,action_masks=mask)
        with torch.no_grad():actual_log=restored.policy.get_distribution(tensor,mask).distribution.logits
        assert int(expected)==int(actual) and torch.equal(expected_log,actual_log)
        assert restored.policy.action_net.out_features==dist.logit_count==183
    old=ROOT/'work/ppo-gamma-r2-engine'
    for name,h in signature['source_sha256'].items():
        assert hashlib.sha256((old/name).read_text(encoding='utf-8').encode()).hexdigest()==h,name
    write_json(BASE/'verification.json',{'status':'passed','probability_mass_and_exact_joint_entropy':True,
        'conditional_logprob_sum':True,'random_mask_batches':128,'illegal_action_mass':0,
        'finite_gradients':True,'inactive_branch_zero_gradient':True,'real_engine_mask_steps':200,
        'same_game_transition_steps':40,'smoke_ppo_steps_excluded_from_experiment':512,
        'save_reload_identical_distribution':True,'engine_sources_unchanged':True,
        'leaf_actions':len(actions),'conditional_logits':183,'internal_nodes':dist.node_count})
    print('VERIFICATION PASSED',flush=True)
if __name__=='__main__':main()
