"""Small nonlinear surrogate: fixed random features and learned ridge weights.

Configuration-group holdout prevents repeated seeds leaking into validation.
Ensemble spread is a ranking heuristic, not a calibrated confidence interval.
"""
import hashlib
import json
from pathlib import Path
import numpy as np


def group(params):
    return hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()


def features(params, policy, schema, policies):
    x=[(params.get(k, s['base'])-s['base'])/max(s['max']-s['min'], 1e-6)*2 for k,s in schema.items()]
    return x+[float(policy==p) for p in policies]


class Surrogate:
    def __init__(self, schema, policies):
        self.schema, self.policies=schema,policies

    def fit(self, rows):
        groups=sorted({group(r['params']) for r in rows})
        if len(groups)<10:
            raise ValueError('At least 10 distinct configurations required')
        hold=set(groups[::5])
        train=[r for r in rows if group(r['params']) not in hold]
        test=[r for r in rows if group(r['params']) in hold]
        x=np.asarray([features(r['params'],r['policy'],self.schema,self.policies) for r in train])
        y=np.asarray([r['result']['cleared']/40 for r in train])
        self.weights={}
        for i in range(5):
            rng=np.random.default_rng(100+i)
            w=rng.normal(0,.7,(x.shape[1],64)); b=rng.normal(0,.3,64)
            z=np.c_[np.ones(len(x)),x,np.tanh(x@w+b)]
            indices=rng.integers(0,len(x),len(x))
            zi=z[indices]; yi=y[indices]
            coef=np.linalg.solve(zi.T@zi+np.eye(zi.shape[1])*2,zi.T@yi)
            self.weights.update({f'w{i}':w,f'b{i}':b,f'c{i}':coef})
        errors=[abs(self.predict(r['params'],r['policy'])[0]-r['result']['cleared']) for r in test]
        means={p:np.mean([r['result']['cleared'] for r in train if r['policy']==p]) for p in self.policies}
        baseline=np.mean([abs(means[r['policy']]-r['result']['cleared']) for r in test])
        self.metrics={'holdout_mae_waves':float(np.mean(errors)), 'constant_policy_mae_waves':float(baseline),
                      'training_rows':len(train),'holdout_rows':len(test),'configuration_groups':len(groups),
                      'holdout_groups':sorted(hold),'training_groups':sorted(set(groups)-hold)}
        return self.metrics

    def predict(self,params,policy):
        x=np.asarray(features(params,policy,self.schema,self.policies))
        values=[]
        for i in range(5):
            z=np.r_[1,x,np.tanh(x@self.weights[f'w{i}']+self.weights[f'b{i}'])]
            values.append(float(np.clip(z@self.weights[f'c{i}']*40,0,40)))
        return float(np.mean(values)),float(np.std(values))

    def save(self,path):
        np.savez_compressed(path,**self.weights)
        Path(path).with_suffix('.json').write_text(json.dumps({'algorithm':'bootstrap random-feature ridge regression',
            'settings':{'members':5,'tanh_features':64,'ridge':2,'feature_seed_start':100},
            'schema':self.schema,'policies':self.policies,'metrics':self.metrics},indent=2),encoding='utf-8')

    @classmethod
    def load(cls,path):
        meta=json.loads(Path(path).with_suffix('.json').read_text(encoding='utf-8'))
        obj=cls(meta['schema'],meta['policies']);obj.metrics=meta['metrics']
        with np.load(path,allow_pickle=False) as data:obj.weights={k:data[k] for k in data.files}
        return obj
