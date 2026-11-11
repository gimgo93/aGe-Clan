import hashlib
import json
from pathlib import Path

import numpy as np
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.env import AgeClanEnv
from ml.experiment import environment_signature


WORK = Path(__file__).resolve().parent
ROOT = WORK / 'ppo-next/learning'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    torch.set_num_threads(1)
    training = np.load(ROOT / 'teacher-training.npz')
    validation = np.load(ROOT / 'teacher-validation.npz')
    assert set(training['episode_ids']).isdisjoint(validation['episode_ids'])
    for data in (training, validation):
        assert data['observations'].shape[1] == 148
        assert data['masks'].shape[1] == 173
        assert np.all(data['masks'][np.arange(len(data['labels'])), data['labels']])
        assert np.all(np.isfinite(data['observations']))
    checked = {'data': {'training_samples': len(training['labels']), 'validation_samples': len(validation['labels']),
                         'training_sha256': digest(ROOT / 'teacher-training.npz'),
                         'validation_sha256': digest(ROOT / 'teacher-validation.npz')}}
    added = 0
    wall = 0.0
    for seed in (42, 43):
        control = ROOT / f'seed-{seed}/control-initial'
        imitation = ROOT / f'seed-{seed}/imitation-initial'
        a, b = read(control / 'manifest.json'), read(imitation / 'manifest.json')
        assert a['initial_parameter_sha256'] == b['initial_parameter_sha256']
        assert (control / 'vecnormalize.pkl').read_bytes() == (imitation / 'vecnormalize.pkl').read_bytes()
        original = MaskablePPO.load(control / 'model.zip', device='cpu')
        initialized = MaskablePPO.load(imitation / 'model.zip', device='cpu')
        assert original.num_timesteps == initialized.num_timesteps == 0
        assert len(original.policy.optimizer.state) == len(initialized.policy.optimizer.state) == 0
        changes = []
        for key, tensor in original.policy.state_dict().items():
            if not torch.equal(tensor, initialized.policy.state_dict()[key]):
                changes.append(key)
                assert key.startswith(('mlp_extractor.policy_net.', 'action_net.'))
        assert changes
        vector = VecNormalize.load(control / 'vecnormalize.pkl', DummyVecEnv([lambda: AgeClanEnv(**a['config']['env'])]))
        try:
            # RunningMeanStd has its standard epsilon prior.
            assert vector.obs_rms.count == len(training['labels']) + .0001
            expected = training['observations'].mean(axis=0).astype(np.float64)
            expected *= len(training['labels']) / (len(training['labels']) + .0001)
            np.testing.assert_allclose(vector.obs_rms.mean, expected, rtol=1e-6, atol=1e-6)
            assert environment_signature(vector.envs[0]) == a['environment'] == b['environment']
        finally:
            vector.close()
        checked[f'seed-{seed}-initialization'] = {'changed_actor_tensors': changes,
                                                  'imitation_updates': b['imitation_updates'],
                                                  'normalization_sha256': digest(control / 'vecnormalize.pkl')}
        for mode in ('control', 'imitation'):
            run = ROOT / f'seed-{seed}/{mode}-ppo'
            record = read(run / 'manifest.json')
            model = MaskablePPO.load(run / 'model.zip', device='cpu')
            assert model.num_timesteps == record['actual_timesteps'] == record['added_timesteps'] == 32768
            assert model.gamma == model.rollout_buffer.gamma == .99
            assert model.batch_size == 64 and model.n_steps == 256 and model.n_epochs == 4
            assert model.ent_coef == .003
            assert model.policy.optimizer.state
            assert all(group['lr'] == .0001 for group in model.policy.optimizer.param_groups)
            assert record['environment'] == a['environment']
            checked[f'seed-{seed}-{mode}'] = {'steps': model.num_timesteps, 'wall_seconds': record['wall_seconds'],
                                             'model_sha256': digest(run / 'model.zip'),
                                             'vecnormalize_sha256': digest(run / 'vecnormalize.pkl')}
            added += record['added_timesteps']
            wall += record['wall_seconds']
    assert added == 131072
    evaluated = 0
    for path in ROOT.glob('*.json'):
        record = read(path)
        if 'episodes' not in record:
            continue
        for row in record['episodes']:
            if 'reward_totals' in row:
                assert abs(sum(row['reward_totals'].values()) - row['reward']) < .001
            if row['end_reason'] == 'target_wave':
                assert row['contiguous_cleared'] == 20 and row['hp'] > 0
            assert row['invalid_actions'] == 0
            evaluated += 1
    selected = read(ROOT / 'selection-before-confirmation.json')
    assert not selected['confirmation']
    summary = read(ROOT / 'summary.json')
    assert selected['selected_candidate'] == summary['selected_candidate']
    checked['ppo_steps'] = added
    checked['ppo_wall_seconds'] = wall
    checked['recorded_episodes_including_demonstrations'] = evaluated
    checked['selected_before_confirmation'] = summary['selected_candidate']
    npu = read(WORK / 'ppo-next/npu-benchmark/results.json')
    assert npu['NPU']['full_name'] == 'Intel(R) AI Boost'
    assert not npu['adopt_npu_inference']
    checked['npu_measured'] = True
    checked['status'] = 'passed'
    (WORK / 'ppo-next/verification.json').write_text(json.dumps(checked, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(checked, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
