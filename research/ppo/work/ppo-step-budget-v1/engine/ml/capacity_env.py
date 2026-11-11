"""Optional AI investment budget; engine rules and wave progression stay intact."""
from .fixed_env import FixedScaleEnv

class CapacityEnv(FixedScaleEnv):
    def __init__(self,*,max_castle_level,**kwargs):
        if type(max_castle_level) is not int or not 1<=max_castle_level<=20:raise ValueError('Invalid castle budget')
        super().__init__(**kwargs)
        self.max_castle_level=max_castle_level
        self.castle_index=self.unwrapped.feature_names.index('castle')
        self.upgrade_id=next(i for i,a in enumerate(self.unwrapped.actions) if a['name']=='upgradeCastle')
        self.castle_level=1
    def reset(self,**kwargs):
        obs,info=super().reset(**kwargs);self.castle_level=round(float(obs[self.castle_index])*5)
        return obs,info
    def action_masks(self):
        mask=super().action_masks().copy()
        if self.castle_level>=self.max_castle_level:mask[self.upgrade_id]=False
        return mask
    def step(self,action):
        if int(action)==self.upgrade_id and self.castle_level>=self.max_castle_level:raise ValueError('AI castle investment budget exceeded')
        obs,r,t,c,info=super().step(action);self.castle_level=round(float(obs[self.castle_index])*5)
        return obs,r,t,c,info
