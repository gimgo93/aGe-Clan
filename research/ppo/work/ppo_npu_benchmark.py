import json
from pathlib import Path
from time import perf_counter

import numpy as np
import openvino as ov
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
import torch

from ml.env import AgeClanEnv
from ml.experiment import environment_signature


WORK = Path(__file__).resolve().parent
RUN = WORK / 'ppo-results/current-engine/fresh-defense-g099'
OUTPUT = WORK / 'ppo-next/npu-benchmark'


class Actor(torch.nn.Module):
    def __init__(self, policy):
        super().__init__()
        self.policy_net = policy.mlp_extractor.policy_net
        self.action_net = policy.action_net

    def forward(self, observation):
        return self.action_net(self.policy_net(observation))


def episode(env, normalizer, infer, seed, samples=None):
    obs, info = env.reset(seed=seed)
    steps = 0
    action_seconds = mask_seconds = game_seconds = 0.0
    start = perf_counter()
    while True:
        tick = perf_counter()
        mask = env.action_masks()
        mask_seconds += perf_counter() - tick
        tick = perf_counter()
        normalized = normalizer.normalize_obs(obs[None]).astype(np.float32)
        logits = infer(normalized)
        action = int(np.argmax(np.where(mask, logits[0], -1e8)))
        action_seconds += perf_counter() - tick
        if samples is not None and len(samples) < 256:
            samples.append((normalized.copy(), mask.copy()))
        tick = perf_counter()
        obs, _, done, truncated, info = env.step(action)
        game_seconds += perf_counter() - tick
        steps += 1
        if done or truncated:
            return {key: info[key] for key in ('contiguous_cleared', 'kills', 'leaks', 'damage_taken', 'end_reason')} | {
                'steps': steps, 'wall_seconds': perf_counter() - start,
                'action_seconds': action_seconds, 'mask_seconds': mask_seconds,
                'game_seconds': game_seconds, 'seed': seed}


def latency(infer, samples):
    for obs, _ in samples[:30]:
        infer(obs)
    rounds = []
    for _ in range(5):
        start = perf_counter()
        for index in range(400):
            obs, mask = samples[index % len(samples)]
            logits = infer(obs)
            int(np.argmax(np.where(mask, logits[0], -1e8)))
        rounds.append((perf_counter() - start) / 400 * 1e6)
    return {'round_mean_us': rounds, 'median_us': float(np.median(rounds))}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(1)
    record = json.loads((RUN / 'manifest.json').read_text(encoding='utf-8'))
    vector = VecNormalize.load(RUN / 'vecnormalize.pkl', DummyVecEnv([lambda: AgeClanEnv(**record['config']['env'])]))
    vector.training = False
    env = vector.envs[0]
    assert environment_signature(env) == record['environment']
    model = MaskablePPO.load(RUN / 'model.zip', device='cpu')
    actor = Actor(model.policy).eval()

    def cpu_infer(obs):
        with torch.inference_mode():
            return actor(torch.from_numpy(obs)).numpy()

    core = ov.Core()
    report = {'openvino': ov.__version__, 'torch': torch.__version__, 'devices': core.available_devices,
              'input_shape': [1, 148], 'output_shape': [1, 173], 'power_measurement': 'not measured',
              'adoption_criteria': {'action_agreement_min': .99, 'episode_speedup_min': 1.1}}
    try:
        samples = []
        episode(env, vector, cpu_infer, 208000, samples)
        episode(env, vector, cpu_infer, 208001, samples)
        report['torch_cpu_latency'] = latency(cpu_infer, samples)
        print('CPU latency', report['torch_cpu_latency'], flush=True)
        start = perf_counter()
        converted = ov.convert_model(actor, example_input=torch.zeros(1, 148), input=[1, 148])
        report['conversion_seconds'] = perf_counter() - start
        ov.save_model(converted, OUTPUT / 'actor.xml', compress_to_fp16=False)
        for device in ('CPU', 'NPU'):
            if device not in core.available_devices:
                report[device] = {'error': 'Device unavailable in OpenVINO'}
                continue
            result = {}
            report[device] = result
            try:
                result['full_name'] = core.get_property(device, 'FULL_DEVICE_NAME')
                start = perf_counter()
                settings = {'PERFORMANCE_HINT': 'LATENCY'}
                if device == 'CPU':
                    settings['INFERENCE_NUM_THREADS'] = 1
                compiled = core.compile_model(converted, device, settings)
                result['compile_seconds'] = perf_counter() - start
                request = compiled.create_infer_request()

                def infer(obs):
                    request.infer({0: obs})
                    return request.get_output_tensor(0).data

                start = perf_counter()
                infer(samples[0][0])
                result['first_inference_seconds'] = perf_counter() - start
                agreement = 0
                error = 0.0
                for obs, mask in samples:
                    expected, actual = cpu_infer(obs), infer(obs)
                    error = max(error, float(np.max(np.abs(expected - actual))))
                    agreement += int(np.argmax(np.where(mask, expected[0], -1e8)) ==
                                     np.argmax(np.where(mask, actual[0], -1e8)))
                result['action_agreement'] = agreement / len(samples)
                result['max_abs_logit_error'] = error
                result['latency'] = latency(infer, samples)
                cpu_rows, device_rows = [], []
                for index, seed in enumerate(range(208000, 208005)):
                    # Alternate order to reduce systematic warm-up/order bias.
                    if index % 2:
                        device_rows.append(episode(env, vector, infer, seed))
                        cpu_rows.append(episode(env, vector, cpu_infer, seed))
                    else:
                        cpu_rows.append(episode(env, vector, cpu_infer, seed))
                        device_rows.append(episode(env, vector, infer, seed))
                result['torch_cpu_episodes'] = cpu_rows
                result['device_episodes'] = device_rows
                result['episode_speedup'] = sum(row['wall_seconds'] for row in cpu_rows) / sum(row['wall_seconds'] for row in device_rows)
                keys = ('contiguous_cleared', 'kills', 'leaks', 'damage_taken', 'end_reason', 'steps')
                result['episode_outcomes_equal'] = all(all(a[key] == b[key] for key in keys)
                                                        for a, b in zip(cpu_rows, device_rows))
                print(device, result['latency'], 'speedup', result['episode_speedup'], flush=True)
            except Exception as error:
                result['error'] = f'{type(error).__name__}: {error}'
                print(device, result['error'], flush=True)
        npu = report.get('NPU', {})
        report['adopt_npu_inference'] = (npu.get('action_agreement', 0) >= .99
                                         and npu.get('episode_speedup', 0) >= 1.1
                                         and npu.get('episode_outcomes_equal', False))
    except Exception as error:
        report['error'] = f'{type(error).__name__}: {error}'
        report['adopt_npu_inference'] = False
        print(report['error'], flush=True)
    finally:
        vector.close()
        (OUTPUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
