"""Small, explicit CPU PPO entry point. Run with python -m ml.train."""
from __future__ import annotations

import argparse
import json
import math
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.logger import configure
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.env import AgeClanEnv
from ml.experiment import (DEFAULT_CONFIG, ROOT, environment_signature, load_config,
                           runtime_versions, write_json)


def train(config, output, verbose=1, checkpoint_freq=0, masked=False, resume_from=None,
          resume_learning_rate=None):
    """Create a new run directory; never overwrite an existing experiment."""
    if type(checkpoint_freq) is not int or checkpoint_freq < 0:
        raise ValueError('checkpoint_freq must be a nonnegative integer')
    config = deepcopy(config)
    if resume_learning_rate is not None:
        if resume_from is None:
            raise ValueError('resume_learning_rate requires resume_from')
        if (type(resume_learning_rate) not in (int, float) or not math.isfinite(resume_learning_rate)
                or not 0 < resume_learning_rate <= 1):
            raise ValueError('Invalid resume_learning_rate')
        config['ppo']['learning_rate'] = float(resume_learning_rate)
    began = perf_counter()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'config.json', config)
    torch.set_num_threads(config['torch_threads'])
    vector = None
    run_logger = None
    try:
        vector = DummyVecEnv([lambda: Monitor(AgeClanEnv(**config['env']),
                                              filename=str(output / 'episodes.monitor.csv'))])
        signature = environment_signature(vector.envs[0].unwrapped)
        algorithm = PPO
        if masked:
            from sb3_contrib import MaskablePPO
            algorithm = MaskablePPO
        start_steps = 0
        resume_overrides = {}
        if resume_from is not None:
            parent = Path(resume_from).resolve()
            previous = json.loads((parent / 'manifest.json').read_text(encoding='utf-8'))
            if previous['status'] != 'complete' or previous['algorithm'] != ('MaskablePPO' if masked else 'PPO'):
                raise ValueError('Resume requires a completed run of the same algorithm')
            if previous['environment'] != signature:
                raise ValueError('Resume environment signature differs')
            expected_ppo = deepcopy(previous['config']['ppo'])
            if resume_learning_rate is not None:
                expected_ppo['learning_rate'] = float(resume_learning_rate)
                old_lr = previous['config']['ppo']['learning_rate']
                if old_lr != resume_learning_rate:
                    resume_overrides['learning_rate'] = {'from': old_lr, 'to': float(resume_learning_rate)}
            if (any(previous['config'][key] != config[key] for key in ('env', 'seed', 'torch_threads'))
                    or expected_ppo != config['ppo']):
                raise ValueError('Resume must keep environment, PPO settings and seed unchanged')
            vector = VecNormalize.load(parent / 'vecnormalize.pkl', vector)
            vector.training = True
            vector.norm_reward = False
            custom = {'learning_rate': float(resume_learning_rate)} if resume_learning_rate is not None else None
            model = algorithm.load(parent / 'model.zip', env=vector, device='cpu', custom_objects=custom)
            # Loading restores optimizer moments AND its old parameter-group LR.
            # Keep the moments, and apply the explicitly requested schedule immediately.
            if resume_learning_rate is not None:
                for group in model.policy.optimizer.param_groups:
                    group['lr'] = model.lr_schedule(1.0)
            start_steps = model.num_timesteps
        else:
            vector = VecNormalize(vector, norm_obs=True, norm_reward=False, clip_obs=10.0)
            model = algorithm('MlpPolicy', vector, device='cpu', seed=config['seed'],
                        verbose=verbose, **config['ppo'])
        run_logger = configure(str(output), ['csv'] + (['stdout'] if verbose else []))
        model.set_logger(run_logger)
        callback = None
        if checkpoint_freq:
            callback = CheckpointCallback(checkpoint_freq, str(output / 'checkpoints'),
                                          name_prefix='ppo', save_vecnormalize=True)
        # SB3 may round this upward to a full n_steps rollout; record actual steps.
        model.learn(total_timesteps=config['total_timesteps'], callback=callback,
                    reset_num_timesteps=resume_from is None)
        model.save(output / 'model.zip')
        vector.save(output / 'vecnormalize.pkl')
        manifest = {'status': 'complete', 'created_at_utc': datetime.now(timezone.utc).isoformat(),
                    'algorithm': 'MaskablePPO' if masked else 'PPO', 'device': 'cpu', 'config': config,
                    'actual_timesteps': model.num_timesteps, 'runtime': runtime_versions(),
                    'added_timesteps': model.num_timesteps - start_steps,
                    'parent_run': str(Path(resume_from).resolve()) if resume_from else None,
                    'resume_overrides': resume_overrides,
                    'wall_seconds': perf_counter() - began,
                    'checkpoint_freq': checkpoint_freq,
                    'model': {'policy': 'MlpPolicy', 'parameters': sum(p.numel() for p in model.policy.parameters()),
                              'architecture': str(model.policy), 'optimizer': type(model.policy.optimizer).__name__,
                              'clip_range': model.clip_range(1), 'gae_lambda': model.gae_lambda,
                              'vf_coef': model.vf_coef,
                              'learning_rate_schedule': [model.lr_schedule(1.0), model.lr_schedule(0.0)],
                              'optimizer_learning_rates': [group['lr'] for group in model.policy.optimizer.param_groups]},
                    'environment': signature}
        write_json(output / 'manifest.json', manifest)
        return manifest
    finally:
        if run_logger is not None:
            run_logger.close()
        if vector is not None:
            vector.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--total-timesteps', type=int)
    parser.add_argument('--checkpoint-freq', type=int, default=0, help='Save model and normalization every N actions')
    parser.add_argument('--masked', action='store_true', help='Use engine-validated action masking')
    parser.add_argument('--resume-from', type=Path, help='Continue model/optimizer/normalization into a new output directory')
    parser.add_argument('--resume-learning-rate', type=float, help='Explicitly override only the resumed learning rate')
    parser.add_argument('--output', type=Path,
                        default=ROOT / 'ml' / 'runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    args = parser.parse_args()
    config = load_config(args.config, args.total_timesteps)
    manifest = train(config, args.output, checkpoint_freq=args.checkpoint_freq, masked=args.masked,
                     resume_from=args.resume_from, resume_learning_rate=args.resume_learning_rate)
    print(f"Saved {manifest['actual_timesteps']} steps to {args.output.resolve()}")


if __name__ == '__main__':
    main()
