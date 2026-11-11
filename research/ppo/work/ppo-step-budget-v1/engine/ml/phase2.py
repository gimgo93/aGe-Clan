"""Controlled mask experiment, with an optional single-parameter follow-up."""
import argparse
from pathlib import Path

from ml.benchmark import reference_evaluate, summarize
from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--variant', choices=('control', 'masked', 'low-entropy'), required=True)
    parser.add_argument('--episodes', type=int, default=20)
    parser.add_argument('--eval-seed', type=int, default=40000)
    args = parser.parse_args()
    if not 1 <= args.episodes <= 10000 or not 0 <= args.eval_seed <= 2**32 - args.episodes:
        parser.error('Invalid evaluation episode count or seed range')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    report = {'variant': args.variant, 'evaluation_seed_start': args.eval_seed, 'policies': {}}
    for seed in (42, 43):
        config = load_config(ROOT / 'ml' / 'configs' / 'phase1.json')
        config['seed'] = seed
        if args.variant == 'low-entropy':
            config['ppo']['ent_coef'] = 0.003
        run = output / f'seed-{seed}'
        print(f'Training {args.variant}, seed={seed}, steps={config["total_timesteps"]}', flush=True)
        manifest = train(config, run, verbose=0, checkpoint_freq=8192, masked=args.variant != 'control')
        episodes = evaluate(run, args.episodes, args.eval_seed)['episodes']
        report['policies'][run.name] = {'summary': summarize(episodes), 'episodes': episodes,
                                       'training_seconds': manifest['wall_seconds']}
        write_json(output / 'comparison.json', report)
        print(f'{run.name}: {report["policies"][run.name]["summary"]}', flush=True)
    for policy in ('wait', 'random', 'scripted'):
        report['policies'][policy] = reference_evaluate(config['env'], policy, args.episodes, args.eval_seed)
    write_json(output / 'comparison.json', report)
    print(f'Complete: {output}', flush=True)


if __name__ == '__main__':
    main()
