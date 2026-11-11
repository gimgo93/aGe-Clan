"""Short random rollout and simulation throughput measurement; no model training."""
from time import perf_counter

from ml.env import AgeClanEnv


def main():
    with AgeClanEnv(frame_skip=50, max_ticks=3000) as env:
        env.reset(seed=42)
        env.action_space.seed(42)
        began = perf_counter()
        total_reward = 0
        for step in range(60):
            _, reward, terminated, truncated, info = env.step(env.action_space.sample())
            total_reward += reward
            if terminated or truncated:
                break
        elapsed = perf_counter() - began
        print(f"steps={step + 1} game_seconds={info['game_time']:.1f} wall_seconds={elapsed:.3f} "
              f"speedup={info['game_time'] / elapsed:.1f}x reward={total_reward:.3f} "
              f"end={info['end_reason']}")


if __name__ == '__main__':
    main()
