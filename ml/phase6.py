"""Bounded, paired reward and long-horizon ablations for a 20-wave goal."""
import argparse
import json
from pathlib import Path
from copy import deepcopy

from ml.benchmark import reference_evaluate, summarize
from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--parent', type=Path, default=ROOT / 'ml/runs/phase3-continued-20261022/seed-42')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    config = load_config(args.parent / 'config.json', total_timesteps=16384)
    config['env'].update(max_ticks=30000, target_wave=20, reward_mode='defense-v1')
    config['ppo']['learning_rate'] = .0001
    variants = [('legacy-g099', 'legacy', .99), ('defense-g099', 'defense-v1', .99),
                ('defense-g0999', 'defense-v1', .999)]
    report = {'hypothesis': 'quality-weight actual wave clears; then increase gamma only',
              'training_seed': config['seed'], 'total_added_actions': 0,
              'common_evaluation_env': config['env'], 'development_seed_start': 92000,
              'confirmation_seed_start': 93000, 'development': {}, 'confirmation': {}, 'manifests': {}}
    for name, mode, gamma in variants:
        cfg = deepcopy(config); cfg['env']['reward_mode'] = mode; cfg['ppo']['gamma'] = gamma
        run = args.output / name
        print(f'Train {name}: 16384 added actions, same parent', flush=True)
        manifest = train(cfg, run, verbose=0, masked=True, checkpoint_freq=8192, transfer_from=args.parent)
        assert manifest['added_timesteps'] == 16384
        report['total_added_actions'] += manifest['added_timesteps']
        report['manifests'][name] = manifest
        episodes = evaluate(run, 10, 92000, env_config=config['env'])['episodes']
        report['development'][name] = {'summary': summarize(episodes), 'episodes': episodes}
        write_json(args.output / 'results.json', report)
        print(f'Development {name}: {report["development"][name]["summary"]}', flush=True)
    def rank(name):
        row = report['development'][name]['summary']
        return (row['target_successes'], row['mean_contiguous_cleared'], row['mean_kills'], row['mean_hp'], -row['mean_damage_taken'])
    report['selected_candidate'] = max(('defense-g099', 'defense-g0999'), key=rank)
    # Evaluate all ablations, even the unselected one: do not hide reversals on fresh seeds.
    policies = {name: args.output / name for name, _, _ in variants}
    policies['previous-masked-best'] = args.parent
    policies['previous-unmasked-best'] = ROOT / 'ml/runs/phase2-control-20261021/seed-43'
    for name, run in policies.items():
        episodes = evaluate(run, 10, 93000, env_config=config['env'])['episodes']
        report['confirmation'][name] = {'summary': summarize(episodes), 'episodes': episodes}
        print(f'Fresh {name}: {report["confirmation"][name]["summary"]}', flush=True)
        write_json(args.output / 'results.json', report)
    for name in ('random', 'scripted'):
        report['confirmation'][name] = reference_evaluate(config['env'], name, 10, 93000)
        print(f'Fresh {name}: {report["confirmation"][name]["summary"]}', flush=True)
        write_json(args.output / 'results.json', report)
    assert report['total_added_actions'] == 49152
    print('Complete: 49152 actions; all policies scored under defense-v1 and the same 20-wave objective', flush=True)


if __name__ == '__main__':
    main()
