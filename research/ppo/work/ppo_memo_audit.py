"""Read-only accounting of complete PPO episodes and corrected experiment memo."""
from pathlib import Path
from collections import Counter
import csv,json,hashlib
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구');OUT=ROOT/'outputs';WORK=ROOT/'work'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,value):p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def record(run):
    manifest=read(run/'manifest.json');budget=int(manifest['actual_timesteps']);source=run/'episodes.monitor.csv'
    with source.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(line for line in f if not line.startswith('#')))
    lengths=[int(float(row['l'])) for row in rows];cumulative=[];total=0
    for value in lengths:assert value>0;total+=value;cumulative.append(total)
    assert total<=budget;prefix={str(b):sum(end<=b for end in cumulative) for b in (65536,131072,262144) if b<=budget}
    prefix_partial={str(b):b-max([end for end in cumulative if end<=b],default=0) for b in (65536,131072,262144) if b<=budget}
    return {'key':run.name,'seed':manifest['seed'],'architecture':manifest['architecture'],'initialization':manifest['initialization'],
        'ppo_interactions':budget,'completed_games':len(rows),'completed_game_steps':total,'unfinished_game_steps':budget-total,
        'cumulative_completed_games_by_step':prefix,'unfinished_steps_at_each_budget':prefix_partial,'average_completed_game_steps':total/len(rows),'monitor_path':str(source),
        'monitor_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'end_reasons':dict(Counter(row.get('end_reason','not_recorded') for row in rows))}
def summarize(rows):return {'models':len(rows),'ppo_interactions':sum(r['ppo_interactions'] for r in rows),'completed_games':sum(r['completed_games'] for r in rows),
    'completed_game_steps':sum(r['completed_game_steps'] for r in rows),'unfinished_game_steps':sum(r['unfinished_game_steps'] for r in rows),
    'unfinished_game_fragments':sum(r['unfinished_game_steps']>0 for r in rows)}
def main():
    studies={name:[record(p) for p in sorted((WORK/name/'runs').iterdir()) if p.is_dir() and (p/'manifest.json').exists() and (p/'episodes.monitor.csv').exists()]
        for name in ('ppo-hierarchy-v1','ppo-expanded-demo-v2','ppo-step-budget-v1')}
    latest=studies['ppo-step-budget-v1'];assert len(latest)==10
    summaries={name:summarize(rows) for name,rows in studies.items()};primary=summarize([r for r in latest if r['seed'] in (42,43)]);general=summarize([r for r in latest if r['seed'] in (49,50)])
    newest=read(OUT/'PPO_학습스텝증가_정책판정.json');previous=read(OUT/'PPO_중급설정_결과.json');chosen=next(r for r in latest if r['key']==newest['key'])
    result={'scope':'Recent step-budget study headline; two older fresh-run batches are separate appendix, not all historical training.',
        'latest':summaries['ppo-step-budget-v1'],'latest_primary':primary,'latest_generalization':general,'per_study':summaries,'records':studies,
        'current_middle_candidate':newest,'current_middle_candidate_completed_games':chosen['cumulative_completed_games_by_step'][str(newest['budget'])],
        'current_middle_candidate_partial_steps':chosen['unfinished_steps_at_each_budget'][str(newest['budget'])],
        'previous_middle_candidate':{'key':previous['selected']['key'],'summary':previous['summary'],'status':previous['status']}}
    assert result['latest']['completed_games']==6067 and result['latest']['ppo_interactions']==2621440
    write(OUT/'PPO_학습판수_확인.json',result)
    lines=['**PPO 실제 학습 판수 확인**','',
        '학습을 새로 실행하지 않고 manifest.json의 실제 상호작용 수와 episodes.monitor.csv의 완료 에피소드 길이를 대조했다. 훈련 로그만 집계했으며 교사 시연·모방 업데이트·개발/최종 평가·폐기된 검증 모델은 포함하지 않는다.','',
        f"최근 스텝 증가 실험: {result['latest']['ppo_interactions']:,}스텝,완료 학습 게임{result['latest']['completed_games']:,}판. 본 비교{primary['completed_games']:,}판,새49/50 일반화{general['completed_games']:,}판이다. 완료판에 쓰인{result['latest']['completed_game_steps']:,}스텝과예산종료당시진행중이던10개조각{result['latest']['unfinished_game_steps']:,}스텝의합이전체예산과일치한다. 진행중조각을완료10판으로세지않았다.",'',
        '|조건|65,536까지 완료판|131,072까지 완료판|262,144까지 완료판|끝의 미완료 스텝|','|---|---:|---:|---:|---:|']
    for r in latest:lines.append(f"|{r['key']}|{r['cumulative_completed_games_by_step']['65536']}|{r['cumulative_completed_games_by_step']['131072']}|{r['completed_games']}|{r['unfinished_game_steps']}|")
    lines+=['','각 열은 동일 연속 학습의 누적값이므로 세 열을 더하면 중복 집계다. 같은262,144스텝이어도 빨리 함락되는 모델은더많은판을끝내고오래생존하는모델은더적은판을끝낸다. 판수 자체를 실력이나 학습 효율로 보지 않는다.',
        '현재설정은PPO1스텝=완성된게임행동1번+최대0.1초틱10회다. 대기도1스텝이며정상진행시게임시간약1초다. 함락이중간틱에발생하면그전까지만진행한다. 계층형의상위선택→타워→위치선택은추가PPO스텝이아니며마지막명령하나를실행해1스텝을센다. 한판은초기상태부터함락또는제한종료까지인에피소드이며웨이브1개와다르다.',
        '모방학습8,000업데이트는8,000판이아니다. 한업데이트는여러시연상태로배우를최적화하는것이다. 최근시연원자료는훈련새60판+참고36판,검증새20판+참고12판이며PPO완료6,067판과별도다.','',
        '**현재 중급 후보**','',f"{newest['key']} / PPO{newest['budget']:,}스텝 / 이시점까지완료학습{result['current_middle_candidate_completed_games']}판+다음판진행{result['current_middle_candidate_partial_steps']}스텝 / 모방초기화8,000업데이트선택. 별도확인20판평균33.85·중앙값35·범위15–43·목표범위9/20·가변성20/20. 사전기준16/20미달로미채택이다.",'',
        '**별도로 확인한 과거 주요 회차(전체 역사 총계 아님)**','', '|회차|모델 수|해당 회차의 새 PPO스텝|완료 학습판|','|---|---:|---:|---:|']
    for name,s in summaries.items():lines.append(f"|{name}|{s['models']}|{s['ppo_interactions']:,}|{s['completed_games']:,}|")
    lines+=['','초기42/43실험·할인율추가학습·중급미세학습등전체이력은이표의총계라고부르지않는다. 특히부모모델의누적스텝을추가학습마다다시합산하면중복이다.',
        f"집계제어: `{WORK/'ppo_memo_audit.py'}`. 원본은각회차runs/조건의monitorCSV와manifestJSON이다. 각절대경로와CSV SHA256을 `{OUT/'PPO_학습판수_확인.json'}`에기록했다. 모델/과거보고서/메모원본은수정하지않았다."]
    (OUT/'PPO_학습판수_확인.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    memo=f'''PPO 학습 메모 정정본

1. 시드별 역할(시드 자체가 난이도를 정하는 것은 아님)
- 42·43: 초기 기본/모방·최대 웨이브·할인율 비교. 최근에는 기본/모방×기존/계층 구조에서 학습 스텝 증가 효과를 짝 비교하는 본 시드로 재사용.
- 44·45·46: 실제 계층형 행동 구조와 기존173행동 구조를 비교한 시드. 46도 이 묶음에 포함.
- 47·48: 확장 다종 타워 시연의 기본/모방 및 기존/계층 구조 비교. 47의 일부 저장 모델을 과거 중급 후보로 검토했으나 채택하지 않음.
- 49·50: 42·43에서 스텝 증가 효과가 확인된 '기존 구조+기본 초기화' 설정의 성능 개선을 새 학습 시드에서 재검증. 모든 구조/초기화를49·50으로 비교한 것은 아님. '학습 효율 상승'보다는 '스텝 증가의 성능 효과와 재현성 확인'이 정확함. 효율은 추가 데이터·시간 대비 성능으로 따로 판단.

2. 구조와 초기화는 서로 다른 축
- 기존(flat):173개의 최종 명령 중 선택.
- 계층(hierarchy):6개 상위 범주→하위 선택. 건설은5종 타워→26위치. 최종 실행 명령은 동일173개이며 모든 단계가 한 PPO 행동을 구성.
- 기본 초기화:무작위 가중치에서 출발. 초급은 이 계보만 허용. 중·고급도 이 방식으로 도전 가능.
- 모방 초기화:교사 시연으로 배우를 먼저 학습한 뒤 PPO 진행. 중·고급에서 허용. 모방만으로 중·고급 실력을 보장하지 않음.
- 따라서 같은 학습 시드에 기존/계층×기본/모방의 여러 모델이 존재할 수 있음.
- 초기42/43일부실험은두초기화계열이시연기반관측정규화통계를공유했으나,현재비교는시연에서맞추지않은고정입력단위를사용. 같은시드라도실험버전·부모·자료가다르면동일모델이아님.

3. 난이도 목표와 채택
- 초급:실제 연속 완료20–25웨이브,기본 초기화 계보만.
- 중급:30–35웨이브,기본/모방 허용.
- 고급:40웨이브 이상,기본/모방 허용.
- 이번 사전 채택 기준:독립20판의중앙값이목표범위,16판이상목표범위,무효행동0·제한종료0,행동가변성통과.
- 후보는기준에맞는지검토중인저장정책이며확정모델이아님. 학습시드+구조+초기화+시연/부모+학습스텝+저장가중치+추론설정으로구분.
- 과거중급검토:기존구조·모방·시드47·PPO16,384스텝,평균32.05지만19–42범위/목표3판이어서미채택.
- 최근중급검토:계층구조·모방·시드42·PPO65,536스텝,평균33.85지만15–43범위/목표9판이어서미채택. 이시점PPO완료학습{result['current_middle_candidate_completed_games']}판+다음판진행{result['current_middle_candidate_partial_steps']}스텝이며별도모방초기화도거쳤음.
- 현재중급으로확정등록한정책은없음.

4. 스텝과 판수
- 최근262,144스텝×10모델=2,621,440스텝,실제완료훈련6,067판(42/43본비교4,440판+49/50재검증1,627판).
- 별도의10개미완료진행조각은완료판에합산하지않음. 평가판과모방업데이트도제외.
- 같은스텝이어도모델생존길이에따라판수가다르므로고정환산불가. 많이끝낸모델이더잘하는것도아님.
- 세부모델별·스텝별판수:PPO_학습판수_확인.md / 원자료:PPO_학습판수_확인.json.
'''
    (OUT/'PPO_실험메모_정정본.txt').write_text(memo,encoding='utf-8')
    print(json.dumps({'latest':result['latest'],'primary':primary,'generalization':general,'candidate_games':result['current_middle_candidate_completed_games'],'major_batches':summaries,
        'latest_prefix_counts':[{k:r[k] for k in ('key','cumulative_completed_games_by_step')} for r in latest]},ensure_ascii=False))
if __name__=='__main__':main()
