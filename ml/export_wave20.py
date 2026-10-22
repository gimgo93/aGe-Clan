"""Export and validate a completed bounded 20-wave experiment."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sb3_contrib import MaskablePPO

from ml.experiment import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.run_dir / 'results.json').read_text(encoding='utf-8'))
    if 'scripted' not in report['confirmation'] or report['total_added_actions'] != 49152:
        parser.error('Expected completed 49152-action experiment')
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output / 'results.json').exists():
        parser.error('Previous evidence exists; choose a new output')
    names = ('legacy-g099', 'defense-g099', 'defense-g0999')
    parent = None
    seconds = 0
    provenance = {}
    for name in names:
        run = args.run_dir / name
        m = json.loads((run / 'manifest.json').read_text(encoding='utf-8'))
        assert m == report['manifests'][name]
        assert m['status'] == 'complete' and m['added_timesteps'] == 16384 and m['actual_timesteps'] == 81920
        assert m['config']['seed'] == 42 and m['config']['torch_threads'] == 1
        parent = parent or m['transfer_from']
        assert m['transfer_from'] == parent
        model = MaskablePPO.load(run / 'model.zip', device='cpu')
        gamma = .999 if name.endswith('0999') else .99
        assert model.gamma == model.rollout_buffer.gamma == gamma
        assert model.lr_schedule(1) == .0001
        assert all(group['lr'] == .0001 for group in model.policy.optimizer.param_groups)
        seconds += m['wall_seconds']
        provenance[name] = {**m, 'artifact_sha256': {
            file: hashlib.sha256((run / file).read_bytes()).hexdigest()
            for file in ('model.zip', 'vecnormalize.pkl')}}
        shutil.copyfile(run / 'progress.csv', args.output / f'progress-{name}.csv')
    base = provenance['legacy-g099']['config']
    for name in names:
        expected = deepcopy(base)
        if name != 'legacy-g099':
            expected['env']['reward_mode'] = 'defense-v1'
        if name == 'defense-g0999':
            expected['ppo']['gamma'] = .999
        assert provenance[name]['config'] == expected
        assert provenance[name]['environment'] == provenance['legacy-g099']['environment']
    assert seconds < 600, f'Training exceeded intended 10-minute bound: {seconds}'
    for group in ('development', 'confirmation'):
        for row in report[group].values():
            assert len(row['episodes']) == 10
            for episode in row['episodes']:
                assert abs(sum(episode['reward_totals'].values()) - episode['reward']) < .0001
                if episode['end_reason'] == 'target_wave':
                    assert episode['contiguous_cleared'] >= 20 and episode['hp'] > 0
    shutil.copyfile(args.run_dir / 'results.json', args.output / 'results.json')
    write_json(args.output / 'provenance.json', {'training_seconds': seconds, 'runs': provenance})
    summary = {group: {name: row['summary'] for name, row in report[group].items()}
               for group in ('development', 'confirmation')}
    summary['selected_candidate'] = report['selected_candidate']
    write_json(args.output / 'summary.json', summary)
    rows = summary['confirmation']
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), constrained_layout=True)
    for ax, key, title in zip(axes, ('target_successes', 'mean_contiguous_cleared', 'mean_game_time'),
                             ('20-wave successes / 10', 'Mean contiguous actual waves cleared', 'Mean survival (game seconds)')):
        ax.barh(list(rows), [row[key] for row in rows.values()], color='#5288ad')
        ax.invert_yaxis(); ax.set_title(title); ax.grid(axis='x', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    axes[0].set_xlim(0, 10)
    fig.suptitle('aGe Clan: common 20-wave objective / defense-v1 rewards / fresh seeds 93000-93009')
    fig.savefig(args.output / 'comparison.png', dpi=150); plt.close(fig)
    print(json.dumps(summary, indent=2))
    print(f'Validated training seconds: {seconds:.2f}')


if __name__ == '__main__':
    main()
