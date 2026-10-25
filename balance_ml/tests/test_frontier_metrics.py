import unittest
from balance_ml.campaign import jobs
from balance_ml.frontier_metrics import strategy_effects, summarize, METRICS


class StrategyMetricTests(unittest.TestCase):
    def rows(self):
        queue=jobs({'development_seeds':[1,2,3],'confirmation_seeds':[4,5,6,7,8]})
        rows=[]
        for job in queue:
            result={key:0 for key in METRICS}
            result.update(cleared=40+(job['policy']=='mixed-timing-02s')*5,
                          invalid=0,end='castle_destroyed',actions={'repairCastle:':2})
            rows.append({**job,'result':result})
        return rows

    def test_pairing_by_seed_not_input_order_and_stage_separation(self):
        rows=self.rows();result=strategy_effects(rows)
        self.assertEqual(result,strategy_effects(list(reversed(rows))))
        for label,item in result['comparisons'].items():
            self.assertEqual(item['pairs'],3 if label.startswith('development') else 5)
            self.assertEqual(item['mean_delta']['cleared'],5)
            self.assertEqual(item['enabled']['invalid_action_rate'],0)
            self.assertEqual(item['enabled']['actions']['repairCastle:'],item['pairs']*2)

    def test_invalid_rate_uses_attempted_actions(self):
        result=self.rows()[0]['result']
        result['invalid']=1
        result['end']='time_limit'
        summary=summarize([result])
        self.assertAlmostEqual(summary['invalid_action_rate'],1/3)
        self.assertEqual(summary['time_censored'],1)

    def test_missing_or_duplicate_pairs_fail(self):
        rows=self.rows()
        with self.assertRaises(ValueError):strategy_effects(rows[:-1])
        with self.assertRaises(ValueError):strategy_effects(rows+[rows[0]])
