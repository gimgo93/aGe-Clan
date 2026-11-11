import json
from pathlib import Path


WORK = Path(__file__).resolve().parent
DATA = WORK / 'ppo-next'
OUT = WORK.parent / 'outputs'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    summary = read(DATA / 'learning/summary.json')
    npu = read(DATA / 'npu-benchmark/results.json')
    verify = read(DATA / 'verification.json')
    hardware = read(DATA / 'hardware.json')
    assert verify['status'] == 'passed'
    cpu_us = npu['torch_cpu_latency']['median_us']
    npu_us = npu['NPU']['latency']['median_us']
    cpu_seconds = sum(row['wall_seconds'] for row in npu['NPU']['torch_cpu_episodes'])
    npu_seconds = sum(row['wall_seconds'] for row in npu['NPU']['device_episodes'])
    mask_share = sum(row['mask_seconds'] for row in npu['NPU']['torch_cpu_episodes']) / cpu_seconds
    game_share = sum(row['game_seconds'] for row in npu['NPU']['torch_cpu_episodes']) / cpu_seconds
    action_share = sum(row['action_seconds'] for row in npu['NPU']['torch_cpu_episodes']) / cpu_seconds
    rows = []
    for seed in (42, 43):
        for mode, label in [('control', '기본 초기화 + PPO'), ('imitation', '모방 초기화 + PPO')]:
            row = summary['confirmation'][f'seed-{seed}-{mode}']
            rows.append(f'| {seed} | {label} | {row["mean_contiguous_cleared"]:.2f} | {row["target_successes"]}/20 | '
                        f'{row["mean_leaks"]:.2f} | {row["mean_hp"]:.2f} | {100 * row["invalid_action_rate"]:.2f}% |')
        row = summary['confirmation'][f'seed-{seed}-imitation-initial']
        rows.append(f'| {seed} | 모방 초기화 직후 | {row["mean_contiguous_cleared"]:.2f} | {row["target_successes"]}/20 | '
                    f'{row["mean_leaks"]:.2f} | {row["mean_hp"]:.2f} | {100 * row["invalid_action_rate"]:.2f}% |')
    for key, label in [('previous-model', '이전 16,384스텝 PPO'), ('scripted', '규칙 봇')]:
        row = summary['confirmation'][key]
        rows.append(f'| — | {label} | {row["mean_contiguous_cleared"]:.2f} | {row["target_successes"]}/20 | '
                    f'{row["mean_leaks"]:.2f} | {row["mean_hp"]:.2f} | {100 * row["invalid_action_rate"]:.2f}% |')
    dev_rows = []
    accuracy_rows = []
    training_rows = []
    build_rows = []
    for seed in (42, 43):
        for mode, label in [('control', '기본 초기화'), ('imitation', '모방 초기화')]:
            initial = read(DATA / f'learning/development-seed-{seed}-{mode}-initial.json')['summary']
            trained = summary['development'][f'seed-{seed}-{mode}']
            dev_rows.append(f'| {seed} | {label} | {initial["mean_contiguous_cleared"]:.2f} / {initial["target_successes"]}승 | '
                            f'{trained["mean_contiguous_cleared"]:.2f} / {trained["target_successes"]}승 |')
            init_manifest = read(DATA / f'learning/seed-{seed}/{mode}-initial/manifest.json')
            score = init_manifest['imitation_accuracy']['validation']
            accuracy_rows.append(f'| {seed} | {label} | {score["accuracy"] * 100:.3f}% | '
                                 f'{score["nonwait_accuracy"] * 100:.3f}% | {init_manifest["wall_seconds"]:.2f}초 |')
            train_manifest = read(DATA / f'learning/seed-{seed}/{mode}-ppo/manifest.json')
            training_rows.append(f'| {seed} | {label} | 32,768 | {train_manifest["wall_seconds"]:.2f}초 |')
            evaluation = read(DATA / f'learning/confirmation-seed-{seed}-{mode}-ppo.json')
            actions = train_manifest['environment']['actions']
            totals = {'build': 0, 'sellTower': 0, 'wait': 0}
            for episode in evaluation['episodes']:
                for key, count in episode['action_counts'].items():
                    name = actions[int(key)]['name']
                    if name in totals:
                        totals[name] += count
            steps = sum(episode['steps'] for episode in evaluation['episodes'])
            build_rows.append(f'| {seed} | {label} | {totals["build"]} | {totals["sellTower"]} | '
                              f'{totals["wait"] / steps * 100:.2f}% |')
    winner = '모방 초기화 + PPO' if summary['selected_candidate'] == 'imitation' else '기본 초기화 + PPO'
    initial42 = summary['confirmation']['seed-42-imitation-initial']['target_successes']
    trained42 = summary['confirmation']['seed-42-imitation']['target_successes']
    initial43 = summary['confirmation']['seed-43-imitation-initial']['target_successes']
    trained43 = summary['confirmation']['seed-43-imitation']['target_successes']
    train_data = read(DATA / 'learning/teacher-training.json')
    valid_data = read(DATA / 'learning/teacher-validation.json')
    initial_diag = read(DATA / 'learning/diagnostic-initial-weights.json')['summary']
    previous_diag = read(DATA / 'learning/diagnostic-previous-model.json')['summary']
    text = f'''**NPU 판단 및 PPO 후속 실험 보고서 · 2026-11-08**

현재 정책망의 batch 1 추론은 CPU를 채택했다. NPU에서 실제 추론을 실행했으나 같은 작은 정책망에서 지연이 더 컸다. 이어 현재 엔진에서 규칙 봇 행동 모방을 통한 정책 초기화와 기본 초기화를 두 학습 seed에서 비교하고, 각 후보에 같은 32,768스텝의 PPO 학습을 적용했다. 개발 평가에서 선택된 후보는 **{winner}**이다.

**최종 새 검증 결과**

모든 행에 현재 로컬 엔진, 같은 20웨이브 목표·defense-v1 보상, 검증 Python 시드 230000–230019를 적용했다. PPO의 총 추가 상호작용은 131,072스텝이다.

| 학습 seed | 정책 | 평균 연속 완료 웨이브 | 20웨이브 성공 | 평균 누수 | 최종 평균 HP | 실행 거절률 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

평가의 결정론적 행동은 학습된 가중치와 실제 엔진 마스크로 선택했다. 모방 후보의 평가 과정에서 규칙 봇이 행동을 대신 선택하는 개입은 없다. 규칙 봇 자료가 초기 가중치 학습에 사용됐다는 점은 학습 방법의 일부다.

최종 같은 20시드에서 모방 초기화 직후와 PPO 후의 성공은 seed 42가 {initial42}/20→{trained42}/20, seed 43이 {initial43}/20→{trained43}/20이었다. 큰 초기 개선은 시연을 통한 초기화에서 나왔고, 후속 PPO 효과는 학습 seed에 따라 달랐다. seed 43의 20/20 결과는 이번 20판의 관측이며, 다른 seed나 설정에서의 성공을 보장하지 않는다. 추가 평가와 학습 안정성 검증을 다음 우선순위로 둔다.

**NPU 측정과 채택 판단**

장치는 Intel Core Ultra 5 228V와 Intel AI Boost이며, NPU 드라이버는 {hardware['NPUDriver']['DriverVersion']}이다. Windows 장치 상태는 OK였다. OpenVINO {npu['openvino']}에서 CPU·GPU·NPU를 인식했다.

| 측정 | PyTorch CPU | OpenVINO NPU |
| --- | ---: | ---: |
| batch 1 행동 추론 지연 | {cpu_us:.2f}µs | {npu_us:.2f}µs |
| 동일한 실제 5에피소드 합계 | {cpu_seconds:.3f}초 | {npu_seconds:.3f}초 |
| CPU 대비 에피소드 처리 시간 | 1.00배 | {npu_seconds / cpu_seconds:.2f}배 |
| 같은 입력 256개의 행동 일치율 | 기준 | {npu['NPU']['action_agreement'] * 100:.1f}% |

입력은 정규화한 관측 148개, 출력은 행동 로짓 173개다. 각 400회 측정한 5라운드 평균의 중앙값을 추론 지연으로 기록했다. 마스크 적용·argmax를 포함하고 정규화와 게임 실행은 이 지연 측정에서 제외했다. 실제 에피소드 비교에는 정규화·마스크 요청·게임 실행을 포함했고 CPU와 장치 실행 순서를 번갈아 적용했다. NPU는 명시적으로 `compile_model(..., 'NPU')`로 지정했다.

NPU 모델 컴파일은 {npu['NPU']['compile_seconds']:.3f}초, 첫 추론은 {npu['NPU']['first_inference_seconds'] * 1000:.2f}ms였다. 정상 상태의 NPU 추론은 CPU보다 약 {npu_us / cpu_us:.1f}배 느렸고 전체 에피소드 처리 시간도 약 {(npu_seconds / cpu_seconds - 1) * 100:.1f}% 늘었다. 5에피소드의 완료수·처치·누수·피해·종료 이유·행동 수는 CPU와 같았다. NPU 로짓의 최대 절대 오차는 {npu['NPU']['max_abs_logit_error']:.6f}였다.

같은 CPU 에피소드의 시간 분해에서 마스크 요청·판정·통신이 약 {mask_share * 100:.1f}%, 게임 진행 요청·계산·통신이 {game_share * 100:.1f}%, 관측 정규화와 행동 계산이 {action_share * 100:.1f}%였다. 작은 정책망의 행렬 계산을 가속해도 전체 처리에서 얻을 수 있는 이득은 제한된다. Python과 Node 사이 통신 시간은 각 요청 구간에 포함된다.

사전 채택 기준은 행동 일치율 99% 이상과 에피소드 처리 10% 이상 가속이었다. 속도 조건을 충족하지 못해 후속 학습과 검증은 기존 CPU 경로로 실행했다. 전력과 배터리 소비는 미측정이다. 측정에는 앞서 저장한 약한 정책 하나를 사용했으며, 같은 구조의 작은 망·순차 batch 1 요청에 대한 판단이다. 큰 모델·대량 배치의 NPU 성능으로 일반화하지 않는다.

OpenVINO는 Intel NPU 추론 경로를 제공한다. Stable-Baselines3는 CNN을 사용하지 않는 PPO에서 CPU 실행을 안내한다. 이번 판단에는 실제 장치 측정을 함께 사용했다. [Intel NPU 문서](https://docs.openvino.ai/2026/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.html) · [Stable-Baselines3 PPO 문서](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html)

**학습 계획과 자료 분리**

사전 계획은 `PPO_후속실험_사전계획_2026-11-07.md`에 기록했다. 학습 자료는 규칙 봇 시드 210000–210019의 {train_data['samples']:,}개 상태·마스크·행동이며, 20판 모두 성공했다. 별도 모방 검증 자료는 211000–211004의 {valid_data['samples']:,}개 표본이다. 모방 검증 자료는 정규화 통계와 gradient 갱신에 포함하지 않았다.

두 후보는 학습 seed별로 같은 초기 가중치에서 시작했고 초기 파라미터 SHA-256의 일치를 확인했다. 관측 정규화는 학습용 시연 자료로 계산한 동일 파일을 사용했다. PPO 중에는 두 후보 모두 기존 구현에 따라 각자 수집한 학습 관측으로 정규화 통계를 갱신했다.

모방 후보는 actor 망만 Adam LR .001, batch 256, 2,000회로 초기화했다. 대기·비대기 표본을 50%씩 샘플링했다. critic 가중치와 PPO optimizer의 초기 상태를 보존했는지 검사했다. 두 후보의 PPO 상호작용 예산은 같지만 모방 후보에는 시연 자료와 추가 gradient 연산이 있다.

| 학습 seed | 초기화 | 별도 시연 자료 행동 일치율 | 비대기 행동 일치율 | 초기화·검사·저장 시간 |
| --- | --- | ---: | ---: | ---: |
{chr(10).join(accuracy_rows)}

**개발 평가와 PPO 기여**

개발 시드 220000–220009에서 초기화 직후와 PPO 학습 후를 모두 평가했다. 표의 성공 수 분모는 각각 10이다.

| 학습 seed | 초기화 | 초기화 직후 평균 웨이브 / 성공 | PPO 후 평균 웨이브 / 성공 |
| --- | --- | --- | --- |
{chr(10).join(dev_rows)}

모방 초기화 시점의 성능과 PPO 후의 성능을 따로 기록했다. 최종 성능 향상을 모두 PPO gradient의 효과로 해석하지 않는다. 후보 선택에는 두 학습 seed의 개발 성공 합계, 평균 완료수 합계, 적은 누수 순서만 사용했다. `selection-before-confirmation.json`은 최종 새 검증 실행 전에 기록됐다.

개발 단계에서 seed 42의 성공이 모방 초기화 직후 10/10에서 PPO 후 9/10으로 줄어, 22시 40분에 최종 검증 전 진단 계획을 보완했다. 이후 모방 초기화 직후 두 정책도 같은 최종 시드에서 각각 20판 평가했다. 초기화 정책의 최종 검증은 추가 진단 40에피소드이며, 기존 네 후보의 학습량·하이퍼파라미터와 개발 기준 후보 선택은 그대로 수행했다.

이전 16,384스텝 모델의 관측 정규화를 고정한 초기 가중치 대조는 개발에서 평균 {initial_diag['mean_contiguous_cleared']:.1f}웨이브였고, 저장 가중치는 {previous_diag['mean_contiguous_cleared']:.1f}웨이브였다. 이는 이전 학습에서 작은 진척은 있었지만 방어 전략 확보에는 부족했다는 진단이다.

| 학습 seed | 초기화 | 추가 PPO 스텝 | PPO 학습·저장 시간 |
| --- | --- | ---: | ---: |
{chr(10).join(training_rows)}

기록된 PPO 벽시계 시간 합계는 {verify['ppo_wall_seconds']:.2f}초다. 시연 수집·모방 초기화·평가·설치 시간은 별도다. seed 43의 모방 PPO에서는 4,096→4,352스텝 사이에 4,544초의 긴 벽시계 공백이 기록됐으며 원인은 확인하지 못했다. 따라서 이 실행의 경과 시간을 활성 CPU 계산 시간이나 지속 처리 속도로 해석하지 않는다. 해당 실행은 이후 32,768스텝까지 완료됐고 저장 모델을 재로딩해 검증했다. 각 실행은 PyTorch CPU 1스레드를 사용했으며 게임 엔진은 Node 자식 프로세스에서 실행했다.

**건설·판매와 검증 범위**

최종 새 검증 20판의 행동 누계다. 대기는 전략적으로 필요한 행동이므로 비율만으로 성능을 판정하지 않는다.

| 학습 seed | 초기화 | 건설 횟수 | 판매 횟수 | 대기 비율 |
| --- | --- | ---: | ---: | ---: |
{chr(10).join(build_rows)}

자료의 모든 teacher 행동이 실제 마스크에서 합법적인지 확인했다. 저장한 4개 PPO 모델을 실제로 다시 로드해 스텝·gamma·rollout gamma·망 설정·optimizer LR을 검사했다. 두 초기화 후보의 동일한 초기 가중치·관측 정규화와 actor만 변경됐다는 점을 검사했고, 모델의 환경 지문도 검사했다. 에피소드별 보상 항목 합계와 20웨이브 성공의 HP·완료 조건을 확인했다. 검증 상태는 `{verify['status']}`이다.

시연 수집과 개발·최종 평가를 포함해 {verify['recorded_episodes_including_demonstrations']}에피소드를 기록했다. 이 수에는 별도의 NPU 성능 측정과 자료 폴더의 재평가 연결 확인을 포함하지 않았다. 현재 결과는 솔로 20웨이브와 고정한 현재 엔진의 범위다. 문명·전략 다양성, 30웨이브 이상, PvP, 다른 밸런스 설정은 별도 검증이 필요하다.

**다음 계획**

| 우선순위 | 다음 실험 | 완료 기준 |
| --- | --- | --- |
| 1 | 모방 초기화와 PPO 후 모델을 보존하고, 개발에서 정한 체크포인트를 추가 100개 새 시드에서 비교 | 성공률·누수·함락 시점과 신뢰구간 기록 |
| 2 | PPO 후 성능 저하를 줄이기 위해 학습 중 시연 행동을 유지하는 보조 손실을 한 요소로 비교 | 같은 PPO 예산·학습 seed에서 초기화 성능 유지 또는 개선 |
| 3 | 선택 정책의 마스크 요청·Python–Node 통신 시간을 별도 프로파일링 | 행동·RNG·결과 일치를 유지하며 실제 처리 시간 비교 |

후속 실험은 이번 기록을 기준선으로 삼고, 실행 전에 예산과 새 시드를 고정한다.

**자료 위치**

`PPO_후속실험자료_2026-11-08.zip`에 현재 엔진, 학습 코드, NPU 변환 모델, 모든 후보 모델·정규화·체크포인트·시연 자료·개발 및 최종 평가·검증 기록을 저장했다. `ppo_next_execution/재평가.ps1`로 선택한 후보를 새 시드에서 재평가할 수 있다. 장치 정보는 `hardware.json`, 성능 측정은 `npu-benchmark/results.json`, 학습 집계는 `learning/summary.json`, 전체 검증은 `verification.json`에 있다.
'''
    (OUT / 'PPO_NPU_후속실험_보고서_2026-11-08.md').write_text(text, encoding='utf-8')
    print('Saved report.')


if __name__ == '__main__':
    main()
