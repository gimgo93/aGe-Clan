"""Append action-selection diagnostic and refresh verified delivery archive."""
from pathlib import Path
import hashlib,json,shutil,zipfile
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-gamma-r2';OUT=ROOT/'outputs';PACKAGE=OUT/'ppo_gamma_r2'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
results=read(BASE/'sampled-diagnostic-summary.json')
plan=read(BASE/'next-round-plan.json')
plan.update(finding='Deterministic action selection stalls; sampled policy can defend more waves. Construction probability is split among pads.',
    priority_before_entropy='Use separate game seeds 280000-280009 to compare deterministic vs seeded stochastic deployment for both lineages, before spending the new-initialization training budget.',
    diagnostic_results=results,
    next_comparison='After action-selection diagnostic, train fresh 44/45/46 pairs. Compare ent_coef 0.003 vs 0.03 only if it addresses the measured distribution; additionally preregister a hierarchical action-schema study (command then pad) if pad probability splitting persists. Do not silently reinterpret 173-action saved policies.',
    action_selection_plan={'training':'none in the diagnostic','models':'development-selected gamma .99, both lineages and training seeds 42/43',
        'evaluation_python_seeds':[280000,280009],'sampling_replicates':[0,1,2],
        'sampling_seed_formula':'3000000 + replicate*100000 + python_game_seed',
        'criterion':'report median/mean/range, invalid actions and censoring; do not pool repeated game seeds as independent games',
        'next_holdout':[290000,290019]},
    interpretation='Stochastic execution remains below beginner objective and is not a tier assignment. Sampling randomness becomes a separately recorded runtime seed.')
(BASE/'next-round-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['','**追加 진단: 행동 선택 방식과 건설 위치 확률 분산**','',
       '기본 시드 42, gamma 0.99 모델은 개발 게임 시드 260000 첫 상태에서 대기 확률 0.3294, 모든 건설 확률 합계 0.5773이었다. 건설이 여러 위치로 나뉘어 단일 행동 최빈값은 대기가 됐다. 따라서 앞의 “탐색 정체”라는 잠정 진단에는 결정적 실행에서의 행동 선택 병목을 추가해야 한다.',
       '', '|기본 모델|결정적 개발 평균 완료|확률적 진단 평균 완료|확률적 완료 범위|',
       '|---|---:|---:|---|']
for key,s in results.items():
    lines.append(f"|{key}|1.0|{s['mean_cleared']:.2f}|{s['min_cleared']}~{s['max_cleared']}|")
lines+=['','위 평가는 같은 개발 게임 시드 260000–260009에서 별도 정책 샘플링 시드(900000+Python 게임 시드)를 고정한 10판씩이다. 새 학습은 없으며 평가 정규화 통계는 동결했다. 이미 관측한 개발 시드에서 수행한 진단으로서 독립 최종 확인이나 난이도 후보 판정을 대체하지 않는다.',
        '다음 우선순위를 수정한다. 새 학습 시드 44·45·46을 쓰기 전에 기존 두 계열·두 시드·gamma 0.99 모델의 결정적/확률적 실행을 새 개발 게임 280000–280009, 샘플링 반복 3개에서 비교한다. 반복은 같은 게임 시드에 종속돼 있음을 보고한다. 새 학습에는 현재 선택한 gamma 0.99를 사용하고, 탐색 계수 또는 명령 종류→위치로 나누는 행동 구조를 각각 별도 가설로 실험한다. 행동 구조가 바뀌면 기존 173행동 모델을 그대로 새 구조로 읽지 않고 별도 재학습·호환 검사를 수행한다.',
        '즉시 보상은 이번 회차와 추가 진단 모두 defense-v1 그대로다. 건설·대기 자체 점수를 임의로 더하지 않았다. 새 시드 초기화 비교에서는 기본 계열의 시연 없는 관측 통계를 분리해 확인한다.',
        f'추가 진단 제어 파일: `{WORK / "ppo_action_diagnostic.py"}`. 개발 시드와 정책 샘플링 시드, 행동 횟수, 최초 건설·처치, 완료·시작 웨이브는 `{BASE}`의 sampled-diagnostic JSON에 저장했다.',
        f'보고서 보충과 ZIP 갱신: `{WORK / "ppo_gamma_supplement.py"}`. 보고서와 모든 진단 자료를 복사한 뒤 SHA256 목록을 재생성하고 ZIP 전체 CRC·내부 파일 해시를 대조한다.',
        '', '최종 상태: 8회 학습 추가 524,288스텝, 본 최종 확인 160판, 확률적 추가 진단 20판 완료. 다음 회차는 계획 상태이며 이번 실행에서 새 시드 학습은 시작하지 않았다.']
report=OUT/'PPO_할인율비교_2차_보고서.md'
with report.open('a',encoding='utf-8') as f:f.write('\n'.join(lines).replace('追加','추가')+'\n')
shutil.copytree(BASE,PACKAGE/'experiment',dirs_exist_ok=True)
for name in ('ppo_action_diagnostic.py','ppo_gamma_supplement.py'):shutil.copy2(WORK/name,PACKAGE/name)
shutil.copy2(report,PACKAGE/report.name)
inventory={str(p.relative_to(PACKAGE)):hashlib.sha256(p.read_bytes()).hexdigest() for p in PACKAGE.rglob('*') if p.is_file() and p.name!='sha256.json'}
(PACKAGE/'sha256.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
archive=OUT/'PPO_할인율비교_2차_실험자료.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,strict_timestamps=False) as z:
    for p in PACKAGE.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(PACKAGE))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name,h in inventory.items():assert hashlib.sha256(z.read(name.replace('\\','/'))).hexdigest()==h
verification={'status':'passed','files':len(inventory),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
              'archive':str(archive),'bytes':archive.stat().st_size}
(OUT/'PPO_할인율비교_2차_자료검증.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'verification':verification,'sampled_diagnostic':results},ensure_ascii=False,indent=2))
