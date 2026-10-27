import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from balance_ml import reserve_experiment as experiment

PLAN={'development_seeds':list(range(10)),'confirmation_seeds':list(range(10,20)),
      'planned_games':40}


def result(seed,reserve):
    return {'seed':seed,'target':50,'cleared':30+reserve,'invalid':0,'end':'castle_destroyed',
            'actions':{'potion:ice':1},'castle':13,'castle17At':None,
            **{k:0 for k in experiment.METRICS if k!='cleared'}}


class ReserveTests(unittest.TestCase):
    def test_fresh_disjoint_plan_and_pair_reporting(self):
        jobs=experiment.queue(PLAN);self.assertEqual(len(jobs),40)
        rows=[{**j,'result':result(j['seed'],j['variant']=='reserve')} for j in jobs]
        report=experiment.paired_report(rows,PLAN)
        self.assertEqual(report['decision'],'positive_policy_signal_only')
        self.assertEqual(report['stages']['confirmation']['mean_delta']['cleared'],1)
        self.assertFalse(report['automatic_patch'])
        bad=copy.deepcopy(rows);bad[0]['result']['invalid']=1
        self.assertFalse(experiment.paired_report(bad,PLAN)['clean_results'])
        with self.assertRaises(ValueError):experiment.paired_report(rows[:-1],PLAN)
        with self.assertRaises(ValueError):experiment.queue({**PLAN,'confirmation_seeds':list(range(10))})

    def test_generic_candidate_label(self):
        plan={**PLAN,'variants':['control','miners22']}
        data=[{**j,'result':result(j['seed'],j['variant']=='miners22')} for j in experiment.queue(plan)]
        report=experiment.paired_report(data,plan)
        self.assertEqual(report['candidate'],'miners22')
        self.assertIn('miners22',report['stages']['confirmation']['variants'])
        for row in data:
            row['result']['crystalTrace']={'acquired':100,'balanceError':0,'spending':{'potion:ice':7}}
        report=experiment.paired_report(data,plan)
        self.assertEqual(report['stages']['confirmation']['variants']['miners22']['mean_crystals_acquired'],100)
        data[-1]['result']['crystalTrace']['balanceError']=1
        self.assertFalse(experiment.paired_report(data,plan)['clean_results'])

    def test_budget_counts_manual_names_and_parent_planned_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name,manifest in [('manual',{'created':'2026-10-27T10:00','budget':300}),
                ('2026-10-27-frontier50',{'budget':5000,'allocation':{'frontier_planned':64}}),
                ('old',{'created':'2026-10-26T10:00','budget':5000})]:
                d=root/name;d.mkdir();(d/'manifest.json').write_text(json.dumps(manifest))
            count,entries=experiment.allocated_today(root,'2026-10-27','new')
            self.assertEqual(count,364);self.assertEqual(len(entries),2)

    def test_resume_preserves_source_and_does_not_repeat_games(self):
        calls=[]
        class Worker:
            def request(self,op,**q):
                if op=='describe':return {'fingerprint':'test','sources':{}}
                calls.append(q);return result(q['seed'],q['reserve'])
            def close(self):pass
        with tempfile.TemporaryDirectory() as tmp,patch.object(experiment.agent,'RUNS',Path(tmp)), \
             patch.object(experiment,'ReserveWorker',Worker):
            parent=Path(tmp)/'2026-10-27-frontier50';parent.mkdir()
            (parent/'progress.json').write_text(json.dumps({'state':'complete','phase':'frontier_review'}))
            (parent/'time-budget.json').write_text(json.dumps({'deadline_epoch':experiment.time.time()+600}))
            (parent/'manifest.json').write_text(json.dumps({'budget':5000,'allocation':{'frontier_planned':64}}))
            experiment.execute('2026-10-27');experiment.execute('2026-10-27')
            self.assertEqual(len(calls),40)
            folder=Path(tmp)/'2026-10-27-castle-reserve'
            self.assertEqual(json.loads((folder/'manifest.json').read_text())['total_allocated_games'],104)
            self.assertEqual(json.loads((folder/'progress.json').read_text())['state'],'complete')


if __name__=='__main__':unittest.main()
