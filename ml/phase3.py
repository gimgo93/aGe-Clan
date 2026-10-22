"""Resume two masked policies with only the training budget changed."""
import argparse
import json
from pathlib import Path

from ml.benchmark import reference_evaluate, summarize
from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--parents', type=Path, default=ROOT / 'ml/runs/phase2-low-entropy-20261021')
    parser.add_argument('--confirmation-seed', type=int, default=60000)
    args = parser.parse_args()
    if not 0 <= args.confirmation_seed <= 2**32 - 20:
        parser.error('Confirmation seed range must fit uint32')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    parents = args.parents.resolve()
    report = {'change': '32768 additional actions; all settings fixed',
              'development_seed_start': 40000, 'confirmation_seed_start': args.confirmation_seed,
              'development': {}, 'confirmation': {}}
    for seed in (42, 43):
        parent = parents / f'seed-{seed}'
        config = load_config(parent / 'config.json', total_timesteps=32768)
        previous_steps = json.loads((parent / 'manifest.json').read_text(encoding='utf-8'))['actual_timesteps']
        run = output / f'seed-{seed}'
        print(f'Resume masked seed={seed}: +32768 actions', flush=True)
        manifest = train(config, run, verbose=0, masked=True, checkpoint_freq=8192, resume_from=parent)
        if manifest['added_timesteps'] != 32768 or manifest['actual_timesteps'] != previous_steps + 32768:
            raise RuntimeError('Unexpected resume step accounting')
        episodes = evaluate(run, 20, 40000)['episodes']
        report['development'][f'continued-{seed}'] = {'summary': summarize(episodes), 'episodes': episodes}
        episodes = evaluate(parent, 20, 40000)['episodes']
        report['development'][f'parent-{seed}'] = {'summary': summarize(episodes), 'episodes': episodes}
        write_json(output / 'results.json', report)
        print(f'seed={seed}: {report["development"][f"continued-{seed}"]["summary"]}', flush=True)
    def rank(seed, prefix='continued'):
        row = report['development'][f'{prefix}-{seed}']['summary']
        return (row['horizon_survivals'], row['mean_completed'], row['mean_kills'], row['mean_hp'], row['mean_reward'])
    selected = max((42, 43), key=rank)
    parent_selected = max((42, 43), key=lambda seed: rank(seed, 'parent'))
    report['selected_candidate_seed'] = selected
    candidates = {'continued': output / f'seed-{selected}',
                  f'parent-masked-{parent_selected}': parents / f'seed-{parent_selected}',
                  'best-unmasked-43': ROOT / 'ml/runs/phase2-control-20261021/seed-43'}
    for name, run in candidates.items():
        episodes = evaluate(run, 20, args.confirmation_seed)['episodes']
        report['confirmation'][name] = {'summary': summarize(episodes), 'episodes': episodes}
        print(f'Confirmation {name}: {report["confirmation"][name]["summary"]}', flush=True)
    for policy in ('wait', 'random', 'scripted'):
        report['confirmation'][policy] = reference_evaluate(config['env'], policy, 20, args.confirmation_seed)
    write_json(output / 'results.json', report)
    print(f'Completed: {output}', flush=True)


if __name__ == '__main__':
    main()
