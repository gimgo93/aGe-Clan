"""Matched-seed reference policies and saved PPO evaluation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from ml.env import AgeClanEnv
from ml.evaluate import evaluate
from ml.experiment import DEFAULT_CONFIG, load_config, write_json


def summarize(episodes):
    total_steps = sum(row['steps'] for row in episodes)
    return {'episodes': len(episodes),
            **{f'mean_{key}': float(np.mean([row[key] for row in episodes]))
               for key in ('reward', 'game_time', 'completed', 'kills', 'hp')},
            'std_reward': float(np.std([row['reward'] for row in episodes])),
            'invalid_action_rate': sum(row['invalid_actions'] for row in episodes) / total_steps,
            'horizon_survivals': sum(row['end_reason'] == 'time_limit' and row['hp'] > 0 for row in episodes),
            'target_successes': sum(row['end_reason'] == 'target_wave' for row in episodes)}


def reference_action(env, observation, policy):
    if policy == 'wait':
        return 0
    if policy == 'random':
        return int(env.action_space.sample())
    if policy == 'masked-random':
        return int(env.action_space.np_random.choice(np.flatnonzero(env.action_masks())))
    values = dict(zip(env.feature_names, observation))
    # A deliberately fixed, simple reference controller, not game-rule validation.
    def find(name, args=None):
        return next(i for i, action in enumerate(env.actions)
                    if action['name'] == name and action.get('args') == args)
    level = int(values['level.archer'])
    if level < 5 and values['crystals'] >= (1, 5, 10, 15)[level - 1]:
        return find('upgradeTower', ['archer'])
    castle = int(values['castle'])
    if castle < 5 and values['crystals'] >= (2, 3, 5, 7)[castle - 1]:
        return find('upgradeCastle')
    if values['gold'] >= 140:
        for pad in (3, 0, 4, 5, 8, 6, 10, 2, 1, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25):
            if values[f'pad.{pad}.type'] == 0:
                return find('build', ['archer', pad])
    return 0


def reference_evaluate(env_config, policy, episodes, seed):
    if policy not in ('wait', 'random', 'masked-random', 'scripted'):
        raise ValueError('Unknown reference policy')
    if not 1 <= episodes <= 10000 or not 0 <= seed <= 2**32 - episodes:
        raise ValueError('Invalid episode count or seed range')
    results = []
    with AgeClanEnv(**env_config) as env:
        for index in range(episodes):
            observation, info = env.reset(seed=seed + index)
            env.action_space.seed(seed + index)
            total, steps, invalid = 0.0, 0, 0
            while True:
                action = reference_action(env, observation, policy)
                observation, reward, terminated, truncated, info = env.step(action)
                total += reward
                steps += 1
                invalid += int('error' in info['action_result'])
                if terminated or truncated:
                    results.append({'python_seed': seed + index, 'game_seed': info['seed'],
                                    'reward': total, 'steps': steps, 'invalid_actions': invalid,
                                    **{key: info[key] for key in ('game_time', 'completed', 'kills', 'hp', 'end_reason')}})
                    break
    return {'summary': summarize(results), 'episodes': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--run-dir', type=Path, action='append', default=[])
    parser.add_argument('--episodes', type=int, default=20)
    parser.add_argument('--seed', type=int, default=20000)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Report output already exists')
    config = load_config(args.config)
    report = {'env': config['env'], 'evaluation_seed_start': args.seed, 'policies': {}}
    for policy in ('wait', 'random', 'scripted'):
        report['policies'][policy] = reference_evaluate(config['env'], policy, args.episodes, args.seed)
    for run in args.run_dir:
        manifest = json.loads((run / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['config']['env'] != config['env']:
            raise ValueError('All policies must use the same environment settings')
        episodes = evaluate(run, args.episodes, args.seed)['episodes']
        report['policies'][str(run)] = {'summary': summarize(episodes), 'episodes': episodes}
    write_json(args.output, report)
    print(json.dumps({key: value['summary'] for key, value in report['policies'].items()}, indent=2))


if __name__ == '__main__':
    main()
