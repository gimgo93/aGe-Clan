import copy
import json
import tempfile
import unittest
from pathlib import Path
from balance_ml.effect_data import extract_pairs
from balance_ml.effect_model import EffectModel
from balance_ml.effect_train import split_pairs,train_effect,read_completed_run
from balance_ml.model import group

SCHEMA={'startGold':{'min':0,'max':100,'base':0},'towers.storm.gold':{'min':1,'max':10,'base':5}}


def pairs():
    return [dict(params={'startGold':value},policy='p',seed=seed,target_wave=50,fingerprint='test',
                 delta=.45*value,relevant_use=True)
            for seed in range(20) for value in range(5,101,5)]


def row(params=None,stage='data',seed=1,cleared=10,actions=None):
    return dict(stage=stage,params=params or {},seed=seed,policy='p',result=dict(
        target=50,cleared=cleared,invalid=0,end='castle_destroyed',actions=actions or {}))


class PairTests(unittest.TestCase):
    def test_matching_and_heldout_exclusion(self):
        rows=[row(),row({'startGold':5},cleared=12),row(stage='confirmation',seed=2),
              row({'startGold':5},seed=2),row({'startGold':7},stage='development')]
        data=extract_pairs(rows,'test',50)
        self.assertEqual([p['delta'] for p in data['pairs']],[2])
        self.assertEqual(data['diagnostics']['unmatched_candidates'],1)
        self.assertEqual(data['diagnostics']['held_out_rows_ignored'],2)

    def test_exposure_and_invalid(self):
        rows=[row(),row({'towers.storm.gold':3})]
        self.assertFalse(extract_pairs(rows,'test',50)['pairs'][0]['relevant_use'])
        rows[1]['result']['actions']={'build:storm':1}
        self.assertTrue(extract_pairs(rows,'test',50)['pairs'][0]['relevant_use'])
        rows[1]['result']['end']='time_limit'
        self.assertEqual(extract_pairs(rows,'test',50)['pairs'],[])

    def test_duplicates_conflict_and_target(self):
        a=row({'startGold':5},cleared=11)
        self.assertEqual(extract_pairs([row(),a,a],'test',50)['diagnostics']['duplicate_records_ignored'],1)
        b=copy.deepcopy(a);b['result']['cleared']=12
        with self.assertRaises(ValueError):extract_pairs([a,b],'test',50)
        with self.assertRaises(ValueError):extract_pairs([row()],'test',40)


class RunReaderTests(unittest.TestCase):
    def test_completed_run_identity_and_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            def write(name,value):
                (root/name).write_text(json.dumps(value),encoding='utf-8')
            manifest={'fingerprint':'test','budget':2,'schema':SCHEMA,'policies':['p']}
            write('manifest.json',manifest)
            write('progress.json',{'state':'complete','completed_games':2})
            write('report.json',{'state':'complete','completed_games':2,'fingerprint':'test'})
            rows=[row(),row({'startGold':5},cleared=11)]
            for i,r in enumerate(rows):r['id']=str(i);r['result']['target']=40
            (root/'episodes.jsonl').write_text('\n'.join(json.dumps(r) for r in rows),encoding='utf-8')
            self.assertEqual(read_completed_run(root)[1]['diagnostics']['matched_pairs'],1)
            write('progress.json',{'state':'running','completed_games':2})
            with self.assertRaises(ValueError):read_completed_run(root)
            write('progress.json',{'state':'complete','completed_games':1})
            with self.assertRaises(ValueError):read_completed_run(root)
            write('progress.json',{'state':'complete','completed_games':2})
            write('report.json',{'state':'complete','completed_games':2,'fingerprint':'other'})
            with self.assertRaises(ValueError):read_completed_run(root)


class ModelTests(unittest.TestCase):
    def test_learns_delta_and_fifty_target(self):
        model=EffectModel(SCHEMA,['p'],50,'test').fit(pairs())
        prediction,_=model.predict_delta({'startGold':100},'p')
        self.assertGreater(prediction,40)
        self.assertLess(abs(prediction-45),3)
        self.assertEqual(model.predict_delta({},'p'),(0.,0.))
        with self.assertRaises(ValueError):model.predict_delta({'towers.storm.gold':3},'p')
        with self.assertRaises(ValueError):model.predict_delta({'startGold':1},'p')

    def test_roundtrip_and_identity_guards(self):
        model=EffectModel(SCHEMA,['p'],50,'test').fit(pairs())
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'model';model.save(path)
            loaded=EffectModel.load(path,target_wave=50,fingerprint='test')
            self.assertEqual(loaded.predict_delta({'startGold':50},'p'),model.predict_delta({'startGold':50},'p'))
            with self.assertRaises(FileExistsError):model.save(path)
            with self.assertRaises(ValueError):EffectModel.load(path,target_wave=40,fingerprint='test')
            with self.assertRaises(ValueError):EffectModel.load(path,target_wave=50,fingerprint='other')
            with (path/'weights.npz').open('ab') as f:f.write(b'changed')
            with self.assertRaises(ValueError):EffectModel.load(path,target_wave=50,fingerprint='test')

    def test_disjoint_split_and_training(self):
        train,test,cross=split_pairs(pairs())
        self.assertFalse({p['seed'] for p in train}&{p['seed'] for p in test})
        self.assertFalse({group(p['params']) for p in train}&{group(p['params']) for p in test})
        self.assertEqual(len(train)+len(test)+len(cross),len(pairs()))
        model,report=train_effect(pairs(),SCHEMA,['p'],50,'test')
        self.assertIsNotNone(model)
        self.assertTrue(report['beats_zero_effect_on_evaluated_subset'])
        self.assertGreater(report['evaluated_pairs'],0)

    def test_insufficient_data_and_mixed_source(self):
        data=[p for p in pairs() if p['seed']==0]
        model,report=train_effect(data,SCHEMA,['p'],50,'test')
        self.assertIsNone(model);self.assertEqual(report['state'],'insufficient_paired_data')
        with self.assertRaises(ValueError):train_effect(data,SCHEMA,['p'],40,'test')
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):EffectModel(SCHEMA,['p'],50,'test').save(Path(tmp)/'empty')


if __name__=='__main__':unittest.main()
