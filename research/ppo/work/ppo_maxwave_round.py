"""Round 1: explicit transfer from wave-20 policies to uncapped-wave objective."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime

WORK = Path(__file__).resolve().parent
BASE = WORK / 'ppo-maxwave-r1'
ENGINE = BASE / 'engine'
sys.path.insert(0, str(ENGINE))
from ml.env import AgeClanEnv
from ml.evaluate import evaluate
from ml.experiment import load_config, write_json
from ml.train import train
import numpy as np

OLD = WORK / 'ppo-next/learning'
OUT = WORK.parent / 'outputs'
CONFIG = load_config(ENGINE / 'ml/configs/wave20.json', total_timesteps=32768)
CONFIG['env'].update(target_wave=0, max_ticks=120000)
STATE = {'status': 'running', 'started': datetime.now().isoformat(), 'baseline': {}, 'development': {}, 'confirmation': {}, 'runs': {}}


def save():
    write_json(BASE / 'summary.json', STATE)


def stats(rows):
    x = [r['contiguous_cleared'] for r in rows]
    reached = [r['wave'] for r in rows]
    censored = sum(r['end_reason'] == 'time_limit' for r in rows)
    median = float(np.median(x))
    # Screening criteria only; a candidate requires >=80% in the band and no censoring.
    candidates = []
    for tier, lo, hi in [('beginner', 20, 25), ('intermediate', 30, 35), ('advanced', 40, float('inf'))]:
        if censored == 0 and lo <= median <= hi and sum(lo <= v <= hi for v in x) / len(x) >= .8:
            candidates.append(tier)
    return {'episodes': len(rows), 'mean_cleared': float(np.mean(x)), 'median_cleared': median,
            'min_cleared': min(x), 'max_cleared': max(x), 'max_started_wave': max(reached),
            'p10': float(np.percentile(x, 10)), 'p90': float(np.percentile(x, 90)),
            'castle_destroyed': sum(r['end_reason'] == 'castle_destroyed' for r in rows),
            'censored': censored, 'invalid_actions': sum(r['invalid_actions'] for r in rows),
            'screened_tiers': candidates}


def ev(run, start, n, label):
    result = evaluate(run, n, start, env_config=CONFIG['env'])
    for r in result['episodes']:
        assert r['end_reason'] in ('castle_destroyed', 'time_limit'), r
        assert r['contiguous_cleared'] <= r['wave']
        r['censored'] = r['end_reason'] == 'time_limit'
    result['summary'] = stats(result['episodes'])
    if 'imitation' in label:
        result['summary']['screened_tiers'] = [t for t in result['summary']['screened_tiers'] if t != 'beginner']
    write_json(BASE / f'{label}.json', result)
    print(label, json.dumps(result['summary']), flush=True)
    return result['summary']


def report():
    lines = ['**PPO 최대 웨이브 전환 1차 실험 보고서**', '',
        f"상태: {STATE['status']}. CPU에서 실행. 새 목표는 20웨이브 종료를 해제하고 함락까지 측정하는 것이다.", '',
        '주 지표는 실제 연속 완료 웨이브다. 최고 시작 웨이브도 별도 기록했다. 120,000틱(게임 시간 12,000초) 제한에 도달하면 검열된 하한으로 처리한다.', '',
        '기존 시드 42·43의 기본/모방 초기화 계열 32,768스텝 모델에 각각 32,768스텝을 추가했다. 행동 173개, 관측 148개, defense-v1 보상, PPO 설정과 실제 게임 규칙은 유지했다. 목표 성공 보너스와 목표 이후 시작 제한은 target_wave=0에 따라 비활성화된다.', '',
        '기본 계열은 무작위 가중치에서 출발했지만, 이전 비교 실험에서 두 계열 모두 시연 훈련 자료로 구한 관측 정규화 통계를 사용했다. 따라서 시연 정보가 전혀 없는 비교군은 아니다. 모방 계열은 기존 actor 모방 2,000회와 시연 20에피소드 비용을 포함하며, 이번 회차에 새 시연/모방 학습은 추가하지 않았다.', '',
        '개발 평가: 게임 Python 시드 240000–240004. 최종 확인: 250000–250019. 실제 엔진 uint32 시드는 각 에피소드 JSON에 별도 저장한다. 난이도 후보 기준은 중앙값이 목표 구간에 들고, 평가의 80% 이상이 같은 구간에 있으며, 제한 종료가 없어야 한다. 초급은 기본 초기화 계열만 허용한다.', '',
        '|평가|계열·학습 시드|표본|평균 완료|중앙값|최소~최대 완료|최고 시작|제한 종료|',
        '|---|---|---:|---:|---:|---|---:|---:|']
    for stage in ('baseline', 'development', 'confirmation'):
        for key, s in STATE[stage].items():
            lines.append(f"|{stage}|{key}|{s['episodes']}|{s['mean_cleared']:.2f}|{s['median_cleared']:.1f}|{s['min_cleared']}~{s['max_cleared']}|{s['max_started_wave']}|{s['censored']}|")
    lines += ['', '**학습 후 다음 계획**', ''] + [f'- {k}: {v}' for k,v in STATE.get('next_plan', {}).items()]
    lines += ['', '**로컬 파일과 실제 데이터 흐름**', '',
        f'- 실행·평가·보고 제어: `{Path(__file__).resolve()}`.',
        f'- 사용한 부모 모델·정규화·매니페스트: `{OLD}\\seed-42` 및 `seed-43`의 `control-ppo`, `imitation-ppo`.',
        f'- 새 독립 엔진 사본: `{ENGINE}`. `ml/env.py`가 Node `ml/bridge.mjs`를 JSONL로 호출하고, 브리지가 `lib/game-engine.js`의 게임을 0.1초 단위로 진행한다.',
        '- `ml/train.py`는 명시적 transfer 경로로 엔진·행동·관측 호환성을 검사한 뒤 부모 모델, optimizer, 정규화 통계를 읽고 PPO를 계속한다. `ml/evaluate.py`는 평가 시 정규화 통계를 고정하고 정책의 결정적 행동을 실행한다.',
        f'- 설정: `{ENGINE / "ml/configs/maxwave.json"}`. 새 모델·체크포인트·학습 CSV·평가 JSON·다음 계획: `{BASE}`.',
        '- 이번 소스 변경은 엔진 사본의 평가 기록에 `wave`를 추가한 것이다. 최대 웨이브 종료 방식은 이미 구현된 target_wave=0을 사용한다.',
        f'- 보고서: `{OUT / "PPO_최대웨이브_1차_보고서.md"}`.',
        '', '결과는 현재 두 학습 시드와 고정 게임 시드 표본에 한정된다. 최고 한 에피소드만으로 난이도를 배정하지 않는다.']
    (OUT / 'PPO_최대웨이브_1차_보고서.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')


def main():
    write_json(ENGINE / 'ml/configs/maxwave.json', CONFIG)
    save()
    # Assert that target=0 really allows play past 20, with a finite horizon smoke check.
    with AgeClanEnv(**dict(CONFIG['env'], max_ticks=10)) as env:
        env.reset(seed=240999)
        _, _, term, trunc, info = env.step(0)
        assert trunc and not term and info['end_reason'] == 'time_limit'
    for seed in (42, 43):
        for mode in ('control', 'imitation'):
            key = f'{mode}-{seed}'
            parent = OLD / f'seed-{seed}/{mode}-ppo'
            STATE['baseline'][key] = ev(parent, 240000, 5, f'baseline-{key}')
            save()
    for seed in (42, 43):
        for mode in ('control', 'imitation'):
            key = f'{mode}-{seed}'
            cfg = copy.deepcopy(CONFIG)
            cfg['seed'] = seed
            run = BASE / key
            print('TRAIN', key, '32768 additional steps', flush=True)
            STATE['current_run'] = key
            save()
            manifest = train(cfg, run, verbose=0, checkpoint_freq=16384, masked=True,
                             transfer_from=OLD / f'seed-{seed}/{mode}-ppo')
            assert manifest['added_timesteps'] == 32768 and manifest['actual_timesteps'] == 65536
            STATE['runs'][key] = {'added': manifest['added_timesteps'], 'total': manifest['actual_timesteps'], 'wall_seconds': manifest['wall_seconds']}
            STATE['development'][key] = ev(run, 240000, 5, f'development-{key}')
            s = STATE['development'][key]
            STATE.setdefault('next_plan', {})[key] = (
                '시간 제한을 늘려 함락까지 재측정한다. 현 값은 최대치 하한이다.' if s['censored'] else
                '완료 중앙값 20 미만: build/sell 행동 빈도와 보상 항목을 분석하고, 판매 반복 억제 보상 비교를 다음 회차에 같은 두 초기화로 진행한다.' if s['median_cleared'] < 20 else
                '현재 체크포인트를 보존하고 기본 계열과 같은 65,536 추가 스텝, 시드 42·43, 별도 확인 시드 260000–260019로 30/40웨이브 향상을 비교한다.')
            write_json(BASE / f'next-plan-after-{key}.json', {'development': s, 'next': STATE['next_plan'][key]})
            save()
            report()
    # Selection recorded before opening held-out confirmation games.
    STATE['selected_per_lineage'] = {mode: max((f'{mode}-{s}' for s in (42,43)), key=lambda k: STATE['development'][k]['median_cleared']) for mode in ('control','imitation')}
    write_json(BASE / 'selection-before-confirmation.json', STATE)
    for key in STATE['runs']:
        STATE['confirmation'][key] = ev(BASE / key, 250000, 20, f'confirmation-{key}')
        save()
    STATE['status'] = 'complete'
    STATE['finished'] = datetime.now().isoformat()
    save()
    report()
    print('ROUND COMPLETE', flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:
        STATE.update(status='failed', error=repr(exc))
        save()
        report()
        raise
