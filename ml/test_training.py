"""Tiny learning/save/load integration check, not strategy evaluation."""
from pathlib import Path
from copy import deepcopy
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

    def test_explicit_resumed_learning_rate(self):
        from sb3_contrib import MaskablePPO
        config = load_config(total_timesteps=32)
        config['env']['max_ticks'] = 50
        config['ppo'].update(n_steps=32, batch_size=16, n_epochs=1)
        with tempfile.TemporaryDirectory(dir=self.temp_root) as directory:
            parent, child = Path(directory) / 'parent', Path(directory) / 'child'
            train(config, parent, verbose=0, masked=True)
            original = MaskablePPO.load(parent / 'model.zip', device='cpu')
            parent_steps = [float(state['step']) for state in original.policy.optimizer.state.values()]
            manifest = train(config, child, verbose=0, masked=True, resume_from=parent,
                             resume_learning_rate=0.0001)
            self.assertEqual(config['ppo']['learning_rate'], 0.0003, 'caller config must not change')
            self.assertEqual(manifest['resume_overrides'], {'learning_rate': {'from': 0.0003, 'to': 0.0001}})
            self.assertEqual(manifest['config']['ppo']['learning_rate'], 0.0001)
            self.assertEqual(manifest['actual_timesteps'], 64)
            loaded = MaskablePPO.load(child / 'model.zip', device='cpu')
            self.assertAlmostEqual(loaded.learning_rate, 0.0001)
            for progress in (0.0, 0.5, 1.0):
                self.assertAlmostEqual(loaded.lr_schedule(progress), 0.0001)
            for group in loaded.policy.optimizer.param_groups:
                self.assertAlmostEqual(group['lr'], 0.0001)
            self.assertGreater(min(float(state['step']) for state in loaded.policy.optimizer.state.values()), max(parent_steps))
            self.assertTrue(all(row['invalid_actions'] == 0 for row in evaluate(child, 1, 80000)['episodes']))
            implicit = deepcopy(config)
            implicit['ppo']['learning_rate'] = 0.0001
            with self.assertRaisesRegex(ValueError, 'settings and seed unchanged'):
                train(implicit, Path(directory) / 'implicit', masked=True, resume_from=parent)
            bad = deepcopy(config)
            bad['ppo']['gamma'] = 0.95
            with self.assertRaisesRegex(ValueError, 'settings and seed unchanged'):
                train(bad, Path(directory) / 'other-change', masked=True, resume_from=parent, resume_learning_rate=0.0001)
            for value in (0, -1, float('nan'), float('inf'), True):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    train(config, Path(directory) / 'invalid', masked=True, resume_from=parent, resume_learning_rate=value)
            with self.assertRaisesRegex(ValueError, 'requires resume_from'):
                train(config, Path(directory) / 'no-parent', masked=True, resume_learning_rate=0.0001)


if __name__ == '__main__':
    unittest.main(verbosity=2)
