import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from balance_ml import coupling_study as study

PLAN={'seeds':list(range(91001,91009)),'rng_modes':['legacy-lcg',study.EVENT],
      'miner_caps':[18,22],'target_wave':50,'decision_ticks':2,'planned_games':32}


def result(seed,mode,cap):
    delta=(seed%5-2) if mode=='legacy-lcg' else seed%2
    return {'seed':seed,'target':50,'rngProtocol':mode,'minerCap':cap,'cleared':30+(delta if cap==22 else 0),
      'invalid':0,'end':'castle_destroyed','actions':{'upgradeCastle:':1},'crystals':15,
      'time':1000,'hp':0,'kills':100,'leaks':1,'damage':100,'destroyed':2,'miners':cap,'workers':4,'gold':100,
      'crystalTrace':{'initial':12,'acquired':5,'spent':2,'balanceError':0},
      'randomAudit':{'protocol':study.EVENT,'samples':[{'stream':'mine','event':[0],'draw':0,'value':.5}]} if mode==study.EVENT else None}


def rows():
    return [{**j,'result':result(j['seed'],j['rng_mode'],j['miner_cap'])} for j in study.jobs(PLAN)]


class CouplingTests(unittest.TestCase):
    def test_predeclared_pairs_and_descriptive_variance(self):
        report=study.analyze(rows(),PLAN)
        self.assertEqual(report['decision'],'method_diagnostic_only')
        self.assertEqual(len(report['common_event_audits']),8)
        self.assertTrue(report['clean_results']);self.assertFalse(report['automatic_patch'])
        self.assertIsNotNone(report['observed_variance_ratio_event_to_legacy'])
        with self.assertRaises(ValueError):study.jobs({**PLAN,'seeds':[1]*8})
        with self.assertRaises(ValueError):study.analyze(rows()[:-1],PLAN)

    def test_protocol_identity_and_audit_corruption_rejected(self):
        data=rows();data[0]['result']['rngProtocol']=study.EVENT
        with self.assertRaises(ValueError):study.analyze(data,PLAN)
        data=rows();data[-1]['result']['randomAudit']['samples'][0]['value']=.6
        with self.assertRaises(ValueError):study.analyze(data,PLAN)
        data=rows();data[-1]['result']['crystals']+=1
        with self.assertRaises(ValueError):study.analyze(data,PLAN)

    def test_resume_no_duplicate_games_and_persisted_deadline(self):
        calls=[]
        class Worker:
            def request(self,op,**q):
                if op=='describe':return {'fingerprint':'test','sources':{}}
                calls.append(q);return result(q['seed'],q['rngMode'],q['minerCap'])
            def close(self):pass
        with tempfile.TemporaryDirectory() as tmp,patch.object(study.agent,'RUNS',Path(tmp)), \
             patch.object(study,'CouplingWorker',Worker):
            study.execute('2026-10-28');study.execute('2026-10-28')
            self.assertEqual(len(calls),32)
            directory=Path(tmp)/'2026-10-28-rng-coupling'
            report=json.loads((directory/'report.json').read_text())
            self.assertEqual(report['daily_total_allocated'],32)
            (directory/'time-budget.json').write_text('{"deadline_epoch":1}')
            with self.assertRaises(ValueError):study.execute('2026-10-28')
            self.assertEqual(len(calls),32)


if __name__=='__main__':unittest.main()
