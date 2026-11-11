"""Record diagnostic conclusions and archive the complete evidence."""
from pathlib import Path
import hashlib,json,shutil,zipfile
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-hierarchy-diagnostic';OUT=ROOT/'outputs'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
state=read(BASE/'summary.json');assert state['status']=='complete'
counts={'development':0,'confirmation':0};differences={}
for stage in counts:
    for key,modes in state[stage].items():
        for mode,s in modes.items():
            r=read(BASE/f'{stage}-{key}-{mode}.json')
            assert len(r['episodes'])==5 and s['invalid_actions']==0
            assert all(row['end_reason'] in ('castle_destroyed','time_limit') for row in r['episodes'])
            counts[stage]+=len(r['episodes'])
for key,modes in state['confirmation'].items():
    selected=state['selected'][key.split('-')[0]]
    differences[key]={'decoder':selected,'flat_mean':modes['flat']['mean_cleared'],
        'hierarchical_mean':modes[selected]['mean_cleared'],
        'difference':modes[selected]['mean_cleared']-modes['flat']['mean_cleared']}
plan={'status':'planned_not_started','purpose':'Train learned hierarchy, distinct from grouped decoding of old flat policies',
    'top_level':['wait','build','upgrade_repair','economy_research','combat','sell'],
    'build_branch':['tower_type','pad'],'block5':'not adopted solely from numeric pad ordering; evaluate geometry-aware zones separately if needed',
    'version':'proposed hierarchical-v1; incompatible with flat-173 policy outputs',
    'training_seeds':[44,45,46],'lineages':['basic','imitation'],'controls':['flat-173','hierarchical-v1'],
    'ppo_steps_per_run':131072,'planned_total_ppo_steps':1572864,
    'reward':'defense-v1 unchanged','gamma':.99,'max_ticks':120000,'target_wave':0,
    'metrics':['contiguous completed waves','started waves','censoring','leaks','first build/kill','action probabilities'],
    'normalization':'Use identical fixed feature scaling derived from engine constants in both lineages for this architecture comparison, rather than fitting the basic lineage on teacher data. Specify constants before training.',
    'imitation':'Same training-only demonstrations and fixed imitation update budget across flat and hierarchy; never use evaluation games as demonstrations. Report demonstration cost separately.',
    'ppo_contract':'Joint selected-path log probability is sum of conditional log probabilities. Ratio, clipping and old log probability refer to the whole path; branch masks must reflect legal children. Entropy definition must account for conditional branches and be preregistered, not copied as a constant per head.',
    'timing':'One full hierarchical choice produces one original engine action and advances exactly one frame_skip; no extra ticks between choices.',
    'development_game_seeds':[310000,310009],'confirmation_game_seeds':[320000,320019],
    'selection':'same preregistered tier criterion; evaluate both initializations on matched games; choose configuration before confirmation',
    'prior_diagnostic':differences}
(BASE/'next-training-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['','**진단 완료 후 판단**','',
    f"개발 {counts['development']}판과 독립 확인 {counts['confirmation']}판, 합계 {sum(counts.values())}판을 완료했다. 무효 행동은 0건이다. 각 조건 5판씩이므로 난이도 확정 근거로 사용하지 않는다."]
for key,d in differences.items():lines.append(f"- {key}: 기존 flat 평균 {d['flat_mean']:.2f} → {d['decoder']} 평균 {d['hierarchical_mean']:.2f} (차이 {d['difference']:+.2f}).")
r=read(BASE/'development-control-42-g099-semantic.json')['episodes'][0]
lines+=['',f"기본 시드 42의 개발 첫 판에서는 묶음 선택 후 {r['first_build_step']}스텝에 첫 타워를 지었지만 완료 {r['contiguous_cleared']}웨이브·처치 {r['kills']}에 머물렀다. 행동 합계는 {r['action_counts']}이다. 확률 분산은 첫 건설 결정에 영향을 줬지만 정체 전체를 설명하지 못한다.",
    '제안한 단계별 행동 구조는 새 학습의 가설로 채택한다. 기존 확률을 단순 합산하는 임시 방식이나 pad 번호 5개씩의 블록을 즉시 게임 기본 동작으로 채택하지 않는다. 조건부 상위·하위 정책을 직접 학습해 기본/모방과 flat 대조군을 함께 비교한다.',
    '차기 설계는 건설 여부→타워 종류→위치다. 타워 종류와 위치도 모델이 선택하며, 고정 스크립트로 유리한 위치를 대신 골라주지 않는다. 숫자상 연속인 5개가 공간적으로도 좋은 구역이라는 증거는 없으므로 필요하면 사거리·경로·인접성을 고려한 구역을 별도 비교한다.',
    f"새 초기화 시드 44·45·46, 기본/모방 × flat/계층 12회, 각 131,072스텝(총 1,572,864스텝)을 예비 계획으로 저장했다. 개발 게임 310000–310009, 최종 확인 320000–320019를 사용한다. 보상과 gamma 0.99는 고정한다. 구현과 손실·마스크·한 행동당 게임 시간·정규화·모방 예산을 확정하고 검증한 다음 학습을 실행한다. 상세 `{BASE / 'next-training-plan.json'}`. 이번 진단에서 새 학습은 수행하지 않았다.",
    f"진단 자료 집계·검증·패키징 파일: `{WORK / 'ppo_hierarchy_package.py'}`. 읽은 원본 모델·엔진 파일은 보고서에 명시한 이전 gamma 비교 폴더에 있으며, 이번 ZIP은 새 진단 결과와 제어 코드를 포함한다."]
report=OUT/'PPO_행동계층화_진단보고서.md'
with report.open('a',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
package=OUT/'ppo_hierarchy_diagnostic';package.mkdir(exist_ok=False)
shutil.copytree(BASE,package/'experiment')
for name in ('ppo_hierarchy_diagnostic.py','ppo_hierarchy_package.py'):shutil.copy2(WORK/name,package/name)
shutil.copy2(report,package/report.name)
inventory={str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest() for p in package.rglob('*') if p.is_file()}
(package/'sha256.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
archive=OUT/'PPO_행동계층화_진단자료.zip'
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED) as z:
    for p in package.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(package))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name,h in inventory.items():assert hashlib.sha256(z.read(name.replace('\\','/'))).hexdigest()==h
verification={'status':'passed','episodes':counts,'invalid_actions':0,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive_bytes':archive.stat().st_size}
(OUT/'PPO_행동계층화_자료검증.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'verification':verification,'differences':differences},ensure_ascii=False,indent=2))
