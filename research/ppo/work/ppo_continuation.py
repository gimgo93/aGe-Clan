import hashlib
import json
from pathlib import Path
from time import perf_counter

import numpy as np
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.benchmark import reference_action, reference_evaluate, summarize
from ml.env import AgeClanEnv
from ml.evaluate import evaluate
from ml.experiment import ROOT, environment_signature, load_config, runtime_versions, write_json
from ml.train import train


WORK = Path(__file__).resolve().parent
OUTPUT = WORK / 'ppo-next/learning'
PREVIOUS = WORK / 'ppo-results/current-engine/fresh-defense-g099'
CONFIG = load_config(ROOT / 'ml/configs/wave20.json', total_timesteps=32768)


def collect(path, start, count):
    observations, masks, labels, episode_ids, episodes = [], [], [], [], []
    with AgeClanEnv(**CONFIG['env']) as env:
        for seed in range(start, start + count):
            obs, info = env.reset(seed=seed)
            steps = invalid = 0
            reward_total = 0.0
            while True:
                mask = env.action_masks()
                action = reference_action(env, obs, 'scripted')
                assert mask[action], f'Illegal teacher action {action}'
                observations.append(obs.copy())
                masks.append(mask)
                labels.append(action)
                episode_ids.append(seed)
                obs, reward, done, truncated, info = env.step(action)
                reward_total += reward
                steps += 1
                invalid += int('error' in info['action_result'])
                if done or truncated:
                    episodes.append({'python_seed': seed, 'steps': steps, 'reward': reward_total,
                                     'invalid_actions': invalid, 'survived_300': info['game_time'] >= 300 and info['hp'] > 0,
                                     **{key: info[key] for key in ('cleared_waves', 'contiguous_cleared', 'leaks', 'damage_taken',
                                                                   'game_time', 'completed', 'kills', 'hp', 'end_reason')}})
                    break
        np.savez_compressed(path, observations=np.asarray(observations, dtype=np.float32),
                            masks=np.asarray(masks, dtype=bool), labels=np.asarray(labels, dtype=np.int64),
                            episode_ids=np.asarray(episode_ids, dtype=np.int64))
        report = {'summary': summarize(episodes), 'episodes': episodes,
                  'samples': len(labels), 'nonwait_samples': sum(value != 0 for value in labels),
                  'environment': environment_signature(env)}
        write_json(path.with_suffix('.json'), report)
        print(f'Collected {path.name}: {report["summary"]}, {len(labels)} states', flush=True)
        return report


def accuracy(model, vector, data):
    labels = data['labels']
    correct = np.zeros(len(labels), dtype=bool)
    loss = 0.0
    with torch.inference_mode():
        for start in range(0, len(labels), 1024):
            end = start + 1024
            obs = torch.from_numpy(vector.normalize_obs(data['observations'][start:end]))
            dist = model.policy.get_distribution(obs, action_masks=data['masks'][start:end])
            targets = torch.from_numpy(labels[start:end])
            predictions = dist.get_actions(deterministic=True)
            correct[start:end] = predictions.numpy() == labels[start:end]
            loss -= float(dist.log_prob(targets).sum())
    return {'accuracy': float(correct.mean()), 'wait_accuracy': float(correct[labels == 0].mean()),
            'nonwait_accuracy': float(correct[labels != 0].mean()), 'cross_entropy': loss / len(labels)}


def initialize(seed, imitate, training, validation):
    name = f'seed-{seed}/' + ('imitation-initial' if imitate else 'control-initial')
    run = OUTPUT / name
    run.mkdir(parents=True, exist_ok=False)
    config = dict(CONFIG, seed=seed)
    began = perf_counter()
    vector = VecNormalize(DummyVecEnv([lambda: AgeClanEnv(**config['env'])]),
                          norm_obs=True, norm_reward=False, clip_obs=10.0, gamma=.99)
    try:
        vector.obs_rms.update(training['observations'])
        model = MaskablePPO('MlpPolicy', vector, seed=seed, device='cpu', verbose=0, **config['ppo'])
        initial_parameters = {key: value.detach().clone() for key, value in model.policy.state_dict().items()}
        initial_hash = hashlib.sha256(b''.join(tensor.numpy().tobytes() for tensor in initial_parameters.values())).hexdigest()
        steps = []
        if imitate:
            normalized = torch.from_numpy(vector.normalize_obs(training['observations']))
            labels = torch.from_numpy(training['labels'])
            masks = training['masks']
            wait_ids = np.flatnonzero(training['labels'] == 0)
            action_ids = np.flatnonzero(training['labels'] != 0)
            actor_params = list(model.policy.mlp_extractor.policy_net.parameters()) + list(model.policy.action_net.parameters())
            optimizer = torch.optim.Adam(actor_params, lr=.001)
            rng = np.random.default_rng(seed)
            model.policy.set_training_mode(True)
            for update in range(2000):
                indices = np.concatenate((rng.choice(wait_ids, 128), rng.choice(action_ids, 128)))
                dist = model.policy.get_distribution(normalized[indices], action_masks=masks[indices])
                loss = -dist.log_prob(labels[indices]).mean()
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(actor_params, 1.0)
                optimizer.step()
                if (update + 1) % 500 == 0:
                    steps.append({'update': update + 1, 'loss': float(loss.detach())})
                    print(f'Imitation seed {seed}, update {update + 1}, loss {float(loss.detach()):.4f}', flush=True)
            for key, value in model.policy.state_dict().items():
                if 'value_net' in key:
                    assert torch.equal(value, initial_parameters[key]), f'Critic changed during actor initialization {key}'
            assert len(model.policy.optimizer.state) == 0, 'PPO optimizer should start fresh in both branches'
        model.policy.set_training_mode(False)
        metrics = {'training': accuracy(model, vector, training), 'validation': accuracy(model, vector, validation)}
        model.save(run / 'model.zip')
        vector.save(run / 'vecnormalize.pkl')
        manifest = {'status': 'complete', 'stage': 'actor_initialization', 'algorithm': 'MaskablePPO',
                    'device': 'cpu', 'config': config, 'actual_timesteps': 0, 'added_timesteps': 0,
                    'ppo_training_performed': False, 'imitation_updates': 2000 if imitate else 0,
                    'initial_parameter_sha256': initial_hash, 'wall_seconds': perf_counter() - began,
                    'imitation_progress': steps, 'imitation_accuracy': metrics,
                    'normalization_source': 'teacher-training.npz only, seeds 210000-210019',
                    'environment': environment_signature(vector.envs[0]), 'runtime': runtime_versions()}
        write_json(run / 'config.json', config)
        write_json(run / 'manifest.json', manifest)
        print(f'Initialized {name}, validation {metrics["validation"]}', flush=True)
        return run, manifest
    finally:
        vector.close()


def eval_saved(run, seed, episodes, name, initial=False):
    evaluated = evaluate(run, episodes, seed, initial_policy=initial)
    result = {'summary': summarize(evaluated['episodes']), **evaluated}
    write_json(OUTPUT / f'{name}.json', result)
    print(f'{name}: {result["summary"]}', flush=True)
    return result


def main():
    OUTPUT.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(1)
    eval_saved(PREVIOUS, 220000, 10, 'diagnostic-initial-weights', initial=True)
    eval_saved(PREVIOUS, 220000, 10, 'diagnostic-previous-model')
    collect(OUTPUT / 'teacher-training.npz', 210000, 20)
    collect(OUTPUT / 'teacher-validation.npz', 211000, 5)
    training = np.load(OUTPUT / 'teacher-training.npz')
    validation = np.load(OUTPUT / 'teacher-validation.npz')
    results = {'development': {}, 'confirmation': {}, 'training_plan': {'ppo_steps_per_run': 32768,
               'training_seeds': [42, 43], 'development_seed': 220000, 'confirmation_seed': 230000}}
    for seed in (42, 43):
        initializers = {}
        hashes = []
        for mode, imitate in [('control', False), ('imitation', True)]:
            run, record = initialize(seed, imitate, training, validation)
            initializers[mode] = run
            hashes.append(record['initial_parameter_sha256'])
            eval_saved(run, 220000, 10, f'development-seed-{seed}-{mode}-initial')
        assert hashes[0] == hashes[1], 'Branches must share identical random initial weights'
        assert (initializers['control'] / 'vecnormalize.pkl').read_bytes() == (initializers['imitation'] / 'vecnormalize.pkl').read_bytes()
        for mode in ('control', 'imitation'):
            output = OUTPUT / f'seed-{seed}/{mode}-ppo'
            config = dict(CONFIG, seed=seed)
            print(f'PPO training seed {seed} {mode}, 32,768 steps', flush=True)
            record = train(config, output, verbose=0, checkpoint_freq=16384, masked=True,
                           resume_from=initializers[mode])
            assert record['added_timesteps'] == record['actual_timesteps'] == 32768
            result = eval_saved(output, 220000, 10, f'development-seed-{seed}-{mode}-ppo')
            results['development'][f'seed-{seed}-{mode}'] = result['summary']
            write_json(OUTPUT / 'summary.json', results)
    def rank(mode):
        rows = [results['development'][f'seed-{seed}-{mode}'] for seed in (42, 43)]
        return (sum(row['target_successes'] for row in rows),
                sum(row['mean_contiguous_cleared'] for row in rows),
                -sum(row['mean_leaks'] for row in rows))
    results['selected_candidate'] = max(('control', 'imitation'), key=rank)
    write_json(OUTPUT / 'selection-before-confirmation.json', results)
    for seed in (42, 43):
        for mode in ('control', 'imitation'):
            run = OUTPUT / f'seed-{seed}/{mode}-ppo'
            result = eval_saved(run, 230000, 20, f'confirmation-seed-{seed}-{mode}-ppo')
            results['confirmation'][f'seed-{seed}-{mode}'] = result['summary']
            write_json(OUTPUT / 'summary.json', results)
    previous = eval_saved(PREVIOUS, 230000, 20, 'confirmation-previous-model')
    rules = reference_evaluate(CONFIG['env'], 'scripted', 20, 230000)
    write_json(OUTPUT / 'confirmation-scripted.json', rules)
    results['confirmation']['previous-model'] = previous['summary']
    results['confirmation']['scripted'] = rules['summary']
    write_json(OUTPUT / 'summary.json', results)
    print('Completed all predeclared PPO runs and held-out evaluation.', flush=True)


if __name__ == '__main__':
    main()
