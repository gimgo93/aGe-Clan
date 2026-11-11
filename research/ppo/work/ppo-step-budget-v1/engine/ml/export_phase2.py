"""Export measured phase-two evidence and a static comparison figure."""
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
    for name in ('control', 'masked', 'low-entropy', 'output'):
        parser.add_argument(f'--{name}', type=Path, required=True)
    args = parser.parse_args()
    sources = {'control': args.control, 'masked': args.masked, 'low-entropy': args.low_entropy}
    reports = {name: json.loads((folder / 'comparison.json').read_text(encoding='utf-8'))
               for name, folder in sources.items()}
    for report in reports.values():
        if not all(key in report['policies'] for key in ('seed-42', 'seed-43', 'scripted')):
            raise ValueError('Experiment is not complete')
    args.output.mkdir(parents=True, exist_ok=False)
    summaries, evidence = {}, {}
    for variant, folder in sources.items():
        shutil.copyfile(folder / 'comparison.json', args.output / f'{variant}.json')
        for seed in (42, 43):
            key = f'{variant}-{seed}'
            run = folder / f'seed-{seed}'
            manifest = json.loads((run / 'manifest.json').read_text(encoding='utf-8'))
            summaries[key] = reports[variant]['policies'][f'seed-{seed}']['summary']
            evidence[key] = {name: manifest[name] for name in ('algorithm', 'config', 'runtime', 'actual_timesteps', 'wall_seconds')}
            evidence[key]['source_sha256'] = manifest['environment']['source_sha256']
            evidence[key]['parameters'] = manifest['model']['parameters']
            evidence[key]['artifact_sha256'] = {name: hashlib.sha256((run / name).read_bytes()).hexdigest()
                                              for name in ('model.zip', 'vecnormalize.pkl')}
            shutil.copyfile(run / 'progress.csv', args.output / f'progress-{key}.csv')
    summaries['scripted'] = reports['control']['policies']['scripted']['summary']
    masked_random = args.masked / 'masked-random.json'
    if masked_random.exists():
        shutil.copyfile(masked_random, args.output / 'masked-random.json')
        summaries['masked-random'] = json.loads(masked_random.read_text(encoding='utf-8'))['summary']
    write_json(args.output / 'summary.json', summaries)
    write_json(args.output / 'provenance.json', evidence)
    names = list(summaries)
    colors = ['#5683ae' if n.startswith('control') else '#b97c34' if n.startswith('masked-')
              else '#8b729b' if n.startswith('low-') else '#629570' for n in names]
    fig, axes = plt.subplots(1, 3, figsize=(14, 5), constrained_layout=True)
    for ax, metric, title, scale in zip(axes,
            ('mean_game_time', 'mean_completed', 'invalid_action_rate'),
            ('Mean survival (game seconds)', 'Mean completed wave', 'Invalid actions (%)'), (1, 1, 100)):
        ax.barh(names, [summaries[n][metric] * scale for n in names], color=colors)
        ax.invert_yaxis()
        ax.set_title(title)
        ax.grid(axis='x', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    fig.suptitle('aGe Clan phase 2: same rewards, 32,768 actions per seed, 20 paired evaluations')
    fig.savefig(args.output / 'comparison.png', dpi=160)
    plt.close(fig)
    print(json.dumps(summaries, indent=2))


if __name__ == '__main__':
    main()
