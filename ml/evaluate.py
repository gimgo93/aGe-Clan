"""Evaluate a saved starter run on fixed evaluation seeds, without learning."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.env import AgeClanEnv
from ml.experiment import check_policy_transfer, environment_signature, write_json


def evaluate(run_dir, episodes=5, seed=10000, initial_policy=False, env_config=None):
    if type(episodes) is not int or not 1 <= episodes <= 10000:
        raise ValueError('episodes must be between 1 and 10000')
    if type(seed) is not int or seed < 0 or seed + episodes - 1 > 2**32 - 1:
        raise ValueError('Evaluation seeds must fit uint32')
    run_dir = Path(run_dir).resolve()
    manifest = json.loads((run_dir / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('status') != 'complete' or manifest.get('algorithm') not in ('PPO', 'MaskablePPO'):
        raise ValueError('Expected a completed starter PPO run')
    torch.set_num_threads(manifest['config']['torch_threads'])
    masked = manifest['algorithm'] == 'MaskablePPO'
    algorithm = PPO
    if masked:
        from sb3_contrib import MaskablePPO
        from sb3_contrib.common.maskable.utils import get_action_masks
        algorithm = MaskablePPO
    actual_env = manifest['config']['env'] if env_config is None else env_config
    vector = DummyVecEnv([lambda: AgeClanEnv(**actual_env)])
    try:
        signature = environment_signature(vector.envs[0].unwrapped)
        if env_config is not None:
            check_policy_transfer(manifest['environment'], signature)
        elif signature != manifest['environment']:
            raise ValueError('Game rules or observation/action schema differ from the saved run')
        vector = VecNormalize.load(run_dir / 'vecnormalize.pkl', vector)
        vector.training = False  # Freeze training statistics on evaluation seeds.
        vector.norm_reward = False
        if initial_policy:
            # Controlled weight comparison: same trained observation statistics,
            # but reconstruct the original randomly initialized policy without learn().
            model = algorithm('MlpPolicy', vector, device='cpu', seed=manifest['config']['seed'],
                        verbose=0, **manifest['config']['ppo'])
        else:
            model = algorithm.load(run_dir / 'model.zip', env=vector, device='cpu')
        results = []
        for index in range(episodes):
            episode_seed = seed + index
            vector.seed(episode_seed)
            obs = vector.reset()
            total, steps, invalid = 0.0, 0, 0
            action_counts, invalid_counts = {}, {}
            survived_300 = False
            while True:
                predict_args = {'action_masks': get_action_masks(vector)} if masked else {}
                action, _ = model.predict(obs, deterministic=True, **predict_args)
                action_id = str(int(action[0]))
                action_counts[action_id] = action_counts.get(action_id, 0) + 1
                obs, reward, done, infos = vector.step(action)
                info = infos[0]
                survived_300 |= info['game_time'] >= 300 - 1e-6 and info['hp'] > 0
                total += float(reward[0])
                steps += 1
                invalid += int('error' in info['action_result'])
                if 'error' in info['action_result']:
                    invalid_counts[action_id] = invalid_counts.get(action_id, 0) + 1
                if done[0]:
                    results.append({'python_seed': episode_seed, 'game_seed': info['seed'],
                                    'reward': total, 'steps': steps, 'invalid_actions': invalid,
                                    'action_counts': action_counts, 'invalid_action_counts': invalid_counts,
                                    'survived_300': survived_300,
                                    **{key: info[key] for key in ('cleared_waves', 'contiguous_cleared', 'leaks', 'damage_taken', 'reward_totals')},
                                    **{key: info[key] for key in ('game_time', 'completed', 'kills', 'hp', 'end_reason')}})
                    break
        return {'policy_mode': 'initial_weights_with_trained_normalization' if initial_policy else 'trained',
                'evaluation_env': actual_env, 'explicit_objective_transfer': env_config is not None,
                'episodes': results, 'mean_reward': float(np.mean([r['reward'] for r in results])),
                'mean_completed': float(np.mean([r['completed'] for r in results])),
                'target_successes': sum(r['end_reason'] == 'target_wave' for r in results)}
    finally:
        vector.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--episodes', type=int, default=5)
    parser.add_argument('--seed', type=int, default=10000)
    parser.add_argument('--initial-policy', action='store_true', help='Control: initial random weights with the same normalization')
    parser.add_argument('--env-config', type=Path, help='Explicit common objective config for cross-objective evaluation')
    parser.add_argument('--output', type=Path, help='Optional new report file (existing files are refused)')
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error('Report output already exists; choose a new file')
    env_config = json.loads(args.env_config.read_text(encoding='utf-8-sig'))['env'] if args.env_config else None
    report = evaluate(args.run_dir, args.episodes, args.seed, initial_policy=args.initial_policy, env_config=env_config)
    if args.output:
        write_json(args.output, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
