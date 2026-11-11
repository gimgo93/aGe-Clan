import hashlib
import json
from pathlib import Path
import shutil
import zipfile

WORK = Path(__file__).resolve().parent
BASE = WORK / 'ppo-maxwave-r1'
OUT = WORK.parent / 'outputs'
summary = json.loads((BASE / 'summary.json').read_text(encoding='utf-8'))
assert summary['status'] == 'complete'
analysis = {}
for key in summary['runs']:
    result = json.loads((BASE / f'confirmation-{key}.json').read_text(encoding='utf-8'))
    manifest = json.loads((BASE / key / 'manifest.json').read_text(encoding='utf-8'))
    actions = manifest['environment']['actions']
    counts, rewards = {}, {}
    for row in result['episodes']:
        for action_id, n in row['action_counts'].items():
            name = actions[int(action_id)]['name']
            counts[name] = counts.get(name, 0) + n
        for name, v in row['reward_totals'].items():
            rewards[name] = rewards.get(name, 0) + v
    assert len(result['episodes']) == 20
    assert manifest['added_timesteps'] == 32768 and manifest['actual_timesteps'] == 65536
    total = sum(counts.values())
    analysis[key] = {'action_count': counts, 'action_fraction': {k:v/total for k,v in counts.items()},
                     'mean_reward_terms': {k:v/20 for k,v in rewards.items()}}
    # Enforce the lineage requirement on candidate labels in all persisted summaries.
for stage in ('baseline','development','confirmation'):
    for key, s in summary[stage].items():
        if key.startswith('imitation'):
            s['screened_tiers'] = [t for t in s['screened_tiers'] if t != 'beginner']
        path = BASE / f'{stage}-{key}.json'
        if path.exists():
            result = json.loads(path.read_text(encoding='utf-8'))
            result['summary'] = s
            path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary['behavior_analysis'] = analysis
next_round = {'status':'planned_not_started', 'hypothesis':'Long-horizon credit assignment: gamma 0.999 vs unchanged 0.99',
              'initialization_lineages':['control','imitation'], 'training_seeds':[42,43],
              'gamma_conditions':[0.99,0.999], 'added_steps_per_run':65536, 'total_added_steps':524288,
              'development_python_seeds':[260000,260009], 'confirmation_python_seeds':[270000,270019],
              'unchanged':['engine','reward','actions','frame_skip','other PPO parameters'],
              'checks':['gamma matches model/rollout_buffer/VecNormalize','resolve censored episodes before tier assignment'],
              'basis':analysis}
(BASE / 'next-round-plan.json').write_text(json.dumps(next_round,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(BASE / 'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(BASE / 'behavior-analysis.json').write_text(json.dumps(analysis,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report = OUT / 'PPO_최대웨이브_1차_보고서.md'
lines = ['','**행동·보상 진단과 난이도 판정**','',
         '완료 웨이브는 엔진에서 해당 웨이브의 모든 적이 해결되어 종료된 것을 뜻한다. 일부 적이 성에 도달한 웨이브도 완료에 포함되며, 누수·성 피해는 원본 에피소드 JSON에 별도 기록한다.']
for key, d in analysis.items():
    s = summary['confirmation'][key]
    lines.append(f"- {key}: 건설 {d['action_count'].get('build',0)}회, 판매 {d['action_count'].get('sellTower',0)}회, 대기 비율 {d['action_fraction'].get('wait',0):.1%}. 에피소드 평균 보상 항목 {json.dumps(d['mean_reward_terms'],ensure_ascii=False)}. 적용 가능한 후보: {s['screened_tiers'] or '없음'}.")
lines += ['', '초급·중급·고급 후보 여부는 계보 조건까지 적용했다. 위 판매·건설 빈도는 전체 에피소드 합계이며, 그것만으로 시간 순서상 반복을 확정하지 않는다. 다음 회차의 판매 억제 비교는 빈도와 실제 행동 순서를 함께 확인한 뒤 적용해야 한다.', '',
    f"검증: 신규 모델 4개 모두 누적 65,536스텝·추가 32,768스텝, 최종 확인 각 20판 완료. 평가 종료 이유는 함락 또는 시간 제한만 허용했다. 엔진·브리지·환경을 포함한 6개 규칙/어댑터 파일은 부모 사본과 SHA256이 같음을 확인했다. 선택된 개발 후보는 {summary['selected_per_lineage']}이며 선택 파일은 최종 확인 전에 저장했다."]
lines += ['', '**다음 회차의 구체적인 비교 계획**', '',
    '아래 계획은 모든 결과와 행동 빈도를 확인해 갱신한 계획이며, 앞서 각 학습 직후 저장한 잠정 계획을 대체한다.',
    '- 우선 가설: gamma=0.99는 장시간 방어의 지연된 보상을 충분히 반영하지 못할 수 있다. 같은 현재 체크포인트에서 gamma 0.99 유지와 0.999 전이를 비교한다. 이번 결과만으로 원인이라고 단정하지 않는다.',
    '- 예산: 기본/모방 × 학습 시드 42·43 × gamma 2조건, 각 65,536 추가 PPO스텝(총 524,288). 나머지 보상·행동·환경·하이퍼파라미터를 유지한다. gamma 변경 시 model과 rollout_buffer, VecNormalize의 gamma가 모두 일치하는지 확인한다.',
    '- 개발 게임 시드 260000–260009, 최종 확인 270000–270019. 모델 선정과 난이도 기준은 이번과 동일하며 두 gamma 조건은 같은 추가 스텝으로 비교한다. 제한 종료가 발생한 모델은 시간 제한을 먼저 늘려 재평가한다.',
    '- 판매 억제 보상은 위 gamma 비교와 구분된 후속 가설로 남긴다. 먼저 시간 순서상의 건설·판매 및 누적 보상을 확인한다. 다음 회차는 계획이며 이번 실행에 포함되지 않았다.']
with report.open('a',encoding='utf-8') as f:
    f.write('\n'.join(lines)+'\n')
package = OUT / 'ppo_maxwave_r1'
package.mkdir(exist_ok=False)
shutil.copytree(BASE, package / 'experiment', ignore=shutil.ignore_patterns('__pycache__'))
for name in ('ppo_maxwave_round.py', 'ppo_maxwave_finalize.py'):
    shutil.copy2(WORK / name, package / name)
shutil.copy2(report, package / report.name)
(package / 'README.md').write_text('독립 엔진, 모델, 정규화, 설정과 에피소드별 평가를 포함합니다. 모델은 experiment/control-42 등의 디렉터리에 있습니다. 부모 모델의 원래 경로는 manifest.json에 기록돼 있습니다. 재평가는 동일 Python 의존성 환경에서 experiment/engine을 PYTHONPATH에 지정한 뒤 python -m ml.evaluate --run-dir 모델디렉터리 --episodes 20 --seed 250000 으로 실행합니다.\n',encoding='utf-8')
files = [p for p in package.rglob('*') if p.is_file()]
inventory = {str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(package / 'sha256.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
archive = OUT / 'PPO_최대웨이브_1차_실험자료.zip'
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,strict_timestamps=False) as z:
    for p in package.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(package))
print(json.dumps({'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'confirmation':summary['confirmation'],'behavior':analysis},ensure_ascii=False,indent=2))
