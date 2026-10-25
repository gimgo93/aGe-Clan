import tempfile
import json
from pathlib import Path
import unittest
from balance_ml.audit import evaluate, audit_run
from balance_ml.model import Surrogate


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.rows = [{'stage':'data', 'params':{'x':i/10}, 'policy':p,
                      'result':{'cleared':20+i+(p=='b'), 'invalid':0, 'end':'loss'}}
                     for i in range(-20, 21) for p in ['a', 'b'] for _ in range(2)]
        self.model = Surrogate({'x':{'base':0,'min':-2,'max':2}}, ['a','b'])
        self.model.fit(self.rows)

    def test_per_policy_errors_reproducible_and_no_mutation(self):
        before = json.dumps(self.rows)
        result = evaluate(self.model, self.rows)
        self.assertEqual(result, evaluate(self.model, self.rows))
        self.assertEqual(json.dumps(self.rows), before)
        for policy in result['policies'].values():
            self.assertLess(policy['model_mae_waves'], policy['constant_policy_mae_waves'])
            # Nine independent configurations, not eighteen independent rows.
            self.assertEqual(policy['holdout_configuration_groups'], 9)
            self.assertIsNone(policy['group_bootstrap_95pct_interval'])
            self.assertFalse(policy['positive_improvement_supported'])

    def test_overlap_and_missing_groups_rejected(self):
        with self.assertRaises(ValueError): evaluate(self.model, self.rows[4:])
        self.model.metrics['holdout_groups'].append(self.model.metrics['training_groups'][0])
        with self.assertRaises(ValueError): evaluate(self.model, self.rows)

    def test_running_run_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'progress.json').write_text('{"state":"running"}')
            with self.assertRaisesRegex(ValueError, 'not complete'): audit_run(folder)

    def test_bootstrap_and_worse_model(self):
        rows = [{'stage':'data','params':{'x':i/10},'policy':p,
                 'result':{'cleared':20+i/2,'invalid':0,'end':'loss'}}
                for i in range(-50,51) for p in ['a','b']]
        model = Surrogate({'x':{'base':0,'min':-5,'max':5}}, ['a','b'])
        model.fit(rows)
        model.predict = lambda params, policy: (40, 0)
        for policy in evaluate(model, rows)['policies'].values():
            self.assertEqual(len(policy['group_bootstrap_95pct_interval']), 2)
            self.assertLess(policy['equal_configuration_mae_improvement'], 0)
            self.assertFalse(policy['positive_improvement_supported'])
