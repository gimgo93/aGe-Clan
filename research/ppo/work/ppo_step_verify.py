import numpy as np
import torch
from ppo_step_study import BASE,ENV,PPO,Sampler,write,weights
from ml.fixed_env import FixedScaleEnv,feature_scales
from ml.hierarchical import HierarchicalPolicy
from sb3_contrib import MaskablePPO
torch.set_num_threads(1);data={k:v for k,v in np.load(BASE/'data/teacher-training.npz').items()};proof=[]
with FixedScaleEnv(**ENV) as env:
    actions=env.unwrapped.actions;sampler=Sampler(data,actions,42);duplicate=Sampler(data,actions,42)
    for _ in range(10):
        ids=sampler.sample();assert np.array_equal(ids,duplicate.sample());assert int(data['roles'][ids].sum())==26;assert int((data['labels'][ids]==0).sum())==128
    for arch in ('flat','hierarchy'):
        model=MaskablePPO(HierarchicalPolicy if arch=='hierarchy' else 'MlpPolicy',env,seed=42,device='cpu',policy_kwargs={'action_table':actions} if arch=='hierarchy' else {},**PPO)
        original={k:v.detach().clone() for k,v in model.policy.state_dict().items()};actor=list(model.policy.mlp_extractor.policy_net.parameters())+list(model.policy.action_net.parameters());optimizer=torch.optim.Adam(actor,lr=.001)
        obs=torch.from_numpy(np.clip(data['observations'][ids]/feature_scales(env.unwrapped.feature_names),-20,20).astype(np.float32));y=torch.from_numpy(data['labels'][ids]);dist=model.policy.get_distribution(obs,data['masks'][ids]);loss=-dist.log_prob(y).mean()
        optimizer.zero_grad();loss.backward();assert all(torch.isfinite(p.grad).all() for p in actor if p.grad is not None);optimizer.step()
        assert not model.policy.optimizer.state
        for k,v in model.policy.state_dict().items():
            if 'value_net' in k:assert torch.equal(v,original[k])
        before=weights(model.policy);model.learn(512);assert model.num_timesteps==512 and model._n_updates==8;assert weights(model.policy)!=before
        test=BASE/f'smoke-{arch}.zip';model.save(test);loaded=MaskablePPO.load(test,device='cpu');assert weights(loaded.policy)==weights(model.policy)
        proof.append({'architecture':arch,'imitation_loss':float(loss.detach()),'PPO_steps':512,'gradient_epochs':8,'finite_gradients':True,'critic_untouched_by_imitation':True,'save_reload':True})
write(BASE/'initialization-verification.json',{'status':'passed','batch_draws':2560,'batch_middle':230,'batch_reference':26,'batch_wait':128,'batch_nonwait':128,'same_sampling_schedule':True,'architectures':proof,'smoke_models_used_for_study':False})
print('INITIALIZATION AND PPO SMOKE PASSED')
