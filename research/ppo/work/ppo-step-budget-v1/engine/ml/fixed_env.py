"""Teacher-independent fixed feature units, frozen before collecting any data."""
import gymnasium as gym
import numpy as np
from .env import AgeClanEnv


def feature_scales(names):
    explicit={'time':12000,'gold':1000,'crystals':50,'wood':1000,'hp':140,'maxHp':140,
        'castle':5,'era':5,'miners':50,'population':100,'wave':50,'completed':50,
        'kills':1000,'activeWaves':2,'waveClock':30,'miningClock':1.5,'lab':1,
        'labBuild':60,'repairCount':10,'lightningResearch':60,'iceResearch':60,
        'lightningCooldown':60,'iceCooldown':60}
    scales=[]
    for name in names:
        if name in explicit:value=explicit[name]
        elif name.startswith('level.'):value=5
        elif name.startswith('pad.'):
            value={'type':5,'hp':300,'buildRemaining':10,'cooldown':2}[name.split('.')[-1]]
        elif name.startswith('enemyBin.'):
            value={'count':50,'hp':5000}[name.split('.')[-1]]
        else:raise ValueError(f'Unscaled feature {name}')
        scales.append(value)
    return np.asarray(scales,dtype=np.float32)


class FixedScaleEnv(gym.ObservationWrapper):
    def __init__(self,**kwargs):
        super().__init__(AgeClanEnv(**kwargs))
        self.scales=feature_scales(self.unwrapped.feature_names)
        self.observation_space=gym.spaces.Box(-20.,20.,shape=self.env.observation_space.shape,dtype=np.float32)

    def observation(self,observation):
        return np.clip(observation/self.scales,-20,20).astype(np.float32)

    def action_masks(self):return self.unwrapped.action_masks()
