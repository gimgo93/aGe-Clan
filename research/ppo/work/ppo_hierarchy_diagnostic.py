"""Explicit deterministic hierarchical decoding of unchanged flat policies."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
import json,sys
import numpy as np
import torch
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-hierarchy-diagnostic';ENGINE=WORK/'ppo-gamma-r2-engine'
sys.path[:0]=[str(ENGINE),str(WORK)]
from sb3_contrib import MaskablePPO
from stable_baselines3.common.vec_env import DummyVecEnv,VecNormalize
from ml.env import AgeClanEnv
from ml.experiment import write_json,environment_signature
from ppo_gamma_round import summary

GROUPS={'wait':'wait','build':'build','upgradeCastle':'upgrade','upgradeTower':'upgrade',
        'hire':'economy','hireWoodcutter':'economy','buildLab':'economy','researchPotion':'economy',
        'startWave':'combat','potion':'combat','repairCastle':'upgrade','sellTower':'sell'}

def group_best(ids,prob,key):
    groups={}
    for i in ids:groups.setdefault(key(i),[]).append(i)
    # Zero-probability illegal actions never enter ids. Stable ties use first group in action order.
    return max(groups.values(),key=lambda rows:float(prob[rows].sum()))

def choose(prob,mask,actions,mode):
    ids=list(map(int,np.flatnonzero(mask)))
    assert ids
    if mode=='flat':return max(ids,key=lambda i:float(prob[i]))
    ids=group_best(ids,prob,lambda i:GROUPS[actions[i]['name']])
    category=GROUPS[actions[ids[0]]['name']]
    if category=='build':
        ids=group_best(ids,prob,lambda i:actions[i]['args'][0])
        if mode=='block5':ids=group_best(ids,prob,lambda i:actions[i]['args'][1]//5)
    elif category=='sell' and mode=='block5':
        ids=group_best(ids,prob,lambda i:actions[i]['pad']//5)
    elif category not in ('wait','sell'):
        ids=group_best(ids,prob,lambda i:actions[i]['name'])
    return max(ids,key=lambda i:float(prob[i]))

def job(key,mode,start,count,stage):
    torch.set_num_threads(1)
    run=WORK/'ppo-gamma-r2'/key;lineage=key.split('-')[0]
    path=BASE/f'{stage}-{key}-{mode}.json'
    if path.exists():return key,mode,json.loads(path.read_text(encoding='utf-8'))['summary']
    manifest=json.loads((run/'manifest.json').read_text(encoding='utf-8'))
    vector=VecNormalize.load(run/'vecnormalize.pkl',DummyVecEnv([lambda:AgeClanEnv(**manifest['config']['env'])]))
    vector.training=False;vector.norm_reward=False
    try:
        assert manifest['environment']==environment_signature(vector.envs[0])
        actions=vector.envs[0].actions
        assert set(a['name'] for a in actions)==set(GROUPS)
        model=MaskablePPO.load(run/'model.zip',env=vector,device='cpu')
        rows=[]
        for python_seed in range(start,start+count):
            vector.seed(python_seed);obs=vector.reset();steps=invalid=0
            counts={};initial=None;first_build=None
            while True:
                mask=vector.envs[0].action_masks()
                with torch.inference_mode():
                    tensor,_=model.policy.obs_to_tensor(obs)
                    dist=model.policy.get_distribution(tensor,action_masks=mask[None,:])
                    prob=dist.distribution.probs[0].cpu().numpy()
                a=choose(prob,mask,actions,mode)
                assert mask[a]
                if mode=='flat':
                    expected,_=model.predict(obs,deterministic=True,action_masks=mask[None,:])
                    assert int(expected[0])==a
                if initial is None:
                    sums={g:sum(float(prob[i]) for i,c in enumerate(actions) if GROUPS[c['name']]==g) for g in dict.fromkeys(GROUPS.values())}
                    initial={'group_probabilities':sums,'chosen_action':actions[a]}
                name=actions[a]['name'];counts[name]=counts.get(name,0)+1
                obs,reward,done,infos=vector.step(np.asarray([a]));info=infos[0];steps+=1
                invalid+=int('error' in info['action_result'])
                if name=='build' and first_build is None:first_build=steps
                if done[0]:
                    assert info['end_reason'] in ('castle_destroyed','time_limit')
                    rows.append({'python_seed':python_seed,'game_seed':info['seed'],'steps':steps,
                        'invalid_actions':invalid,'action_counts':counts,'first_build_step':first_build,
                        'initial_decision':initial,**{k:info[k] for k in ('wave','contiguous_cleared','end_reason','kills','hp','leaks','reward_totals')}})
                    break
        result={'policy':str(run),'decoder':mode,'training_performed':False,'reward':'defense-v1 unchanged',
                'episodes':rows,'summary':summary(rows,lineage)}
        write_json(path,result)
        print(stage,key,mode,json.dumps(result['summary']),flush=True)
        return key,mode,result['summary']
    finally:vector.close()

def report(state):
    lines=['**PPO 행동 계층화 진단 보고서**','',f"상태: {state['status']}",'',
        '사용자 제안: 여러 설치 위치를 묶고 상위 선택 뒤 하위 선택을 수행한다. 이번 실험은 기존 173행동 모델의 확률을 합쳐 결정하는 실행 방식의 진단이다. 신경망 출력과 PPO 학습 구조를 바꾼 새 계층 정책은 아직 학습하지 않았다.',
        '', '상위 6묶음: 대기, 건설, 강화·수리, 경제·연구, 전투, 판매. 건설은 타워 종류 → 위치로 고른다. block5 방식은 타워 종류 → 위치 블록 → 위치를 고른다. 블록은 기존 pad 0–4, 5–9, 10–14, 15–19, 20–24, 25(마지막 1개)다. 게임 화면상의 공간적 인접성을 의미하는 구분은 아니다.',
        'flat은 기존 단일 행동 최빈값, semantic은 상위 묶음 확률 합계의 최댓값→하위 최댓값, block5는 semantic에 5개 위치 블록 단계를 추가한다. 유효 행동 마스크를 먼저 적용하고 각 단계에서 남은 유효 후보의 확률만 합친다. 모든 선택은 결정적이며 무작위 위치 선택이나 교사 개입은 없다.',
        '후보가 많은 묶음은 확률 합이 커질 수 있다. flat 대비 동작이 달라지는 이유이기도 하며 성능 개선을 보장하지 않는다. 상위 범주 최댓값을 고른 뒤 하위 최댓값을 고르는 것이 전체 단일 행동의 최댓값과 같지는 않다. 확률적으로 상위와 조건부 하위를 모두 샘플링하면 원래 분포와 같아지므로, 단순 합산 계층화 자체가 학습을 개선한 것은 아니다.',
        '보상 defense-v1, 게임 규칙, 모델, 관측 정규화와 학습 시드 42·43은 유지한다. 학습 없이 디코더 차이를 분리한다. 정규화 통계는 평가에서 동결한다. gamma는 이전 개발 평가에서 선택한 0.99다.',
        '개발 게임 시드 280000–280004에서 기본/모방 × 학습 시드 42·43 × 디코더 3개, 총 60판을 비교한다. 계열별로 두 시드의 개발 완료 중앙값 합, 평균 완료 합 순서로 semantic/block5 중 하나를 고른다. 동률은 단순한 semantic을 우선한다. 독립 확인은 290000–290004에서 선택 디코더와 flat을 두 학습 시드 모두 평가한다(40판). 개발 선택 후 확인 결과를 연다.',
        '주 지표는 실제 연속 완료 웨이브이며 최고 시작 웨이브와 분리한다. 제한 종료는 하한이다. 표본 5판씩의 진단이므로 난이도 확정에 쓰지 않는다. 초급은 기본 초기화, 중급/고급은 모방 허용이라는 목표를 유지한다.',
        '', '|평가|모델|선택 방식|판수|평균 완료|중앙값|최소~최대|제한 종료|',
        '|---|---|---|---:|---:|---:|---|---:|']
    for stage in ('development','confirmation'):
        for key,by_mode in state.get(stage,{}).items():
            for mode,s in by_mode.items():
                lines.append(f"|{stage}|{key}|{mode}|{s['episodes']}|{s['mean_cleared']:.2f}|{s['median_cleared']:.1f}|{s['min_cleared']}~{s['max_cleared']}|{s['censored']}|")
    lines+=['',f"개발 선택: {state.get('selected',{})}",'',
        '**다음 학습 계획**','',
        '다음 단계는 상위 6범주 자체의 로짓과 조건부 하위 로짓을 내는 새 정책을 구현하는 것이다. PPO에서 선택된 경로의 로그 확률은 단계별 로그 확률의 합으로 계산하고, 비활성 분기에는 손실·엔트로피를 적용하지 않는다. 상위 마스크는 유효 하위 행동이 하나라도 있을 때만 켜며 조건부 타워·위치 마스크도 적용한다.',
        '기존 flat 173행동 정책을 새 구조와 호환된다고 간주하지 않는다. 새 기본/모방 정책은 같은 초기 시드 44·45·46으로 짝지어 만들고 flat 대조군과 같은 상호작용 예산에서 비교한다. 위치 블록은 이번 진단 뒤 채택 여부를 정한다. 엔진과 보상은 우선 유지하며 새 정책 구조 효과와 보상 효과를 분리한다. 각 조건/시드/초기화별 131,072 PPO스텝을 예비 예산으로 한다. 구체적인 차기 학습 설정은 진단 뒤 계획 파일에 기록한다.',
        '', '**정확한 파일 경로와 상호 작용**','',
        f'- 실행·집계·보고: `{WORK / "ppo_hierarchy_diagnostic.py"}`.',
        f'- 읽은 모델·정규화·매니페스트: `{WORK / "ppo-gamma-r2"}`의 control/imitation-42/43-g099 폴더.',
        f'- Python 환경 `{ENGINE / "ml/env.py"}` → JSONL → Node `{ENGINE / "ml/bridge.mjs"}` → `{ENGINE / "lib/game-engine.js"}`. 매 단계에서 기존 모델 확률과 유효 마스크를 읽어 상위·하위 선택을 한 번에 마친 후 원래 엔진 행동 한 개를 보낸다. 상·하위 선택 사이에 게임 tick이 추가되지 않는다.',
        f'- 에피소드 시드·초기 확률·행동 횟수·보상·완료 웨이브·선택 이력: `{BASE}`.',
        f'- 보고서: `{ROOT / "outputs/PPO_행동계층화_진단보고서.md"}`.',
        '다른 게임 개발·ML 보존 폴더의 파일 내용이나 기존 모델 가중치는 수정하지 않았다.']
    (ROOT/'outputs/PPO_행동계층화_진단보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

def main():
    BASE.mkdir(exist_ok=False)
    state={'status':'running','development':{},'confirmation':{}}
    write_json(BASE/'preregistered-plan.json',{'models':['control-42-g099','control-43-g099','imitation-42-g099','imitation-43-g099'],
        'decoders':['flat','semantic','block5'],'development_seed_range':[280000,280004],
        'confirmation_seed_range':[290000,290004],'reward':'unchanged defense-v1','training':False,
        'selection':'per lineage: max sum development medians, then means, semantic breaks ties',
        'scope':'diagnostic; no tier assignment'})
    report(state)
    keys=['control-42-g099','control-43-g099','imitation-42-g099','imitation-43-g099']
    with ProcessPoolExecutor(max_workers=2) as pool:
        pending=[pool.submit(job,k,m,280000,5,'development') for k in keys for m in ('flat','semantic','block5')]
        for future in as_completed(pending):
            k,m,s=future.result();state['development'].setdefault(k,{})[m]=s
            write_json(BASE/'summary.json',state);report(state)
        state['selected']={}
        for lineage in ('control','imitation'):
            def rank(mode):
                ss=[state['development'][k][mode] for k in keys if k.startswith(lineage)]
                return sum(s['median_cleared'] for s in ss),sum(s['mean_cleared'] for s in ss)
            state['selected'][lineage]=max(('semantic','block5'),key=rank)
        write_json(BASE/'selection-before-confirmation.json',state)
        pending=[pool.submit(job,k,m,290000,5,'confirmation') for k in keys for m in ('flat',state['selected'][k.split('-')[0]] )]
        for future in as_completed(pending):
            k,m,s=future.result();state['confirmation'].setdefault(k,{})[m]=s
            write_json(BASE/'summary.json',state);report(state)
    state['status']='complete';write_json(BASE/'summary.json',state);report(state)
    print('HIERARCHY DIAGNOSTIC COMPLETE',flush=True)
if __name__=='__main__':main()
