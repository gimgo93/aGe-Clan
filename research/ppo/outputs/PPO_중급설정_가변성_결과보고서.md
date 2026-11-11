**중급 PPO 설정·행동 가변성 결과**

판정: 채택 보류: 사전 성능·가변성 기준을 모두 충족하지 않음. 운영 게임 배포는 하지 않았다.

선정 후보: `flat-47-bc4000-lr3e-05-ppo16384`, 학습 시드47, flat 구조, 확장 시연 모방4,000회 체크포인트에서 PPO16,384스텝. 시드 번호 자체가 난이도를 결정하지 않으며 이 저장 가중치·입력 단위·행동 선택 설정을 함께 고정한다.
시드47을 유지한 이유: 기존47·48 체크포인트의 개발 비교에서47계열이 목표 구간에 더 가까웠고, 중간 모방 부모를 고정해 학습률과 PPO 예산의 영향을 살펴보기 위해서다. 같은 단계 안에서 부모와 난수 계보를 유지했고, 시드 번호를 바꾸어 목표 웨이브를 맞추지는 않았다.
독립 확인 20판: 평균32.05, 중앙값32.5, 실제 연속 완료19–42웨이브. 30–35구간 3/20판. 제한 종료0·무효 행동0. 35웨이브에서 강제 종료하지 않고 함락까지 측정했다.
행동 가변성: 종류5개·상위3범주·건설2종 기준 20/20판, 대기 외 최빈 행동80% 이하 20/20판, 서로 다른 행동·결정시각 시퀀스 20종. 대기 외 명령 종류 범위[7, 9]. 평균 대기 비중95.0%.
공통 유효 행동 마스크를 적용한 서로 다른 자연 관측 비교 80회 중8회에서 선택이 달라졌다. 역순 쌍의 중복을 포함하는 보조 비교이며 독립 표본의 통계 검정이나 전술 품질 보장은 아니다. 같은 상태·같은 마스크에서는 결정적 선택이고, 게임이 달라지면 관측에 따라 행동이 바뀐다.
전체 확인 게임의 행동 수: {'build': 770, 'upgradeTower': 196, 'upgradeCastle': 213, 'wait': 40219, 'hireWoodcutter': 105, 'hire': 187, 'buildLab': 20, 'researchPotion': 35, 'potion': 463, 'repairCastle': 152}. 타워 건설: {'archer': 420, 'ballista': 314, 'cannon': 33, 'frost': 3}.

선정 과정: 기존 확장 시연 PPO 중간 체크포인트를 별도 개발5판으로 비교하고 한 개를 먼저 동결한 뒤 확인20판을 실행했다. 확인 결과를 보고 다른 기존 모델을 같은 확인 게임으로 재선정하지 않았다.
기존 후보가 조건을 충족하지 못해, 시드47의 중간 성능 BC4,000 부모에서 LR0.00003/0.0001을 짝지어 각각16,384스텝 추가했다. 4,096 간격8체크포인트를 새 개발480000–480004에서 선택하고 새 확인490000–490019를 썼다.
이 단계 확인 평균32.05·중앙값32.5·범위19–42·구간3/20판이었다.
분산이 줄지 않아 시드47의 강한 계층형 PPO131,072스텝 부모에서 AI 성 투자 한도6/8/10/12를 개발520000–520004로 비교했다. 선택한 한도6에서 LR0.00003으로16,384스텝 추가하고, 개발540000–540004에서 체크포인트를 선택한 뒤 확인550000–550019로 검증했다. 이 조건 선정 모델의 총 PPO 스텝은139,264, 추가분은8,192이다. 확인 평균42.95·중앙값43.0·범위40–46·구간0/20판이었다.
한도 도달 후 AI의 upgradeCastle만 마스킹하는 명시적 행동 변경이다. 엔진의 성 최고20레벨 규칙·인간 플레이·웨이브 진행은 바꾸지 않았다. 도달 가능한 문명/체력/공격력 증가를 제한하므로 전체 행동을 허용한 모델과 같은 조건의 비교라고 주장하지 않는다. 이 조건의 기본/모방 짝 비교는 아직 없다.
모든 단계에서 기준을 통과한 후보만 채택 대상으로 삼았다. 검토용 묶음에 담을 대표 후보의 순위도 각 단계의 개발 구간 포함률→중앙값32.5근접도→가변성 수로 정했으며, 확인 결과를 이용해 통과 기준을 조정하지 않았다.
문서의460000·490000·550000 등의 범위는 Python 평가용 시드다. 실제 엔진에는 Gym RNG가 변환한 uint32가 들어간다. 대표 후보 확인 첫 판 Python490000 → 엔진4068128414이며, 전20판 대응은 confirmation-evidence.json에 기록했다. 학습 시드47은 초기 가중치·학습 난수 계보이고 평가 게임 시드와 다르다.

|독립 확인 단계|평균|중앙값|범위|목표 구간|가변성|
|---|---:|---:|---|---:|---|
|기존 PPO 체크포인트|38.10|38.5|23–44|4/20|False|
|중간 모방 부모+짧은 PPO|32.05|32.5|19–42|3/20|True|
|성 투자 한도+PPO|42.95|43.0|40–46|0/20|False|
대표 체크포인트의 수집 상호작용은16,384스텝이고, 최적화에 사용된 rollout은63개/16,128스텝이다. 저장 callback이 마지막 rollout의 경사 업데이트 전에 실행되므로 마지막256스텝은 이 체크포인트 가중치에 아직 반영되지 않았다. 모방 업데이트와 PPO 경사 epoch252회도 서로 다른 단위다.

|개발 후보|평균|중앙값|30–35 판수|가변성|
|---|---:|---:|---:|---|
|flat-47-ppo65536|42.00|42.0|0/5|True|
|flat-47-ppo32768|41.40|42.0|1/5|True|
|flat-47-ppo98304|38.40|42.0|2/5|True|
|flat-47-ppo131072|42.40|42.0|0/5|True|
|hierarchy-47-ppo65536|35.60|36.0|2/5|False|
|hierarchy-47-ppo32768|41.00|38.0|0/5|True|
|hierarchy-47-ppo98304|37.40|39.0|1/5|False|
|hierarchy-47-ppo131072|46.20|46.0|0/5|True|
|flat-48-ppo32768|30.80|28.0|0/5|True|
|flat-48-ppo65536|41.20|42.0|0/5|True|
|flat-48-ppo98304|39.40|41.0|0/5|True|
|flat-48-ppo131072|39.60|39.0|0/5|True|
|hierarchy-48-ppo32768|22.00|23.0|0/5|False|
|hierarchy-48-ppo98304|27.40|27.0|0/5|False|
|hierarchy-48-ppo65536|39.00|44.0|0/5|False|
|flat-47-bc4000-lr3e-05-ppo8192|32.00|30.0|2/5|True|
|flat-47-bc4000-lr3e-05-ppo4096|33.40|31.0|2/5|True|
|flat-47-bc4000-lr3e-05-ppo12288|29.40|26.0|0/5|True|
|flat-47-bc4000-lr3e-05-ppo16384|32.20|34.0|3/5|True|
|flat-47-bc4000-lr0.0001-ppo4096|32.80|35.0|1/5|True|
|flat-47-bc4000-lr0.0001-ppo8192|44.40|43.0|0/5|True|
|flat-47-bc4000-lr0.0001-ppo12288|44.00|43.0|0/5|True|
|flat-47-bc4000-lr0.0001-ppo16384|32.80|31.0|1/5|True|
|hierarchy-47-budget6-parent|39.80|42.0|0/5|False|
|hierarchy-47-budget8-parent|42.60|43.0|0/5|False|
|hierarchy-47-budget10-parent|43.60|44.0|0/5|False|
|hierarchy-47-budget12-parent|45.80|47.0|0/5|False|
|hierarchy-47-budget6-ppo139264|42.80|43.0|0/5|False|
|hierarchy-47-budget6-ppo135168|43.40|44.0|0/5|False|
|hierarchy-47-budget6-ppo143360|42.60|43.0|0/5|False|
|hierarchy-47-budget6-ppo147456|43.40|44.0|0/5|False|

보상·행동 변경: 즉시 보상 defense-v1을 유지했다. 처치당+0.01, 실제 웨이브 종료 시 처치 비율0–1, 체력 피해당−0.02, 무효 행동−0.05, 함락−10이며 이번 목표 종료 보너스는 비활성이다. gamma0.99는 미래 보상의 할인율로 보상 항목 자체와 다르다. 173개 행동 ID 및148개 입력의 고정 단위를 유지했고, 투자 한도 실험만 위에 명시한 추가 마스크를 적용한다. 중급을 맞추기 위한 강제 패배·웨이브 상한·유리한 게임 시드 선별은 사용하지 않았다.
빠른 마스크는 별도 평가 엔진 사본에만 적용했다. 1,517실제·경계 상태에서262,441개 판정과 원래 구현이 일치했고, 동일 게임 한 판2,953스텝의 관측·마스크·보상·전이·함락 결과가 일치했다. 실행 중인 기본/모방 대조 실험의 엔진과 원본 모델은 수정하지 않았다.

**파일 및 실제 상호 작용**

- 후보 동결·평가: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_intermediate_select.py`가 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\runs`의 PPO ZIP을 읽고 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\candidates`에 동결했다. `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\engine\ml\fixed_env.py` → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\engine\ml\env.py` → Node `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\engine\ml\bridge.mjs` → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\engine\lib\game-engine.js` 호출로 게임을 실행하고 개발·확인 JSON에 결과를 저장했다.
- 추가 학습 제어: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_intermediate_fallback.py`. 실행한 경우 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\moderate-parent-ppo`의 계획·훈련CSV·체크포인트·독립 평가로 저장했다.
- 투자 한도 제어: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_intermediate_capacity.py` → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\engine\ml\capacity_env.py`가 성 강화 마스크를 추가하고 실제 성 레벨이 한도를 넘지 않는지 평가 매 스텝 검사했다. 결과는 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-intermediate-v1\investment-budget`와 `capacity-*.json`에 저장한다.
- 결과 정리: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_intermediate_report.py`가 선택된 ZIP을 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\outputs\ppo_intermediate_policy\model.zip`로 복사하고 `config.json`·`action-table.json`·`feature-scaling.json`·검증 자료·엔진·SHA256을 묶었다. `replay.py`는 이 묶음만 읽어 독립 확인 첫 판을 재생했고 행동 시퀀스와 최종 성과가 일치했다.
- 로컬 난이도 등록: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\outputs\PPO_난이도정책_등록부.json`. 두 기준을 통과할 때만 intermediate 항목에 정책을 등록한다. 기본/모방 장기 비교는 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2`에서 별도 진행한다.
- 최종 묶음 검증: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_intermediate_verify_bundle.py`가 입력 단위·행동 표·설정 기반 추론을 검사하는 replay.py를 동기화하고 동일 확인 게임을 다시 재생했다. `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\outputs\ppo_intermediate_policy\replay-verification.json`에 기록했으며24개 파일의 SHA256과 행동 시퀀스·함락 결과가 모두 일치했다.

다음 계획: 중급으로 확정하지 않는다. 이번 분포와 시연 추종 오차를 분석한 뒤, 중간 수준의 다종 타워 교사 시연을 두 구조에 동일하게 제공하는 별도 실험을 설계한다. 새 학습 시드49·50, 각65,536PPO스텝, 기본/모방 짝 비교, 개발500000–500009·확인510000–510019를 사용하며 같은 성능·가변성 기준을 유지한다. 이 후속 실험은 아직 실행하지 않았다.
