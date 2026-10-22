"""Export completed resumed-training evidence without changing model files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from ml.experiment import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.run_dir / 'results.json').read_text(encoding='utf-8'))
    if 'scripted' not in report['confirmation']:
        parser.error('Experiment is not complete')
    if args.output.exists() and any(p.name != 'PLAN.md' for p in args.output.iterdir()):
        parser.error('Output contains previous artifacts; choose a new folder')
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = {}
    for seed in (42, 43):
        run = args.run_dir / f'seed-{seed}'
        manifest = json.loads((run / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['status'] != 'complete' or manifest['added_timesteps'] != 32768:
            raise ValueError('Expected completed bounded resumed training')
        evidence[f'seed-{seed}'] = {key: manifest[key] for key in (
            'algorithm', 'config', 'actual_timesteps', 'added_timesteps', 'wall_seconds', 'runtime', 'model')}
        evidence[f'seed-{seed}']['source_sha256'] = manifest['environment']['source_sha256']
        evidence[f'seed-{seed}']['artifact_sha256'] = {
            name: hashlib.sha256((run / name).read_bytes()).hexdigest()
            for name in ('model.zip', 'vecnormalize.pkl')}
        shutil.copyfile(run / 'progress.csv', args.output / f'progress-seed-{seed}.csv')
    shutil.copyfile(args.run_dir / 'results.json', args.output / 'results.json')
    write_json(args.output / 'provenance.json', evidence)
    summary = {'selected_candidate_seed': report['selected_candidate_seed'],
               **{group: {name: row['summary'] for name, row in report[group].items()}
                  for group in ('development', 'confirmation')}}
    write_json(args.output / 'summary.json', summary)
    rows = {**summary['development'],
            **{f'fresh:{name}': row for name, row in summary['confirmation'].items()
               if name not in ('wait', 'random')}}
    names = list(rows)
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.5), constrained_layout=True)
    for ax, key, title, factor in zip(axes,
            ('horizon_survivals', 'mean_completed', 'invalid_action_rate'),
            ('300-second survivals / 20', 'Mean completed wave', 'Invalid actions (%)'), (1, 1, 100)):
        ax.barh(names, [rows[name][key] * factor for name in names],
                color=['#5487ad' if 'continued' in name else '#bf8b50' if 'parent' in name else '#699475'
                       for name in names])
        ax.invert_yaxis()
        ax.set_title(title)
        ax.grid(axis='x', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    total = evidence['seed-42']['actual_timesteps']
    fig.suptitle(f'aGe Clan: {total:,} cumulative actions per masked policy; settings unchanged')
    fig.savefig(args.output / 'comparison.png', dpi=150)
    plt.close(fig)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
