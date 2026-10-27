import copy
import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import balance_ml.resource_diagnostic as diagnostic
from balance_ml.resource_diagnostic import summarize_resources,SEEDS


def rows():
    return [{'seed':seed,'result':{'seed':seed,'target':50,'cleared':30,'castle':13,'castle17At':None,
      'hp':0,'kills':10,'leaks':1,'destroyed':0,'damage':100,'time':1800,'miners':18,'workers':4,
      'gold':100,'crystals':15,'invalid':0,'end':'castle_destroyed','actions':{'upgradeCastle:':1},
      'crystalTrace':{'initial':12,'acquired':5,'spent':2,'final':15,'balanceError':0,
       'spending':{'upgradeCastle:':2},'events':[{'amount':2}], 'castleWaitDecisions':10,'waitByCastle':{'13':10}}}}
      for seed in SEEDS]


class ResourceTests(unittest.TestCase):
    def test_ledger_summary_and_unaffordability(self):
        report=summarize_resources(rows())
        self.assertEqual(report['mean_acquired'],5)
        self.assertEqual(report['mean_wait_seconds_per_game'],2)
        self.assertEqual(report['mean_spent'],2)
        self.assertFalse(report['automatic_patch'])

    def test_corrupt_ledgers_and_partial_runs_rejected(self):
        with self.assertRaises(ValueError):summarize_resources(rows()[:-1])
        data=rows();data[0]['result']['crystals']+=1
        with self.assertRaises(ValueError):summarize_resources(data)
        data=rows();data[0]['result']['crystalTrace']['events'][0]['amount']=3
        with self.assertRaises(ValueError):summarize_resources(data)

    def test_resume_skips_finished_games(self):
        calls=[]
        class Worker:
            def request(self,op,**query):
                if op=='describe':return {'fingerprint':'test','sources':{}}
                calls.append(query['seed'])
                return next(r['result'] for r in rows() if r['seed']==query['seed'])
            def close(self):pass
        with tempfile.TemporaryDirectory() as tmp,patch.object(diagnostic.agent,'RUNS',Path(tmp)), \
             patch.object(diagnostic,'CrystalWorker',Worker):
            root=Path(tmp);parent=root/'2026-10-27-frontier50';parent.mkdir()
            (parent/'manifest.json').write_text(json.dumps({'allocation':{'frontier_planned':64},'budget':5000}))
            (parent/'progress.json').write_text('{"state":"complete"}')
            (parent/'time-budget.json').write_text(json.dumps({'deadline_epoch':diagnostic.time.time()+600}))
            diagnostic.execute('2026-10-27');diagnostic.execute('2026-10-27')
            self.assertEqual(calls,list(SEEDS))
            report=json.loads((root/'2026-10-27-crystal-diagnostic/report.json').read_text())
            self.assertEqual(report['daily_total_allocated'],70)


if __name__=='__main__':unittest.main()
