"""Create a static experiment figure from local CSV logs and comparison.json."""
import argparse
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Figure already exists')
    report = json.loads((args.experiment / 'comparison.json').read_text(encoding='utf-8'))
    fig, axes = plt.subplots(1, 3, figsize=(14, 4), constrained_layout=True)
    for seed in (42, 43):
        with (args.experiment / f'seed-{seed}' / 'progress.csv').open(encoding='utf-8') as file:
            rows = list(csv.DictReader(file))
        rows = [row for row in rows if row.get('rollout/ep_rew_mean')]
        axes[0].plot([int(row['time/total_timesteps']) for row in rows],
                     [float(row['rollout/ep_rew_mean']) for row in rows], label=f'PPO seed {seed}')
    axes[0].set(title='Training return (rolling episode mean)', xlabel='Agent actions', ylabel='Return')
    axes[0].legend()
    names = list(report['policies'])
    labels = [name.replace('seed-', 'PPO\nseed ') for name in names]
    summaries = [report['policies'][name]['summary'] for name in names]
    axes[1].bar(labels, [row['mean_game_time'] for row in summaries], color=['#a0a0a0', '#b8c4d8', '#6d9e73', '#528ec2', '#bc7c36'])
    axes[1].set(title='Held-out mean survival time', ylabel='Game seconds', ylim=(0, 315))
    axes[1].axhline(300, linestyle='--', color='#555555', linewidth=1)
    axes[2].bar(labels, [100 * row['invalid_action_rate'] for row in summaries], color=['#a0a0a0', '#b8c4d8', '#6d9e73', '#528ec2', '#bc7c36'])
    axes[2].set(title='Held-out invalid actions', ylabel='Percent', ylim=(0, 100))
    for ax in axes:
        ax.grid(axis='y', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    fig.suptitle(f'aGe Clan phase 1 — 20 paired evaluation seeds, 300-second horizon', fontsize=13)
    fig.savefig(args.output, dpi=160)
    plt.close(fig)


if __name__ == '__main__':
    main()
