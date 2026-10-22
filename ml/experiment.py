"""Shared run configuration and model/environment compatibility metadata."""
from __future__ import annotations

import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / 'ml' / 'configs' / 'starter.json'
RULE_FILES = ('public/game/game.js', 'public/game/balance.js', 'lib/game-engine.js',
              'lib/trees.js', 'ml/bridge.mjs', 'ml/env.py')


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_config(path=DEFAULT_CONFIG, total_timesteps=None):
    config = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if total_timesteps is not None:
        config['total_timesteps'] = total_timesteps
    if set(config) != {'seed', 'total_timesteps', 'torch_threads', 'env', 'ppo'}:
        raise ValueError('Unexpected or missing configuration keys')
    for name, minimum in (('seed', 0), ('total_timesteps', 1), ('torch_threads', 1)):
        value = config[name]
        if type(value) is not int or value < minimum:
            raise ValueError(f'Invalid {name}')
    if config['seed'] > 2**32 - 1:
        raise ValueError('seed must fit uint32')
    if set(config['env']) != {'frame_skip', 'max_ticks', 'target_wave'}:
        raise ValueError('Unexpected or missing environment keys')
    ppo = config['ppo']
    if set(ppo) != {'n_steps', 'batch_size', 'n_epochs', 'learning_rate', 'gamma', 'ent_coef'}:
        raise ValueError('Unexpected or missing PPO keys')
    for name in ('n_steps', 'batch_size', 'n_epochs'):
        if type(ppo[name]) is not int or ppo[name] < (1 if name == 'n_epochs' else 2):
            raise ValueError(f'Invalid PPO {name}')
    if ppo['batch_size'] > ppo['n_steps'] or ppo['n_steps'] % ppo['batch_size']:
        raise ValueError('batch_size must divide n_steps for this single-environment starter')
    for name, low, high in (('learning_rate', 0, 1), ('gamma', 0, 1), ('ent_coef', 0, 1)):
        value = ppo[name]
        if type(value) not in (float, int) or not low <= value <= high or (name == 'learning_rate' and value == 0):
            raise ValueError(f'Invalid PPO {name}')
    return config


def environment_signature(env):
    return {
        'version': 1,
        'actions': env.actions,
        'features': env.feature_names,
        # Normalize CRLF/LF so Windows Git checkout settings do not change signatures.
        'source_sha256': {name: hashlib.sha256((ROOT / name).read_text(encoding='utf-8').encode('utf-8')).hexdigest()
                          for name in RULE_FILES},
    }


def runtime_versions():
    return {'python': platform.python_version(),
            **{name: version(name) for name in ('numpy', 'gymnasium', 'stable-baselines3', 'sb3-contrib', 'torch')}}
