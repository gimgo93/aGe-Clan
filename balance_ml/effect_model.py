"""Target-explicit paired effect regression with conservative evidence checks."""
import os
for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ[key]='1'
import hashlib
import json
from pathlib import Path
import numpy as np
from .model import features


class EffectModel:
    def __init__(self,schema,policies,target_wave,fingerprint):
        if target_wave not in (40,50) or not fingerprint or not policies:
            raise ValueError('Explicit target, policies and fingerprint required')
        self.schema=schema;self.policies=policies;self.target_wave=target_wave;self.fingerprint=fingerprint
        self.support={};self.weights={}

    def _validate(self,params,policy):
        if policy not in self.policies or len(params)>1:raise ValueError('Unsupported policy or intervention')
        for key,value in params.items():
            spec=self.schema.get(key)
            if spec is None or type(value) not in (int,float) or not np.isfinite(value):
                raise ValueError('Unknown or invalid parameter')
            if not spec['min']<=value<=spec['max'] or spec.get('integer') and int(value)!=value:
                raise ValueError('Parameter outside schema')

    def _design(self,params,policy,w,b):
        x=np.asarray(features(params,policy,self.schema,self.policies))
        reference=np.asarray(features({},policy,self.schema,self.policies))
        return np.r_[x-reference,np.tanh(x@w+b)-np.tanh(reference@w+b)]

    def fit(self,pairs):
        clean=[];evidence={}
        for pair in pairs:
            if pair['target_wave']!=self.target_wave or pair['fingerprint']!=self.fingerprint:
                raise ValueError('Mixed target or source fingerprint')
            self._validate(pair['params'],pair['policy'])
            if not np.isfinite(pair['delta']) or abs(pair['delta'])>self.target_wave:
                raise ValueError('Invalid paired delta')
            if not pair['relevant_use']:continue
            if not pair['params']:raise ValueError('Expected non-baseline pair')
            clean.append(pair)
            parameter=next(iter(pair['params']));key=pair['policy']+'|'+parameter
            record=evidence.setdefault(key,{'seeds':set(),'values':[]})
            record['seeds'].add(pair['seed']);record['values'].append(pair['params'][parameter])
        seeds=sorted({p['seed'] for p in clean})
        if len(seeds)<3:raise ValueError('At least three exposed training seeds required')
        self.support={k:{'seed_count':len(v['seeds']),'min':min(v['values']),'max':max(v['values'])} for k,v in evidence.items()}
        self.weights={}
        y=np.array([p['delta']/self.target_wave for p in clean])
        for i in range(5):
            rng=np.random.default_rng(100+i)
            w=rng.normal(0,.7,(len(self.schema)+len(self.policies),64));b=rng.normal(0,.3,64)
            z=np.asarray([self._design(p['params'],p['policy'],w,b) for p in clean])
            sampled=rng.choice(seeds,len(seeds),replace=True)
            indices=[j for seed in sampled for j,p in enumerate(clean) if p['seed']==seed]
            zi=z[indices];yi=y[indices]
            coef=np.linalg.solve(zi.T@zi+np.eye(zi.shape[1])*2,zi.T@yi)
            self.weights.update({f'w{i}':w,f'b{i}':b,f'c{i}':coef})
        return self

    def predict_delta(self,params,policy):
        self._validate(params,policy)
        if not self.weights:raise ValueError('Model is not fitted')
        if not params or all(value==self.schema[key]['base'] for key,value in params.items()):return 0.,0.
        parameter=next(iter(params));evidence=self.support.get(policy+'|'+parameter)
        if not evidence or evidence['seed_count']<3:
            raise ValueError('Insufficient actual-use evidence for this policy and parameter')
        if not evidence['min']<=params[parameter]<=evidence['max']:
            raise ValueError('Outside observed training range')
        values=[float(np.clip(self._design(params,policy,self.weights[f'w{i}'],self.weights[f'b{i}'])
                              @self.weights[f'c{i}']*self.target_wave,-self.target_wave,self.target_wave)) for i in range(5)]
        return float(np.mean(values)),float(np.std(values))

    def save(self,directory):
        if not self.weights:raise ValueError('Model is not fitted')
        directory=Path(directory);directory.mkdir(parents=True,exist_ok=False)
        path=directory/'weights.npz';np.savez_compressed(path,**self.weights)
        meta={'algorithm':'seed-bootstrap anchored random-feature ridge delta v2','target_wave':self.target_wave,
              'fingerprint':self.fingerprint,'schema':self.schema,'policies':self.policies,'support':self.support,
              'settings':{'members':5,'features':64,'ridge':2},'weights_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        (directory/'metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')

    @classmethod
    def load(cls,directory,*,target_wave,fingerprint):
        directory=Path(directory);meta=json.loads((directory/'metadata.json').read_text(encoding='utf-8'))
        if meta['target_wave']!=target_wave or meta['fingerprint']!=fingerprint:
            raise ValueError('Saved model target/source mismatch')
        path=directory/'weights.npz'
        if hashlib.sha256(path.read_bytes()).hexdigest()!=meta['weights_sha256']:raise ValueError('Weights checksum mismatch')
        obj=cls(meta['schema'],meta['policies'],target_wave,fingerprint);obj.support=meta['support']
        with np.load(path,allow_pickle=False) as data:obj.weights={k:data[k] for k in data.files}
        return obj
