"""Small, explicit CPU PPO entry point. Run with python -m ml.train."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.env import AgeClanEnv
from ml.experiment import (DEFAULT_CONFIG, ROOT, environment_signature, load_config,
                           runtime_versions, write_json)


def train(config, output, verbose=1):
    """Create a new run directory; never overwrite an existing experiment."""
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'config.json', config)
    torch.set_num_threads(config['torch_threads'])
    vector = None
    try:
        vector = DummyVecEnv([lambda: Monitor(AgeClanEnv(**config['env']),
                                              filename=str(output / 'episodes.monitor.csv'))])
        signature = environment_signature(vector.envs[0].unwrapped)
        vector = VecNormalize(vector, norm_obs=True, norm_reward=False, clip_obs=10.0)
        model = PPO('MlpPolicy', vector, device='cpu', seed=config['seed'],
                    verbose=verbose, **config['ppo'])
        # SB3 may round this upward to a full n_steps rollout; record actual steps.
        model.learn(total_timesteps=config['total_timesteps'])
        model.save(output / 'model.zip')
        vector.save(output / 'vecnormalize.pkl')
        manifest = {'status': 'complete', 'created_at_utc': datetime.now(timezone.utc).isoformat(),
                    'algorithm': 'PPO', 'device': 'cpu', 'config': config,
                    'actual_timesteps': model.num_timesteps, 'runtime': runtime_versions(),
                    'environment': signature}
        write_json(output / 'manifest.json', manifest)
        return manifest
    finally:
        if vector is not None:
            vector.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--total-timesteps', type=int)
    parser.add_argument('--output', type=Path,
                        default=ROOT / 'ml' / 'runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    args = parser.parse_args()
    config = load_config(args.config, args.total_timesteps)
    manifest = train(config, args.output)
    print(f"Saved {manifest['actual_timesteps']} steps to {args.output.resolve()}")


if __name__ == '__main__':
    main()
