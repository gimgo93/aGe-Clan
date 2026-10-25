import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from balance_ml.finalize import follow


class FinalizeTests(unittest.TestCase):
    def test_running_data_is_not_analyzed(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'progress.json').write_text('{"state":"running"}')
            with patch('balance_ml.finalize.finalize') as finalize:
                self.assertEqual(follow(p)['state'],'pending')
                finalize.assert_not_called()
            self.assertFalse((p/'analysis.lock').exists())

    def test_completed_result_is_analyzed_once(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'progress.json').write_text('{"state":"complete"}')
            def finish(directory):
                (directory/'analysis-complete.json').write_text('{"preserve":true}')
                return {'state':'analyzed'}
            with patch('balance_ml.finalize.finalize',side_effect=finish) as finalize:
                self.assertEqual(follow(p)['state'],'analyzed')
                self.assertEqual(follow(p)['state'],'already_analyzed')
                self.assertEqual(finalize.call_count,1)
            self.assertEqual(json.loads((p/'analysis-complete.json').read_text()),{'preserve':True})

    def test_failure_and_existing_reservation(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'progress.json').write_text('{"state":"failed"}')
            self.assertEqual(follow(p)['run_state'],'failed')
            (p/'analysis.lock').write_text('{"pid":123}')
            with self.assertRaises(ValueError):follow(p)
            self.assertTrue((p/'analysis.lock').exists())
