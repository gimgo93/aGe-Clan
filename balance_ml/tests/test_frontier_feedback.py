import copy
import unittest
from balance_ml.campaign import jobs
from balance_ml.frontier_feedback import feedback


class FeedbackTests(unittest.TestCase):
    def rows(self):
        plan={'development_seeds':[1,2,3],'confirmation_seeds':[4,5,6,7,8]}
        return [{**j,'result':{'cleared':50,'invalid':0,'end':'target_wave',
                   'milestones':{'40':{'hp':90 if j['hpMultiplier']==1 else 85}}}} for j in jobs(plan)]

    def test_reproducible50_and_small_hp_cost_is_review_only(self):
        result=feedback(self.rows())
        self.assertEqual(result['decision'],'review_candidate')
        self.assertFalse(result['automatic_patch'])
        self.assertEqual(result['confirmation']['paired_hp40_delta'],-5)

    def test_no50_requires_strategy_improvement(self):
        rows=self.rows()
        for r in rows:r['result']['cleared']=35
        self.assertEqual(feedback(rows)['decision'],'improve_strategy_first')

    def test_confirmation_cannot_choose_another_policy(self):
        rows=self.rows();chosen=feedback(rows)['selected_policy']
        for r in rows:
            if r['stage']=='confirmation' and r['policy']==chosen:r['result']['cleared']=35
        result=feedback(rows)
        self.assertEqual(result['selected_policy'],chosen)
        self.assertEqual(result['decision'],'hold')

    def test_invalid_censored_and_no_effect_block_candidate(self):
        for condition in ['invalid','time_limit','no_effect']:
            rows=self.rows()
            for r in rows:
                if condition=='invalid':r['result']['invalid']=1
                if condition=='time_limit':r['result']['end']='time_limit'
                if condition=='no_effect':r['result']['milestones']['40']['hp']=90
            self.assertEqual(feedback(rows)['decision'],'hold')

    def test_missing_or_duplicate_results_rejected(self):
        rows=self.rows()
        with self.assertRaises(ValueError):feedback(rows[:-1])
        with self.assertRaises(ValueError):feedback(rows+[copy.deepcopy(rows[0])])
