import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from balance_ml.agent import Worker, sample, summarize, score
from balance_ml.model import Surrogate
import random
import subprocess
from types import SimpleNamespace
from unittest.mock import patch
import balance_ml.agent as agent


class BalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker=Worker();cls.description=cls.worker.request(op='describe')
    @classmethod
    def tearDownClass(cls):cls.worker.close()

    def test_real_engine_determinism_and_constraints(self):
        query=dict(op='simulate',params={},policy='archer-fixed',seed=123)
        a=self.worker.request(**query);b=self.worker.request(**query)
        self.assertEqual(a,b)
        script="import D from './lib/game-engine.js'; import trees from './lib/trees.js'; import {run,POLICIES} from './balance_ml/policies.mjs'; console.log(JSON.stringify(run(D,POLICIES[0],123,40,trees)));"
        direct=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=agent.ROOT,text=True))
        self.assertEqual(a,direct)
        self.assertEqual(a['invalid'],0)
        self.assertEqual(a['cleared'],15)
        self.assertGreater(a['actions']['build:archer'],0)
        for params in [{'startGold':True},{'startGold':99999},{'unknown':1},{'towers.archer.damage':12.5}]:
            with self.assertRaises(ValueError):self.worker.request(**(query|{'params':params}))

    def test_single_parameter_sampling(self):
        for i in range(100):
            params=sample(self.description['schema'],random.Random(i))
            self.assertEqual(len(params),1)
            key,value=next(iter(params.items()));spec=self.description['schema'][key]
            self.assertTrue(spec['min']<=value<=spec['max'])

    def test_learn_save_reload_and_group_holdout(self):
        schema={'x':{'base':0,'min':-1,'max':1}};policies=['a','b']
        rows=[{'params':{'x':i/10},'policy':p,'result':{'cleared':20+i+(p=='b')}} for i in range(-10,11) for p in policies for _ in range(2)]
        model=Surrogate(schema,policies);metrics=model.fit(rows)
        self.assertFalse(set(metrics['training_groups'])&set(metrics['holdout_groups']))
        self.assertLess(metrics['holdout_mae_waves'],metrics['constant_policy_mae_waves'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'model.npz';model.save(path);loaded=Surrogate.load(path)
            np.testing.assert_allclose(model.predict({'x':.3},'a'),loaded.predict({'x':.3},'a'))
        with self.assertRaises(ValueError):Surrogate(schema,policies).fit(rows[:4])

    def test_objective(self):
        self.assertEqual(score([13,15,20,30,40]),0)

    def test_lock_and_resume_without_duplicates(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(agent,'RUNS',Path(folder)):
            with agent.lock():
                with self.assertRaises(RuntimeError):
                    with agent.lock():pass
            self.assertFalse((Path(folder)/'agent.lock').exists())
            args=SimpleNamespace(run='resume',games=200,seed=123,max_seconds=1)
            agent.execute(args)
            journal=Path(folder)/'resume/episodes.jsonl'
            first=[json.loads(x) for x in journal.read_text().splitlines()]
            with journal.open('ab') as stream:stream.write(b'{"interrupted":')
            agent.execute(args)
            second=[json.loads(x) for x in journal.read_text().splitlines()]
            self.assertGreater(len(second),len(first))
            self.assertEqual(len({r['id'] for r in second}),len(second))
            self.assertEqual(second[:len(first)],first)
            self.assertEqual(json.loads((journal.parent/'progress.json').read_text())['state'],'paused')


if __name__=='__main__':unittest.main()
