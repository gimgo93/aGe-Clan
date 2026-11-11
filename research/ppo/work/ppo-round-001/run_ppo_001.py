"""PPO 001: paired hierarchy parents, lower learning rate, full-wave evaluation.

PyCharm Run starts this file. It delegates to the existing PPO environment,
loads the four frozen initial.zip parents, trains, evaluates and writes report 001.
"""
from pathlib import Path
import os
import sys
import subprocess

ROOT = Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
PYTHON = ROOT / 'work/ppo-venv/Scripts/python.exe'

if Path(sys.executable).resolve() != PYTHON.resolve():
    if __name__ == '__main__':
        print(f'PPO 전용 Python으로 실행합니다: {PYTHON}', flush=True)
        raise SystemExit(subprocess.call([str(PYTHON), '-u', str(Path(__file__)), *sys.argv[1:]]))
    raise RuntimeError('Import this runner using the dedicated PPO Python environment')

from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
import csv
import time
import traceback
import msvcrt
import numpy as np
import torch

sys.path.insert(0, str(ROOT / 'work'))
import ppo_step_study as study
from stable_baselines3.common.utils import FloatSchedule

BASE = ROOT / 'work/ppo-round-001'
SOURCE = ROOT / 'work/ppo-step-budget-v1'
REPORT = ROOT / 'outputs/PPO_간단보고서_001회.md'
KEYS = [f'hierarchy-{seed}-{mode}' for seed in (42, 43) for mode in ('basic', 'imitation')]
LEARNING_RATE = 0.00003
BUDGET = 131072
CHECKPOINTS = (65536, BUDGET)


def emit(message):
    line = f'[{datetime.now().astimezone().isoformat(timespec="seconds")}] {message}'
    print(line, flush=True)
    with (BASE / 'training.log').open('a', encoding='utf-8') as stream:
        stream.write(line + '\n')


def configure():
    torch.set_num_threads(1)
    study.BASE = BASE
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


def preflight():
    configure()
    plan = study.read(BASE / 'plan.json')
    for filename, expected in plan['frozen_files'].items():
        assert study.sha(filename) == expected, filename
    assert study.read(SOURCE / 'transport-verification.json')['status'] == 'passed'
    for key in KEYS:
        parent = SOURCE / 'runs' / key / 'initial.zip'
        metadata = study.read(parent.with_name('initial-manifest.json'))
        baseline = parent.parent / 'checkpoints/ppo_131072.zip'
        assert study.sha(parent) == metadata['parent_model_sha256']
        assert study.sha(baseline) == plan['frozen_files'][str(baseline)]
        model = study.MaskablePPO.load(parent, device='cpu')
        assert model.num_timesteps == 0 and model._n_updates == 0
        assert not model.policy.optimizer.state
        env = study.FixedScaleEnv(**study.ENV)
        try:
            assert study.environment_signature(env.unwrapped) == metadata['environment']
            observation, _ = env.reset(seed=680000)
            masks = env.action_masks()
            action, _ = model.predict(observation, deterministic=True, action_masks=masks)
            assert masks[int(action)]
            _, reward, _, _, info = env.step(int(action))
            assert np.isfinite(reward) and 'error' not in info['action_result']
        finally:
            env.close()
        emit(f'PREFLIGHT OK {key} parent={study.sha(parent)[:12]}')


class Progress(study.BaseCallback):
    def __init__(self, key, run):
        super().__init__()
        self.key = key
        self.run = run
        self.started = time.perf_counter()

    def save_after_update(self, steps):
        assert self.model._n_updates == steps // 256 * 4
        assert all(abs(group['lr'] - LEARNING_RATE) < 1e-12 for group in self.model.policy.optimizer.param_groups)
        path = self.run / 'checkpoints' / f'ppo_{steps}.zip'
        self.model.save(path)
        study.write(path.with_suffix('.json'), {
            'steps': steps, 'gradient_epochs': self.model._n_updates,
            'post_gradient_update': True, 'learning_rate': LEARNING_RATE,
            'model_sha256': study.sha(path),
        })
        emit(f'CHECKPOINT {self.key} steps={steps:,} epochs={self.model._n_updates}')

    def _on_rollout_start(self):
        steps = self.model.num_timesteps
        if steps == 65536:
            self.save_after_update(steps)
        if steps % 16384 == 0:
            progress = {'key': self.key, 'steps': steps, 'target': BUDGET,
                        'elapsed_seconds': time.perf_counter() - self.started}
            study.write(self.run / 'live.json', progress)
            emit(f'TRAIN {self.key} {steps:,}/{BUDGET:,}')

    def _on_step(self):
        return True


def train(key):
    configure()
    run = BASE / 'runs' / key
    complete = run / 'manifest.json'
    if complete.exists():
        metadata = study.read(complete)
        assert metadata['status'] == 'complete'
        assert study.sha(run / 'checkpoints/ppo_131072.zip') == metadata['model_sha256']
        return key, metadata
    if run.exists():
        raise RuntimeError(f'Incomplete run requires inspection before recovery: {run}')
    (run / 'checkpoints').mkdir(parents=True)
    parent = SOURCE / 'runs' / key / 'initial.zip'
    inherited = study.read(parent.with_name('initial-manifest.json'))
    seed = inherited['seed']
    vector = study.DummyVecEnv([lambda: study.Monitor(
        study.FixedScaleEnv(**study.ENV), str(run / 'episodes.monitor.csv'),
        info_keywords=('contiguous_cleared', 'wave', 'leaks', 'end_reason'))])
    logger = None
    started = time.perf_counter()
    try:
        model = study.MaskablePPO.load(parent, env=vector, device='cpu')
        assert model.num_timesteps == model._n_updates == 0
        model.learning_rate = LEARNING_RATE
        model.lr_schedule = FloatSchedule(LEARNING_RATE)
        model.set_random_seed(seed)
        torch.manual_seed(seed + 100000)
        np.random.seed(seed + 100000)
        assert study.weights(model.policy) == inherited['parent_weights_sha256']
        logger = study.configure(str(run), ['csv'])
        model.set_logger(logger)
        callback = Progress(key, run)
        emit(f'START {key} lr={LEARNING_RATE} parent={parent}')
        model.learn(BUDGET, callback=callback)
        callback.save_after_update(BUDGET)
        with (run / 'episodes.monitor.csv').open(encoding='utf-8', newline='') as stream:
            episodes = list(csv.DictReader(line for line in stream if not line.startswith('#')))
        completed_steps = sum(int(row['l']) for row in episodes)
        assert completed_steps <= BUDGET
        metadata = {
            'status': 'complete', 'key': key, 'seed': seed,
            'architecture': 'hierarchy', 'initialization': inherited['initialization'],
            'parent': str(parent), 'parent_model_sha256': study.sha(parent),
            'bc_inherited': inherited['bc'], 'additional_bc_updates': 0,
            'ppo_steps': BUDGET, 'gradient_epochs': model._n_updates,
            'learning_rate': LEARNING_RATE, 'env': study.ENV,
            'ppo': {**study.PPO, 'learning_rate': LEARNING_RATE},
            'environment': inherited['environment'], 'input_scaling': inherited['input_scaling'],
            'runtime': study.runtime_versions(),
            'completed_games': len(episodes), 'partial_steps': BUDGET - completed_steps,
            'wall_seconds': time.perf_counter() - started,
            'model_sha256': study.sha(run / 'checkpoints/ppo_131072.zip'),
        }
        study.write(complete, metadata)
        study.write(run / 'live.json', {'status': 'complete', 'steps': BUDGET, 'target': BUDGET})
        emit(f'DONE {key} completed_games={len(episodes)} seconds={metadata["wall_seconds"]:.1f}')
        return key, metadata
    finally:
        if logger is not None:
            logger.close()
        vector.close()


def evaluate_job(key, group):
    configure()
    folder = SOURCE if group == 'reference' else BASE
    path = folder / 'runs' / key / 'checkpoints/ppo_131072.zip'
    result = study.evaluate(path, key, key.split('-')[-1], group, 660000, 20, BUDGET)
    emit(f'EVAL {group} {key} mean={result["summary"]["mean"]:.2f} middle={result["summary"]["in_middle"]}/20')
    return key, group, result


def paired_effect(reference, new):
    assert [(r['python_seed'], r['game_seed']) for r in reference['episodes']] == [
        (r['python_seed'], r['game_seed']) for r in new['episodes']]
    differences = np.array([b['contiguous_cleared'] - a['contiguous_cleared']
                            for a, b in zip(reference['episodes'], new['episodes'])], dtype=float)
    rng = np.random.default_rng(20261109)
    resampled = differences[rng.integers(0, 20, (10000, 20))].mean(axis=1)
    return {'mean_delta': float(differences.mean()),
            'conditional_game_bootstrap95': np.quantile(resampled, [.025, .975]).tolist(),
            'middle_count_delta': new['summary']['in_middle'] - reference['summary']['in_middle']}


def report(state):
    lines = ['**PPO 간단보고서 001회 학습률 비교**', '',
             f'상태 {state["status"]}. 계층형 시드42·43의 기본·모방4조건을 동일 초기 부모에서 비교한다.', '',
             '가설은 낮은 학습률이 모방 행동의 후반 이탈과 중급 성능 편차를 줄이는지다. '
             '신규 학습률0.00003, 모델당131,072스텝, 총524,288스텝이다. '
             '대조군은 기존0.0001의131,072스텝 모델을 재사용한다. 즉시 보상defense-v1, gamma0.99, '
             '173행동과148개 고정 입력 척도는 동일하다.', '',
             '|조건|기존 평균|새 평균|기존→새 중급 판수|새 표준편차|새 가변성|평균 차이와 게임95%구간|',
             '|---|---:|---:|---|---:|---:|---|']
    for key in KEYS:
        if key not in state.get('effects', {}):
            continue
        a = state['evaluations'][key]['reference']['summary']
        b = state['evaluations'][key]['lower-lr']['summary']
        effect = state['effects'][key]
        lo, hi = effect['conditional_game_bootstrap95']
        lines.append(f'|{key}|{a["mean"]:.2f}|{b["mean"]:.2f}|{a["in_middle"]}→{b["in_middle"]}/20|'
                     f'{b["sd"]:.2f}|{b["diversity_games"]}/20|{effect["mean_delta"]:+.2f} [{lo:+.2f}, {hi:+.2f}]|')
    if 'confirmation' in state:
        s = state['confirmation']['summary']
        lines += ['', f'중급 검토 후보 {state["candidate"]["key"]}. 별도670000–670019의20판에서 '
                  f'평균{s["mean"]:.2f}, 중앙값{s["median"]}, 범위{s["min"]}–{s["max"]}, '
                  f'30–35구간{s["in_middle"]}/20, 가변성{s["diversity_games"]}/20, '
                  f'무효{s["invalid"]}, 제한종료{s["censored"]}. 판정 {state["candidate"]["status"]}.']
    if state['runs']:
        games = sum(r['completed_games'] for r in state['runs'].values())
        partial = sum(r['partial_steps'] for r in state['runs'].values())
        lines += ['', f'완료한 신규 학습 {len(state["runs"])}/4조건, 완료 훈련{games:,}판, '
                  f'마지막 미완료 조각{partial:,}스텝. 부모의 모방 비용은 승계했고 이번 추가 모방은0회다. '
                  '게임20개의 짝bootstrap구간은 고정 정책의 게임 난수에 조건부다. 학습 시드는2개다.']
    lines += ['', '학습 시드42·43을 유지한 이유는 같은 초기 가중치와 자료에서 학습률의 영향을 짝 비교하기 위해서다. '
              '별도660000–660019의 게임으로 비교하고, 개발 선택 후670000–670019를 열었다. '
              '초급은 기본 초기화20–25, 중급은30–35, 고급은40이상이다. 주 지표는 실제 연속 완료 웨이브이며 함락까지 진행한다.', '',
              '이번부터 새 실험 묶음의 간단보고서는001회부터 증가한다. 같은 실행의 진행 갱신과 재평가는 같은 번호를 사용한다.', '',
              '**실제 파일과 실행 흐름**', '',
              f'- 파이참 실행 파일 `{BASE / "run_ppo_001.py"}`가 전용 환경 `{PYTHON}`으로 학습을 실행한다.',
              f'- 기존 제어 코드 `{ROOT / "work/ppo_step_study.py"}`의 환경·평가 함수를 재사용한다.',
              f'- Python 환경 → `{SOURCE / "engine/ml/bridge.mjs"}` → `{SOURCE / "engine/lib/game-engine.js"}` 순서로 실제 게임을 실행한다.',
              f'- 부모와 대조군은 `{SOURCE / "runs"}`, 신규 모델·CSV는 `{BASE / "runs"}`, 게임별 평가JSON은 `{BASE / "evaluations"}`에 저장한다.',
              f'- 상태 `{BASE / "state.json"}`, 전체 진행 로그 `{BASE / "training.log"}`, 결과 `{BASE / "result.json"}`.', '',
              state.get('next_plan', '다음 계획은 이번 짝 비교와 독립 확인 결과를 분석해 확정한다.')]
    REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    configure()
    with (BASE / 'execution.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'1')
            lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        existing = BASE / 'state.json'
        state = study.read(existing) if existing.exists() else {
            'round': 1, 'status': 'preflight', 'pid': os.getpid(),
            'started': datetime.now().astimezone().isoformat(), 'runs': {}, 'evaluations': {}, 'effects': {}}
        if state['status'] == 'complete':
            report(state)
            emit(f'Already complete. Report: {REPORT}')
            return
        state.pop('error', None)
        state.update(status='preflight', pid=os.getpid())
        study.write(existing, state)
        try:
            preflight()
            if '--check-only' in sys.argv:
                state['status'] = 'ready'
                study.write(existing, state)
                report(state)
                emit('PREFLIGHT COMPLETE. No PPO training started.')
                return
            state['status'] = 'training'
            study.write(existing, state)
            report(state)
            with ProcessPoolExecutor(max_workers=4) as pool:
                jobs = [pool.submit(train, key) for key in KEYS]
                for future in as_completed(jobs):
                    key, metadata = future.result()
                    state['runs'][key] = metadata
                    study.write(existing, state)
                    report(state)
            state['status'] = 'paired_evaluation'
            study.write(existing, state)
            with ProcessPoolExecutor(max_workers=4) as pool:
                jobs = [pool.submit(evaluate_job, key, group) for key in KEYS for group in ('reference', 'lower-lr')]
                for future in as_completed(jobs):
                    key, group, result = future.result()
                    state['evaluations'].setdefault(key, {})[group] = result
                    study.write(existing, state)
            for key in KEYS:
                results = state['evaluations'][key]
                state['effects'][key] = paired_effect(results['reference'], results['lower-lr'])
            def candidate_rank(key):
                s = state['evaluations'][key]['lower-lr']['summary']
                return (s['in_middle'], -abs(s['median'] - 32.5), s['diversity_games'], -s['sd'])
            key = max(KEYS, key=candidate_rank)
            state['candidate'] = {'key': key, 'selection_frozen': True, 'status': 'awaiting_confirmation'}
            state['status'] = 'independent_confirmation'
            study.write(existing, state)
            study.write(BASE / 'candidate-frozen.json', state['candidate'])
            path = BASE / 'runs' / key / 'checkpoints/ppo_131072.zip'
            state['confirmation'] = study.evaluate(path, key, key.split('-')[-1], 'confirmation', 670000, 20, BUDGET)
            s = state['confirmation']['summary']
            adopted = 'intermediate' in s['eligible_tiers'] and s['diversity_pass']
            replay = study.evaluate(path, key, key.split('-')[-1], 'replay', 670000, 1, BUDGET)
            assert replay['episodes'][0] == state['confirmation']['episodes'][0]
            state['candidate'].update(status='adopted' if adopted else 'not_adopted', model=str(path),
                                      model_sha256=study.sha(path), replay='passed')
            if adopted:
                registry = study.read(ROOT / 'outputs/PPO_난이도정책_등록부.json')
                registry['intermediate'] = {**state['candidate'], 'round': 1, 'summary': s,
                                            'engine': str(SOURCE / 'engine'), 'inference': 'deterministic'}
                study.write(ROOT / 'outputs/PPO_난이도정책_등록부.json', registry)
            if adopted:
                state['next_experiment'] = {
                    'hypothesis': 'The selected setting reaches the middle band with new training randomness',
                    'seeds': [49, 50], 'initializations': ['basic', 'imitation'],
                    'new_ppo_budget': 524288, 'per_model': 131072,
                    'comparison_games': [690000, 690019], 'confirmation_games': [700000, 700019],
                    'criteria': 'same middle80% plus diversity and no invalid/censor',
                }
                state['next_plan'] = (
                    '다음 계획은 계층형 새 학습 시드49·50×기본·모방4조건을 선정 설정에서 각131,072스텝, '
                    '총524,288스텝으로 확인하는 것이다. 새 게임690000–690019와700000–700019를 사용하고 '
                    '동일 중급80%·가변성 기준을 유지한다. 새로운 모방 자료 수집·업데이트 비용도 별도 집계한다.')
            else:
                state['next_experiment'] = {
                    'hypothesis': 'Removing reference-teacher mixture may reduce conflicting behavior labels',
                    'seeds': [42, 43], 'architecture': 'hierarchy', 'learning_rate': LEARNING_RATE,
                    'new_ppo_budget': 262144, 'per_model': 131072, 'new_bc_updates': 16000,
                    'new_data': 'middle role only, same observation units and legal-action masks',
                    'controls': 'reuse this round mixed-data imitation and basic models at131072',
                    'comparison_games': [690000, 690019], 'confirmation_games': [700000, 700019],
                    'criteria': 'middle_count improves in both paired seeds; then independent middle80% plus diversity',
                }
                state['next_plan'] = (
                    '다음 가설은 중급 교사만 사용하면 혼합 시연의 상충 행동이 줄어 중급 분포가 안정되는지다. '
                    '계층42·43의 같은 기본 초기 가중치에서 모방자료 역할만 바꾸고, 모방8,000업데이트와 '
                    'LR0.00003의PPO131,072스텝을 각각 수행할 계획이다. 신규 PPO총262,144스텝, 모방총16,000업데이트다. '
                    '이번 혼합시연 모방2모델과 기본2모델을 같은 예산의 대조군으로 재사용한다. '
                    '새 비교690000–690019에서 두 시드의 중급 포함률 개선을 확인하고700000–700019로 '
                    '중급80%·가변성 기준을 검증한다. 보상·행동·gamma는 유지하는 계획이며 아직 실행하지 않았다.')
            state.update(status='complete', finished=datetime.now().astimezone().isoformat())
            study.write(existing, state)
            study.write(BASE / 'result.json', state)
            report(state)
            study.write(ROOT / 'outputs/PPO_회차목록.json', {'latest_round': 1, 'rounds': [{
                'round': 1, 'status': 'complete', 'report': str(REPORT), 'results': str(BASE / 'result.json')}]})
            emit(f'ROUND 001 COMPLETE candidate={state["candidate"]["status"]} report={REPORT}')
        except BaseException:
            state.update(status='failed', error=traceback.format_exc())
            study.write(existing, state)
            report(state)
            emit(state['error'])
            raise


if __name__ == '__main__':
    main()
