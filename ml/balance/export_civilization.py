"""Validate and export frozen civilization balance experiments without rerunning them."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import shutil

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from ml.experiment import ROOT, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output / 'summary.json').exists():
        parser.error('Evidence already exists')
    reports = {}
    for name in ('baseline-finaldev', 'armor020-finaldev', 'armor020-light070-finaldev', 'baseline-fresh', 'armor020-fresh'):
        path = ROOT / 'ml/runs/ops' / f'civilization-{name}.json'
        row = json.loads(path.read_text(encoding='utf-8'))
        assert row['source_sha256'] == next(iter(reports.values()))['source_sha256'] if reports else True
        expected = 20 if name.endswith('fresh') else 10
        assert all(len(p['episodes']) == expected for p in row['policies'].values())
        assert all(e['invalid'] == 0 for p in row['policies'].values() for e in p['episodes'])
        reports[name] = row
        shutil.copyfile(path, args.output / path.name)
    fresh = reports['armor020-fresh']['policies']
    for name in ('archer-fixed', 'archer-economy'):
        assert fresh[name]['summary']['max_cleared'] <= 15
    assert fresh['mixed-no-potions']['summary']['reached']['40'] == 0
    assert fresh['mixed-potions']['summary']['reached']['40'] > 0
    hashes = {name: hashlib.sha256((ROOT / name).read_text(encoding='utf-8').encode()).hexdigest()
              for name in ('public/game/game.js', 'public/game/balance.js', 'lib/game-engine.js',
                           'ml/balance/civilization.mjs', 'ml/balance/fixtures/game-before-civilization.js',
                           'ml/balance/fixtures/balance-before-civilization.js')}
    assert hashes['ml/balance/civilization.mjs'] == reports['baseline-fresh']['source_sha256']['harness']
    summary = {name: {policy: p['summary'] for policy, p in report['policies'].items()} for name, report in reports.items()}
    write_json(args.output / 'summary.json', summary)
    write_json(args.output / 'provenance.json', {'selected': 'armor-020', 'source_sha256': hashes,
        'measured_final_comparison_seconds': sum(r['wall_seconds'] for r in reports.values()),
        'note': 'Final fixed-policy comparisons only; exploratory policy pilots excluded'})
    keys = ('seed', 'cleared', 'time', 'hp', 'kills', 'damage', 'leaks', 'destroyed', 'castle', 'miners', 'workers', 'end')
    with (args.output / 'episodes.csv').open('w', newline='', encoding='utf-8') as out:
        writer = csv.writer(out); writer.writerow(('experiment', 'policy', *keys))
        for name, r in reports.items():
            for policy, p in r['policies'].items():
                for e in p['episodes']:
                    writer.writerow((name, policy, *(e[k] for k in keys)))
    names = list(fresh); fig, axes = plt.subplots(1, 3, figsize=(14, 4.2), constrained_layout=True)
    for ax, metric, title in zip(axes, ('mean_cleared', '30', '40'), ('Actual waves cleared (mean)', 'Reach wave 30 / 20', 'Reach wave 40 / 20')):
        old = summary['baseline-fresh']; new = summary['armor020-fresh']
        value = lambda row: row[metric] if metric == 'mean_cleared' else row['reached'][metric]
        y = list(range(len(names)))
        ax.barh([v-.18 for v in y], [value(old[n]) for n in names], height=.35, label='Before', color='#a9afb7')
        ax.barh([v+.18 for v in y], [value(new[n]) for n in names], height=.35, label='Solo armor patch', color='#548aab')
        ax.set_yticks(y, names); ax.invert_yaxis(); ax.set_title(title); ax.grid(axis='x', alpha=.2)
        ax.set_xlim(0, 40 if metric == 'mean_cleared' else 20)
    axes[0].legend(); fig.suptitle('Fresh seeds 110000–110019; real resources; sabotage enabled')
    fig.savefig(args.output / 'comparison.png', dpi=150); plt.close(fig)
    print(json.dumps(summary['armor020-fresh'], indent=2))


if __name__ == '__main__':
    main()
