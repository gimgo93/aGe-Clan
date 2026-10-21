"""Offline integration tests. Run from the repository root."""
import unittest
from unittest.mock import patch
import queue

import gymnasium as gym
from gymnasium.utils.env_checker import check_env as gym_check_env
import numpy as np
from stable_baselines3.common.env_checker import check_env as sb3_check_env
from stable_baselines3.common.vec_env import DummyVecEnv

from ml.env import AgeClanEnv


class EnvironmentTests(unittest.TestCase):
    def test_checkers(self):
        with AgeClanEnv(max_ticks=200) as env:
            gym_check_env(env, skip_render_check=True)
            sb3_check_env(env, warn=True)

    def test_seed_and_isolation(self):
        with AgeClanEnv() as a, AgeClanEnv() as b:
            obs_a, info_a = a.reset(seed=42)
            obs_b, info_b = b.reset(seed=42)
            np.testing.assert_array_equal(obs_a, obs_b)
            self.assertEqual(info_a, info_b)
            commands = [1, 132, 0, 0, 0] * 20
            for action in commands:
                left, right = a.step(action), b.step(action)
                np.testing.assert_array_equal(left[0], right[0])
                self.assertEqual(left[1:], right[1:])
            a.reset(seed=42)
            for action in commands:
                replay = a.step(action)
            np.testing.assert_array_equal(replay[0], right[0])
            a.step(0)
            self.assertEqual(b._process.poll(), None)
            self.assertNotEqual(a._process.pid, b._process.pid)

    def test_horizon_invalid_and_cleanup(self):
        env = AgeClanEnv(frame_skip=100, max_ticks=13)
        try:
            with self.assertRaises(gym.error.ResetNeeded):
                env.step(0)
            env.reset(seed=0)
            with self.assertRaises(ValueError):
                env.step(-1)
            result = env.step(0)
            self.assertFalse(result[2])
            self.assertTrue(result[3])
            self.assertEqual(result[4]['ticks'], 13)
            self.assertAlmostEqual(result[4]['game_time'], 1.3)
            self.assertTrue(env.observation_space.contains(result[0]))
            with self.assertRaises(gym.error.ResetNeeded):
                env.step(0)
            env.reset(seed=1)
        finally:
            env.close()
            env.close()
        self.assertIsNotNone(env._process.poll())
        self.assertFalse(env._reader.is_alive())
        with self.assertRaises(RuntimeError):
            env.reset()

    def test_random_episodes(self):
        with AgeClanEnv(frame_skip=50, max_ticks=2000) as env:
            env.action_space.seed(99)
            for seed in (7, 19, 99):
                observation, _ = env.reset(seed=seed)
                self.assertTrue(env.observation_space.contains(observation))
                for _ in range(40):
                    observation, reward, terminated, truncated, _ = env.step(env.action_space.sample())
                    self.assertTrue(env.observation_space.contains(observation))
                    self.assertTrue(np.isfinite(reward))
                    if terminated or truncated:
                        break
                else:
                    self.fail('Episode did not finish at configured horizon')

    def test_sb3_vector_auto_reset(self):
        env = DummyVecEnv([lambda: AgeClanEnv(max_ticks=10)])
        try:
            env.seed(42)
            env.reset()
            _, _, done, infos = env.step(np.array([0]))
            self.assertTrue(done[0])
            self.assertTrue(infos[0]['TimeLimit.truncated'])
            self.assertIn('terminal_observation', infos[0])
            env.step(np.array([0]))
        finally:
            env.close()

    def test_configuration(self):
        for kwargs in ({'frame_skip': 0}, {'max_ticks': -1}, {'target_wave': -1},
                       {'frame_skip': 1.5}, {'max_ticks': True}, {'response_timeout': 0}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                AgeClanEnv(**kwargs)

    def test_unexpected_bridge_exit(self):
        with AgeClanEnv() as env:
            env.reset(seed=1)
            env._process.kill()
            env._process.wait(timeout=5)
            with self.assertRaises(RuntimeError):
                env.step(0)


    def test_timeout_closes_process(self):
        with AgeClanEnv() as env:
            env.reset(seed=1)
            with patch.object(env._responses, 'get', side_effect=queue.Empty):
                with self.assertRaisesRegex(RuntimeError, 'communication failed'):
                    env.step(0)
            self.assertIsNotNone(env._process.poll())


if __name__ == '__main__':
    unittest.main(verbosity=2)
