import copy
import unittest
import numpy as np
from balance_ml.compare import compare, fit
from balance_ml.model import Surrogate, group


class CompareTests(unittest.TestCase):
    def setUp(self):
        self.schema = {'x':{'base':0,'min':-2,'max':2}}
        self.rows = [{'stage':'data','params':{'x':i/10},'policy':p,'result':{'cleared':20+i/2+(p=='b')}}
                     for i in range(-20,21) for p in ['a','b']]

    def test_same_estimator_as_existing_ridge2(self):
        reference = Surrogate(self.schema,['a','b']); reference.fit(self.rows)
        train = [r for r in self.rows if group(r['params']) in reference.metrics['training_groups']]
        candidate = fit(train,self.schema,['a','b'],2.)
        for row in self.rows:
            np.testing.assert_allclose(reference.predict(row['params'],row['policy']),
                                       candidate.predict(row['params'],row['policy']))

    def test_split_reproducibility_and_no_mutation(self):
        original = copy.deepcopy(self.rows)
        result = compare(self.rows,self.schema,['a','b'])
        self.assertEqual(result,compare(self.rows,self.schema,['a','b']))
        self.assertFalse(set(result['inner_groups']) & set(result['outer_groups']))
        self.assertEqual(self.rows,original)
        self.assertEqual(result['patch_recommendation'],'not_evaluated')

    def test_outer_labels_cannot_change_selection(self):
        result = compare(self.rows,self.schema,['a','b'])
        changed = copy.deepcopy(self.rows)
        for row in changed:
            if group(row['params']) in result['outer_groups']: row['result']['cleared'] = 0
        second = compare(changed,self.schema,['a','b'])
        self.assertEqual(result['selected_ridge'],second['selected_ridge'])
        self.assertEqual(result['inner_cv_mae'],second['inner_cv_mae'])
        self.assertNotEqual(result['outer_selected_mae'],second['outer_selected_mae'])

    def test_small_or_missing_policy_rejected(self):
        with self.assertRaises(ValueError): compare(self.rows[:10],self.schema,['a','b'])
        with self.assertRaises(ValueError): compare(self.rows[1:],self.schema,['a','b'])
