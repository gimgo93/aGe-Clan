import argparse
from copy import deepcopy
import json
from pathlib import Path

from ml.benchmark import reference_evaluate, summarize
from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train


def saved(run, config, seed, episodes=10):
    rows = evaluate(run, episodes, seed, env_config=config)['episodes']
    return {'summary': summarize(rows), 'episodes': rows}


def report(output, name, result):
    write_json(output / f'{name}.json', result)
    print(f'{name}: {result["summary"]}', flush=True)


def reproduce(output, env):
    run = ROOT / 'ml/runs/phase6-wave20-20261022/defense-g099'
    # The original objective and signature should load without an explicit transfer.
    rows = evaluate(run, 10, 93000)['episodes']
    learned = {'summary': summarize(rows), 'episodes': rows}
    rules = reference_evaluate(env, 'scripted', 10, 93000)
    report(output, 'defense-g099', learned)
    report(output, 'scripted', rules)
    assert [row['contiguous_cleared'] for row in rows] == [9, 9, 9, 9, 7, 9, 9, 9, 9, 7]
    assert learned['summary']['target_successes'] == 0
    assert learned['summary']['invalid_action_rate'] == 0
    assert rules['summary']['target_successes'] == 10


def compare_rewards(output, env):
    parent = ROOT / 'ml/runs/phase3-continued-20261022/seed-43'
    config = load_config(parent / 'config.json', total_timesteps=16384)
    config['env'] = env
    config['ppo'].update(gamma=.99, learning_rate=.0001)
    variants = {}
    for name, reward in [('legacy-g099', 'legacy'), ('defense-g099', 'defense-v1')]:
        case = deepcopy(config)
        case['env']['reward_mode'] = reward
        variants[name] = output / name
        print(f'Training {name}, seed 43, 16,384 actions', flush=True)
        manifest = train(case, variants[name], verbose=0, checkpoint_freq=8192,
                         masked=True, transfer_from=parent)
        assert manifest['added_timesteps'] == 16384
        print(f'Finished {name} in {manifest["wall_seconds"]:.1f}s', flush=True)
    references = {
        'previous-masked': ROOT / 'ml/runs/phase6-wave20-20261022/defense-g099',
        'previous-unmasked': ROOT / 'ml/runs/phase2-control-20261021/seed-43',
    }
    results = {}
    for stage, seed in [('development', 94000), ('confirmation', 95000)]:
        results[stage] = {}
        for name, run in (variants | references).items():
            result = saved(run, env, seed)
            report(output, f'{stage}-{name}', result)
            results[stage][name] = result['summary']
        result = reference_evaluate(env, 'scripted', 10, seed)
        report(output, f'{stage}-scripted', result)
        results[stage]['scripted'] = result['summary']
    write_json(output / 'summary.json', results)


CURRENT_SEED = 98000
CURRENT_EPISODES = 20


def current_baseline(output, config):
    rules = reference_evaluate(config['env'], 'scripted', CURRENT_EPISODES, CURRENT_SEED)
    report(output, 'scripted', rules)


def current_engine(output, config):
    rules = json.loads((output / 'scripted.json').read_text(encoding='utf-8'))
    assert [row['python_seed'] for row in rules['episodes']] == list(range(CURRENT_SEED, CURRENT_SEED + CURRENT_EPISODES))
    run = output / 'fresh-defense-g099'
    print('Training fresh current-engine MaskablePPO, seed 42, 16,384 actions', flush=True)
    manifest = train(config, run, verbose=0, checkpoint_freq=8192, masked=True)
    assert manifest['added_timesteps'] == 16384
    print(f'Finished current-engine training in {manifest["wall_seconds"]:.1f}s', flush=True)
    rows = evaluate(run, CURRENT_EPISODES, CURRENT_SEED)['episodes']
    learned = {'summary': summarize(rows), 'episodes': rows}
    report(output, 'fresh-defense-g099-evaluation', learned)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['reproduce', 'compare-rewards', 'current-baseline', 'current-engine'])
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    config = load_config(ROOT / 'ml/configs/wave20.json')
    if args.stage == 'current-engine':
        current_engine(args.output, config)
        return
    args.output.mkdir(parents=True, exist_ok=False)
    if args.stage == 'current-baseline':
        current_baseline(args.output, config)
    else:
        execute = reproduce if args.stage == 'reproduce' else compare_rewards
        execute(args.output, config['env'])


if __name__ == '__main__':
    main()
