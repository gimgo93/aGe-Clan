"""Matched gamma comparison. Two independent single-thread CPU workers."""
from concurrent.futures import ProcessPoolExecutor, as_completed
from copy import deepcopy
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

DISPLAY = Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK = DISPLAY / 'work'
ENGINE = WORK / 'ppo-gamma-r2-engine'
BASE = WORK / 'ppo-gamma-r2'
PARENT = WORK / 'ppo-maxwave-r1'
OUT = DISPLAY / 'outputs'
sys.path.insert(0, str(ENGINE))
from ml.evaluate import evaluate
from ml.experiment import write_json
from ml.train import train
import numpy as np


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def summary(rows, lineage):
    x = [r['contiguous_cleared'] for r in rows]
    censored = sum(r['end_reason'] == 'time_limit' for r in rows)
    eligible = []
    fractions = {}
    for tier, lo, hi in [('beginner',20,25),('intermediate',30,35),('advanced',40,float('inf'))]:
        fractions[tier] = sum(lo <= v <= hi for v in x)/len(x)
        if (lineage == 'control' or tier != 'beginner') and not censored and lo <= np.median(x) <= hi and fractions[tier] >= .8:
            eligible.append(tier)
    return {'episodes':len(rows),'mean_cleared':float(np.mean(x)),'median_cleared':float(np.median(x)),
            'min_cleared':min(x),'max_cleared':max(x),'p10':float(np.percentile(x,10)),
            'p90':float(np.percentile(x,90)),'max_started':max(r['wave'] for r in rows),
            'censored':censored,'castle_destroyed':sum(r['end_reason']=='castle_destroyed' for r in rows),
            'invalid_actions':sum(r['invalid_actions'] for r in rows),'eligible_tiers':eligible,'tier_fractions':fractions}


def evaluation(run, seed, episodes, label, lineage):
    path = BASE / f'{label}.json'
    if path.exists():
        return read(path)['summary']
    result = evaluate(run, episodes, seed)
    for row in result['episodes']:
        assert row['end_reason'] in ('castle_destroyed','time_limit')
        assert row['contiguous_cleared'] <= row['wave']
        row['censored'] = row['end_reason']=='time_limit'
    result['run'] = str(run)
    result['summary'] = summary(result['episodes'],lineage)
    write_json(path,result)
    print(label, json.dumps(result['summary']),flush=True)
    return result['summary']


def baseline_job(mode,seed):
    key=f'{mode}-{seed}'
    return key,evaluation(PARENT/key,260000,10,f'baseline-{key}',mode)


def training_job(mode,seed,gamma):
    tag='0999' if gamma==.999 else '099'
    key=f'{mode}-{seed}-g{tag}'
    parent=PARENT/f'{mode}-{seed}'
    config=deepcopy(read(parent/'config.json'))
    config['total_timesteps']=65536
    config['ppo']['gamma']=gamma
    run=BASE/key
    print('TRAIN',key,flush=True)
    if (run/'manifest.json').exists():
        manifest=read(run/'manifest.json')
    else:
        manifest=train(config,run,verbose=0,checkpoint_freq=32768,masked=True,transfer_from=parent)
    assert manifest['actual_timesteps']==131072 and manifest['added_timesteps']==65536
    assert manifest['model']['gamma']==manifest['model']['rollout_gamma']==manifest['model']['normalization_gamma']==gamma
    assert manifest['config']['env']['target_wave']==0
    result=evaluation(run,260000,10,f'development-{key}',mode)
    next_plan={'status':'planned','training_result':result,
               'hypothesis':'Investigate exploration collapse before further discount tuning' if result['median_cleared']<20 else 'Preserve this checkpoint and compare gamma conditions before selecting the next setting',
               'proposed_training_seeds':[44,45,46],'proposed_steps_per_seed':131072,
               'development_python_seeds':[280000,280009],'confirmation_python_seeds':[290000,290019],
               'criterion':'Same tier median and >=80% band rule; pair basic and imitation; resolve censoring first',
               'reward_change':'No additional reward changes in this gamma round; any shaping comparison requires a separate preregistered control'}
    write_json(BASE/f'next-after-{key}.json',next_plan)
    parent_hashes={n:hashlib.sha256((parent/n).read_bytes()).hexdigest() for n in ('model.zip','vecnormalize.pkl')}
    return key,{'development':result,'added':65536,'total':131072,'gamma':gamma,'mode':mode,
                'seed':seed,'parent':str(parent),'parent_sha256':parent_hashes,'wall_seconds':manifest['wall_seconds']}


def confirmation_job(key,mode):
    return key,evaluation(BASE/key,270000,20,f'confirmation-{key}',mode)


def report(state):
    lines=['**PPO 최대 웨이브 2차 — 할인율 비교 보고서**','',f"상태: {state['status']}.",'',
           '방향은 초급 20–25(기본 초기화), 중급 30–35, 고급 40 이상을 만족하는 저장 정책을 찾는 것이다. 주 지표는 실제 연속 완료 웨이브이며 최고 시작 웨이브와 구분한다. 완료에는 일부 적의 누수가 있는 웨이브도 포함한다. 시간 제한 종료는 최대 성과의 하한으로 처리한다.','',
           '**이번에 변경한 것과 이유**','',
           '- 동일한 부모 모델에서 gamma 0.99 유지 / 0.999 전이를 비교한다. 1행동=게임 시간 1초에서 가중치 합 기준 유효 범위 1/(1−gamma)는 대략 100초 / 1,000초이며, 이를 확정적인 예측 범위로 해석하지 않는다. 수백~수천 초에 걸친 방어의 지연 보상 전달이 개선될 수 있다는 가설이다.',
           '- 즉시 보상은 defense-v1 유지: 적 처치 +0.01/명, 실제 종료된 웨이브에서 처치 비율 0~1, 성 피해 −0.02/HP, 무효 행동 −0.05, 함락 −10. target_wave=0이므로 목표 성공 +10 보너스는 발생하지 않는다. 시간 생존·건설·판매 자체의 추가 보상은 없다. 할인율은 이 점수들을 미래까지 얼마나 반영할지를 정한다.',
           '- 엔진·행동 173개·관측 148개·frame_skip=10·max_ticks=120000·PPO의 나머지 설정을 유지한다. 모방 추가 시연과 사전 학습은 없다. 각 계열의 과거 비용은 부모 모델 이력에 남긴다. 기본 계열도 초기 비교 때 공통 시연 자료 기반 관측 정규화 통계를 사용했다.',
           '- 학습 시드 42·43은 무작위 초기 가중치/샘플링 계보를 짝지어 조건 효과를 비교하기 위해 유지한다. 시드 번호의 크기는 난이도를 뜻하지 않는다. 이전 정책에서 계속 학습하면서 seed만 바꾸는 것은 새로운 기본 초기화 계보가 아니다. 개선 조건 선정 후 새로운 초기 가중치 시드 44·45·46을 검증하는 것이 다음 단계다.',
           '- 평가 게임 시드는 교체했다. 부모/개발 평가 260000–260009, 독립 최종 확인 270000–270019. Python 시드에서 생성한 실제 엔진 uint32 시드는 각 에피소드 JSON에 별도 기록한다.',
           '- 예산: 기본/모방 × 학습 시드 42·43 × gamma 2조건 = 8회, 각 추가 65,536스텝, 총 524,288스텝. 모델별 누적 131,072 PPO스텝. 1스레드 작업 두 개를 병렬 실행한다. CPU 사용은 기존 단일 입력 NPU 비교 결과에 따른다.','',
           '**후보 선정 기준**','',
           '개발 평가에서 계열별 gamma를 두 학습 시드의 완료 중앙값 평균, 평균 완료 순서로 선정한다. 해당 gamma 내 후보 시드도 개발 평가로 선택한 뒤 최종 확인을 연다. 난이도 후보는 완료 중앙값이 목표 구간에 들고 80% 이상이 그 구간에 있으며 제한 종료가 없어야 한다. 초급은 기본 계열만 허용한다.','',
           '|평가|조건|판수|평균 완료|중앙값|최소~최대 완료|최고 시작|제한 종료|',
           '|---|---|---:|---:|---:|---|---:|---:|']
    for stage in ('baseline','development','confirmation'):
        for key,s in state.get(stage,{}).items():
            lines.append(f"|{stage}|{key}|{s['episodes']}|{s['mean_cleared']:.2f}|{s['median_cleared']:.1f}|{s['min_cleared']}~{s['max_cleared']}|{s['max_started']}|{s['censored']}|")
    if state.get('selection'):
        lines+=['',f"최종 확인 전에 선택한 개발 후보: {state['selection']}"]
    if state['status']=='complete':
        lines+=['','**결과 해석과 후속 계획**','']
        for mode in ('control','imitation'):
            deltas=[]
            for seed in (42,43):
                a=state['confirmation'][f'{mode}-{seed}-g099']['mean_cleared']
                b=state['confirmation'][f'{mode}-{seed}-g0999']['mean_cleared']
                deltas.append(f'시드 {seed}: {b-a:+.2f}')
            lines.append(f"- {mode}: gamma 0.999−0.99 평균 완료 차이: {', '.join(deltas)}. 학습 시드 두 개에 한정된 결과이며 일반화가 확정된 것은 아니다.")
        lines += ['- 기본 계열이 대기에 머물면 할인율만으로 해결됐다고 주장하지 않는다. 에피소드 행동 순서와 최초 건설·처치까지의 보상, 정책 엔트로피를 함께 분석하고 탐색 또는 보상 형성 실험을 별도로 설계한다.',
                  '- 시드 44·45·46은 새 초기 가중치부터 시작하는 독립 계보로 사용한다. 새 시드에는 단순히 이번 학습 완료 모델을 seed 인자만 바꿔 전달하지 않는다. 모방 비교군은 같은 초기 가중치에서 actor만 시연 학습하고, 기본 비교군은 시연 통계 없는 자체 정규화도 별도로 확인한다.',
                  '- 다음 학습 예산은 시드당 131,072스텝, 개발 게임 280000–280009·최종 확인 290000–290019로 계획한다. 구체적인 조건과 보상 변경은 이번 진단 결과를 바탕으로 next-round-plan.json에 기록한다. 다음 회차는 아직 실행하지 않았다.']
    lines+=['','**파일과 실제 호출·입출력**','',
            f'- 실행·계획·평가·보고 제어: `{WORK / "ppo_gamma_round.py"}`.',
            f'- 부모 모델/정규화/설정/매니페스트: `{PARENT}` 아래 `control-42`, `imitation-42`, `control-43`, `imitation-43`.',
            f'- 학습기: `{ENGINE / "ml/train.py"}`. 부모 model.zip의 가중치·optimizer와 vecnormalize.pkl 통계를 읽어 전이하고 gamma가 model/rollout_buffer/VecNormalize에 일치하는지 학습 전에 검사한다.',
            f'- 환경: `{ENGINE / "ml/env.py"}` → JSONL 표준 입출력 → Node `{ENGINE / "ml/bridge.mjs"}` → `{ENGINE / "lib/game-engine.js"}` 및 `{ENGINE / "lib/trees.js"}`. Node가 0.1초 tick을 수행하고 Python에 관측·보상·종료·행동 마스크를 반환한다.',
            f'- 평가기: `{ENGINE / "ml/evaluate.py"}`. 정규화 통계를 동결하고 결정적 정책을 실행하며 에피소드별 게임 시드·연속 완료·시작 웨이브·종료 이유·행동 횟수·보상 항목을 기록한다.',
            f'- 새 모델/체크포인트/학습 CSV/평가 JSON/매 학습 후 계획/summary.json: `{BASE}`.',
            f'- 보고서: `{OUT / "PPO_할인율비교_2차_보고서.md"}`.',
            '- 위 경로는 현재 확인한 내용 기반 표기 경로다. Windows 저장 경로를 호환 연결로 해석하면 내부 날짜 폴더가 나올 수 있으며, 과거 원자료의 경로 문자열은 당시 이력으로 보존한다.',
            '- 이전 모델 ZIP·원자료의 수치는 수정하지 않는다. 과거 사람이 읽는 보고서의 경로 표기 정정은 별도 path-corrections.json에 기록한다.']
    (OUT/'PPO_할인율비교_2차_보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')


def main():
    BASE.mkdir(exist_ok=True)
    state_path=BASE/'summary.json'
    state=read(state_path) if state_path.exists() else {'status':'running','started':datetime.now().isoformat(),'baseline':{},'development':{},'confirmation':{},'runs':{}}
    if state['status']=='complete':
        report(state)
        return
    state['status']='running'
    write_json(BASE/'preregistered-plan.json',{'training_seeds':[42,43],'gamma':[.99,.999],'lineages':['control','imitation'],
        'additional_steps_per_run':65536,'parallel_workers':2,'development_seeds':[260000,260009],
        'confirmation_seeds':[270000,270019],'reward':'defense-v1 unchanged','target_wave':0,'max_ticks':120000,
        'lineage_selection':'mean of development medians across two training seeds, then mean cleared',
        'tier_criterion':'median in band, >=80% in band, no censoring; beginner control only'})
    write_json(state_path,state);report(state)
    try:
        with ProcessPoolExecutor(max_workers=2) as pool:
            pending=[pool.submit(baseline_job,mode,seed) for mode in ('control','imitation') for seed in (42,43)]
            for f in as_completed(pending):
                key,s=f.result();state['baseline'][key]=s
                write_json(state_path,state);report(state)
            # Each gamma starts from the SAME parent, never from the other gamma condition.
            pending=[pool.submit(training_job,mode,seed,gamma) for mode in ('control','imitation') for seed in (42,43) for gamma in (.99,.999)]
            for f in as_completed(pending):
                key,r=f.result();state['runs'][key]=r;state['development'][key]=r['development']
                write_json(state_path,state);report(state)
            state['selection']={}
            for mode in ('control','imitation'):
                def rank(tag):
                    ss=[state['development'][f'{mode}-{seed}-g{tag}'] for seed in (42,43)]
                    return (sum(s['median_cleared'] for s in ss)/2,sum(s['mean_cleared'] for s in ss)/2)
                tag=max(('099','0999'),key=rank)
                key=max((f'{mode}-{seed}-g{tag}' for seed in (42,43)),key=lambda k:(state['development'][k]['median_cleared'],state['development'][k]['mean_cleared']))
                state['selection'][mode]=key
            write_json(BASE/'selection-before-confirmation.json',state)
            write_json(state_path,state);report(state)
            pending=[pool.submit(confirmation_job,key,r['mode']) for key,r in state['runs'].items()]
            for f in as_completed(pending):
                key,s=f.result();state['confirmation'][key]=s
                write_json(state_path,state);report(state)
        state.update(status='complete',finished=datetime.now().isoformat())
        write_json(state_path,state);report(state)
        print('GAMMA ROUND COMPLETE',flush=True)
    except BaseException as exc:
        state.update(status='failed',error=repr(exc));write_json(state_path,state);report(state)
        raise


if __name__=='__main__':
    main()
