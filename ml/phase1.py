"""Run the bounded phase-one experiment: two seeds, then matched-seed benchmarks."""
import argparse
from pathlib import Path

from ml.benchmark import reference_evaluate, summarize
from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    config_path = ROOT / 'ml' / 'configs' / 'phase1.json'
    runs = []
    for seed in (42, 43):
        config = load_config(config_path)
        config['seed'] = seed
        run = output / f'seed-{seed}'
        print(f'Training seed={seed}, actions={config["total_timesteps"]}', flush=True)
        manifest = train(config, run, verbose=0, checkpoint_freq=8192)
        print(f'Finished seed={seed} in {manifest["wall_seconds"]:.1f}s', flush=True)
        runs.append(run)
    config = load_config(config_path)
    report = {'env': config['env'], 'evaluation_seed_start': 20000, 'policies': {}}
    for policy in ('wait', 'random', 'scripted'):
        result = reference_evaluate(config['env'], policy, episodes=20, seed=20000)
        report['policies'][policy] = result
        print(f'{policy}: {result["summary"]}', flush=True)
    for run in runs:
        episodes = evaluate(run, episodes=20, seed=20000)['episodes']
        report['policies'][run.name] = {'summary': summarize(episodes), 'episodes': episodes}
        print(f'{run.name}: {report["policies"][run.name]["summary"]}', flush=True)
    write_json(output / 'comparison.json', report)
    print(f'Experiment complete: {output}', flush=True)


if __name__ == '__main__':
    main()
