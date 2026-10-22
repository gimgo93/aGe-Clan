"""Tiny learning/save/load integration check, not strategy evaluation."""
from pathlib import Path
import tempfile
import unittest

from ml.evaluate import evaluate
from ml.experiment import ROOT, load_config, write_json
from ml.train import train
from ml.benchmark import reference_evaluate


class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_root = ROOT / 'ml' / 'runs'
        cls.temp_root.mkdir(parents=True, exist_ok=True)

    def test_train_save_load_evaluate(self):
        config = load_config(total_timesteps=32)
        config['env']['max_ticks'] = 13
        config['ppo'].update(n_steps=32, batch_size=16, n_epochs=1)
        with tempfile.TemporaryDirectory(dir=self.temp_root) as directory:
            run = Path(directory) / 'tiny-run'
            manifest = train(config, run, verbose=0, checkpoint_freq=16)
            self.assertEqual(manifest['actual_timesteps'], 32)
            self.assertEqual(manifest['model']['parameters'], 38702)
            self.assertTrue((run / 'progress.csv').is_file())
            self.assertTrue((run / 'checkpoints' / 'ppo_16_steps.zip').is_file())
            self.assertTrue((run / 'checkpoints' / 'ppo_vecnormalize_16_steps.pkl').is_file())
            for filename in ('config.json', 'model.zip', 'vecnormalize.pkl', 'manifest.json', 'episodes.monitor.csv'):
                self.assertTrue((run / filename).is_file(), filename)
            before = (run / 'vecnormalize.pkl').read_bytes()
            first = evaluate(run, episodes=2, seed=10000)
            second = evaluate(run, episodes=2, seed=10000)
            self.assertEqual(first, second)
            self.assertEqual(len(first['episodes']), 2)
            self.assertEqual(first['episodes'][0]['end_reason'], 'time_limit')
            self.assertEqual(before, (run / 'vecnormalize.pkl').read_bytes())
            with self.assertRaises(FileExistsError):
                train(config, run, verbose=0)
            manifest['environment']['version'] = 999
            write_json(run / 'manifest.json', manifest)
            with self.assertRaisesRegex(ValueError, 'schema differ'):
                evaluate(run, episodes=1)

    def test_config_validation(self):
        with tempfile.TemporaryDirectory(dir=self.temp_root) as directory:
            path = Path(directory) / 'config.json'
            for bad in (-1, 0, True):
                config = load_config()
                config['total_timesteps'] = bad
                write_json(path, config)
                with self.assertRaises(ValueError):
                    load_config(path)
            config = load_config()
            config['ppo']['batch_size'] = 17
            write_json(path, config)
            with self.assertRaises(ValueError):
                load_config(path)

    def test_reference_policies(self):
        config = {'frame_skip': 10, 'max_ticks': 13, 'target_wave': 0}
        for policy in ('wait', 'random', 'masked-random', 'scripted'):
            first = reference_evaluate(config, policy, 2, 20000)
            self.assertEqual(first, reference_evaluate(config, policy, 2, 20000))
            self.assertEqual(first['summary']['horizon_survivals'], 2)

    def test_masked_training_and_evaluation(self):
        config = load_config(total_timesteps=32)
        config['env']['max_ticks'] = 50
        config['ppo'].update(n_steps=32, batch_size=16, n_epochs=1)
        with tempfile.TemporaryDirectory(dir=self.temp_root) as directory:
            run = Path(directory) / 'masked'
            manifest = train(config, run, verbose=0, masked=True)
            self.assertEqual(manifest['algorithm'], 'MaskablePPO')
            result = evaluate(run, episodes=2, seed=40000)
            self.assertTrue(all(row['invalid_actions'] == 0 for row in result['episodes']))
            self.assertEqual(result, evaluate(run, episodes=2, seed=40000))
            continued = Path(directory) / 'continued'
            resumed = train(config, continued, verbose=0, masked=True, resume_from=run)
            self.assertEqual(resumed['actual_timesteps'], 64)
            self.assertEqual(resumed['added_timesteps'], 32)
            self.assertTrue(all(row['invalid_actions'] == 0 for row in evaluate(continued, 1, 50000)['episodes']))
            changed = load_config(total_timesteps=32)
            with self.assertRaisesRegex(ValueError, 'settings and seed unchanged'):
                train(changed, Path(directory) / 'wrong-settings', masked=True, resume_from=run)


if __name__ == '__main__':
    unittest.main(verbosity=2)
