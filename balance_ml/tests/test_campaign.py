import json
from pathlib import Path
import tempfile
import unittest
from balance_ml.campaign import allocation,jobs,ensure_day_available


class CampaignTests(unittest.TestCase):
    def test_budget_and_predeclared_jobs(self):
        a=allocation()
        self.assertEqual(a['ml_games']+a['frontier_reserved'],5000)
        self.assertEqual(a['ml_games']%5,0)
        self.assertLessEqual(a['ml_games']+a['frontier_planned'],5000)
        plan={'development_seeds':[1,2,3],'confirmation_seeds':[4,5,6,7,8]}
        queue=jobs(plan)
        self.assertEqual(len(queue),64);self.assertEqual(len({j['id'] for j in queue}),64)
        dev={j['seed'] for j in queue if j['stage']=='development'}
        confirm={j['seed'] for j in queue if j['stage']=='confirmation'}
        self.assertFalse(dev&confirm)
        with self.assertRaises(ValueError):allocation(10000)

    def test_existing_daily_reservation_blocks_new_campaign(self):
        with tempfile.TemporaryDirectory() as folder:
            runs=Path(folder);day='2026-10-25'
            old=runs/day;old.mkdir();(old/'manifest.json').write_text('{}')
            with self.assertRaises(ValueError):ensure_day_available(runs,day,day+'-frontier50',day+'-ml40')
            ensure_day_available(runs,'2026-10-26','2026-10-26-frontier50','2026-10-26-ml40')


class CampaignIntegrationTests(unittest.TestCase):
    def test_worker_description_uses_actual_balance_without_games(self):
        from balance_ml.campaign import FrontierWorker
        worker=FrontierWorker()
        try:
            d=worker.request(op='describe')
            self.assertEqual(len(d['fingerprint']),64)
            self.assertEqual(len(d['profiles']),4)
        finally:worker.close()

    def test_campaign_resume_does_not_repeat_games_or_training(self):
        from unittest.mock import patch
        import balance_ml.campaign as campaign
        calls=[];ml_calls=[]
        class FakeWorker:
            def request(self,op,**query):
                if op=='describe':return {'fingerprint':'test','sources':{},'profiles':[{'id':p} for p in
                    ['mixed-timing-1s','mixed-timing-02s','mixed-no-potions-02s','mixed-no-economy-02s']]}
                calls.append(query)
                return {'cleared':30,'invalid':0,'end':'castle_destroyed'}
            def close(self):pass
        def fake_ml(args):
            ml_calls.append(args)
            directory=campaign.agent.RUNS/args.run;directory.mkdir()
            (directory/'progress.json').write_text('{"state":"complete"}')
        with tempfile.TemporaryDirectory() as folder, patch.object(campaign.agent,'RUNS',Path(folder)), \
                patch.object(campaign,'FrontierWorker',FakeWorker),patch.object(campaign.agent,'execute',fake_ml):
            campaign.execute('2026-10-26')
            campaign.execute('2026-10-26')
            self.assertEqual(len(calls),64)
            self.assertEqual(len(ml_calls),1)
            self.assertEqual(ml_calls[0].games,4935)
            progress=json.loads(Path(folder,'2026-10-26-frontier50/progress.json').read_text())
            self.assertEqual(progress['state'],'complete')
