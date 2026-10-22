"""Small, explicit CPU PPO entry point. Run with python -m ml.train."""
from __future__ import annotations

import argparse
import json
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


def train(config, output, verbose=1, checkpoint_freq=0, masked=False, resume_from=None):
    """Create a new run directory; never overwrite an existing experiment."""
    if type(checkpoint_freq) is not int or checkpoint_freq < 0:
        raise ValueError('checkpoint_freq must be a nonnegative integer')
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
        if resume_from is not None:
            parent = Path(resume_from).resolve()
            previous = json.loads((parent / 'manifest.json').read_text(encoding='utf-8'))
            if previous['status'] != 'complete' or previous['algorithm'] != ('MaskablePPO' if masked else 'PPO'):
                raise ValueError('Resume requires a completed run of the same algorithm')
            if previous['environment'] != signature:
                raise ValueError('Resume environment signature differs')
            if any(previous['config'][key] != config[key] for key in ('env', 'ppo', 'seed', 'torch_threads')):
                raise ValueError('Resume must keep environment, PPO settings and seed unchanged')
            vector = VecNormalize.load(parent / 'vecnormalize.pkl', vector)
            vector.training = True
            vector.norm_reward = False
            model = algorithm.load(parent / 'model.zip', env=vector, device='cpu')
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
                    'wall_seconds': perf_counter() - began,
                    'checkpoint_freq': checkpoint_freq,
                    'model': {'policy': 'MlpPolicy', 'parameters': sum(p.numel() for p in model.policy.parameters()),
                              'architecture': str(model.policy), 'optimizer': type(model.policy.optimizer).__name__,
                              'clip_range': model.clip_range(1), 'gae_lambda': model.gae_lambda,
                              'vf_coef': model.vf_coef},
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
    parser.add_argument('--output', type=Path,
                        default=ROOT / 'ml' / 'runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    args = parser.parse_args()
    config = load_config(args.config, args.total_timesteps)
    manifest = train(config, args.output, checkpoint_freq=args.checkpoint_freq, masked=args.masked,
                     resume_from=args.resume_from)
    print(f"Saved {manifest['actual_timesteps']} steps to {args.output.resolve()}")


if __name__ == '__main__':
    main()
