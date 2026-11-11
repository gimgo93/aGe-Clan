import argparse
from collections import Counter
import json
from pathlib import Path

import numpy as np
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.benchmark import reference_action, summarize
from ml.env import AgeClanEnv
from ml.experiment import environment_signature


def play(env, seed, predict, mode):
    obs, info = env.reset(seed=seed)
    build_ids = {i for i, action in enumerate(env.actions) if action['name'] == 'build'}
    counts = Counter()
    openings = []
    first_build = None
    first_leak = None
    intervention = None
    steps = invalid = wait_with_build = wait_with_expert_build = 0
    total_reward = 0.0
    survived_300 = False
    state_keys = ['time', 'gold', 'crystals', 'wood', 'hp', 'castle', 'wave']

    while True:
        mask = env.action_masks()
        scripted = reference_action(env, obs, 'scripted')
        scripted_build = scripted in build_ids and mask[scripted]
        action = scripted if mode == 'scripted' else predict(obs, mask)
        state = {key: float(obs[env.feature_names.index(key)]) for key in state_keys}
        if action == 0 and any(mask[i] for i in build_ids):
            wait_with_build += 1
        if action == 0 and scripted_build:
            wait_with_expert_build += 1
        if mode == 'scripted-first-build' and first_build is None and scripted_build:
            if action != scripted:
                intervention = {'before': state, 'policy': env.actions[action], 'used': env.actions[scripted]}
            action = scripted
        if mode == 'first-build-pad3' and first_build is None and action in build_ids:
            tower_type = env.actions[action]['args'][0]
            preferred = next(i for i, command in enumerate(env.actions)
                             if command == {'name': 'build', 'args': [tower_type, 3]})
            if action != preferred and mask[preferred]:
                intervention = {'before': state, 'policy': env.actions[action], 'used': env.actions[preferred]}
                action = preferred
        if action in build_ids and first_build is None:
            first_build = {'before': state, 'action': env.actions[action]}
        if first_leak is None and action != 0 and len(openings) < 20:
            openings.append({'before': state, 'action': env.actions[action]})
        counts[str(action)] += 1
        obs, reward, done, truncated, info = env.step(action)
        steps += 1
        total_reward += reward
        survived_300 |= info['game_time'] >= 300 - 1e-6 and info['hp'] > 0
        invalid += int('error' in info['action_result'])
        if first_leak is None and info['leaks']:
            first_leak = {'before': state, 'action': env.actions[action], 'wave': info['wave'],
                          'contiguous_cleared': info['contiguous_cleared'], 'time': info['game_time']}
        if done or truncated:
            return {'python_seed': seed, 'steps': steps, 'reward': total_reward, 'survived_300': survived_300,
                    'invalid_actions': invalid, 'action_counts': dict(counts),
                    'wait_with_build': wait_with_build, 'wait_with_expert_build': wait_with_expert_build,
                    'first_build': first_build, 'first_leak': first_leak,
                    'opening_actions': openings, 'intervention': intervention,
                    **{key: info[key] for key in ('cleared_waves', 'contiguous_cleared', 'leaks', 'damage_taken',
                                                  'game_time', 'completed', 'kills', 'hp', 'end_reason')}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('comparison', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--placement', action='store_true')
    args = parser.parse_args()
    comparison = json.loads((args.comparison / 'summary.json').read_text(encoding='utf-8'))
    dev = comparison['development']
    name = max(('legacy-g099', 'defense-g099', 'previous-masked'), key=lambda key: (
        dev[key]['target_successes'], dev[key]['mean_contiguous_cleared']))
    run = (Path(__file__).parent / 'ppo-phase6/ml/runs/phase6-wave20-20261022/defense-g099'
           if name == 'previous-masked' else args.comparison / name)
    manifest = json.loads((run / 'manifest.json').read_text(encoding='utf-8'))
    env_config = dict(manifest['config']['env'], reward_mode='defense-v1')
    torch.set_num_threads(1)
    with AgeClanEnv(**env_config) as env:
        assert environment_signature(env) == manifest['environment']
        vector = DummyVecEnv([lambda: env])
        vector = VecNormalize.load(run / 'vecnormalize.pkl', vector)
        vector.training = False
        model = MaskablePPO.load(run / 'model.zip', device='cpu')

        def predict(obs, mask):
            action, _ = model.predict(vector.normalize_obs(obs), deterministic=True, action_masks=mask)
            return int(action.item())

        results = {'model': name, 'diagnostic_seed_start': 94000, 'confirmation_seed_start': 97000}
        phases = [('diagnostic', 94000, 10, ('policy', 'scripted')),
                  ('confirmation', 97000, 20, ('policy', 'scripted-first-build'))]
        if args.placement:
            phases = [('development', 96000, 10, ('policy', 'first-build-pad3')),
                      ('confirmation', 99000, 20, ('policy', 'first-build-pad3'))]
            results['diagnostic_seed_start'] = 96000
            results['confirmation_seed_start'] = 99000
            results['intervention'] = 'Change only the first build pad to 3; same type and timing, policy thereafter.'
        for phase, start, count, modes in phases:
            results[phase] = {}
            for mode in modes:
                rows = [play(env, seed, predict, mode) for seed in range(start, start + count)]
                summary = summarize(rows)
                summary['wait_with_build'] = sum(row['wait_with_build'] for row in rows)
                summary['wait_with_expert_build'] = sum(row['wait_with_expert_build'] for row in rows)
                summary['interventions'] = sum(row['intervention'] is not None for row in rows)
                results[phase][mode] = {'episodes': rows, 'summary': summary}
                print(f'{phase} {mode}: {summary}', flush=True)
    with args.output.open('x', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
