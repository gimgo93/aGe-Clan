"""Measured learning curves, paired game deltas and local policy decision."""
from pathlib import Path
import csv,hashlib,json,shutil,subprocess,sys,os
os.environ.setdefault('MPLCONFIGDIR',str(Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-step-budget-v1\matplotlib-cache')))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from ppo_step_study import ROOT,BASE,ENGINE,OUT,BUDGETS,ENV,PPO,read,write,sha
from ml.experiment import runtime_versions
from sb3_contrib import MaskablePPO

def evaluation(key,budget,stage='comparison'):return read(BASE/'evaluations'/f'{stage}-{key}-s{budget}.json')
def training_diagnostics(key):
    with (BASE/'runs'/key/'progress.csv').open(encoding='utf-8',newline='') as f:rows=list(csv.DictReader(f))
    result={}
    for row in rows:
        budget=int(float(row['time/total_timesteps']))
        if budget in BUDGETS:result[str(budget)]={name:float(row[name]) for name in ('time/time_elapsed','train/entropy_loss','train/approx_kl','train/value_loss','rollout/ep_rew_mean','rollout/ep_len_mean') if row.get(name)}
    return result
def effect(key,stage='comparison'):
    short=evaluation(key,65536,stage);long=evaluation(key,262144,stage)
    assert [(r['python_seed'],r['game_seed']) for r in short['episodes']]==[(r['python_seed'],r['game_seed']) for r in long['episodes']]
    delta=np.array([b['contiguous_cleared']-a['contiguous_cleared'] for a,b in zip(short['episodes'],long['episodes'])],dtype=float)
    rng=np.random.default_rng(20261109);bootstrap=delta[rng.integers(0,len(delta),size=(10000,len(delta)))].mean(axis=1);lo,hi=np.quantile(bootstrap,[.025,.975])
    censored=short['summary']['censored']+long['summary']['censored']
    verdict='제한 종료로 미확정' if censored else ('생존 개선' if lo>0 else ('생존 악화' if hi<0 else '뚜렷한 개선 없음'))
    return {'key':key,'stage':stage,'mean_delta':float(delta.mean()),'median_delta':float(np.median(delta)),'paired_bootstrap95':[float(lo),float(hi)],
        'improved_games':int((delta>0).sum()),'unchanged_games':int((delta==0).sum()),'worsened_games':int((delta<0).sum()),
        'middle_count_delta':long['summary']['in_middle']-short['summary']['in_middle'],'censored':censored,'verdict':verdict,
        'per_game_deltas':delta.tolist(),'additional_interactions':196608,'mean_delta_per_10000_steps':float(delta.mean()/196608*10000)}

def plot(state):
    fig,axes=plt.subplots(2,2,figsize=(11.5,7.5),sharex=True);x=np.array([0]+BUDGETS)/1000
    for row,arch in enumerate(('flat','hierarchy')):
        axes[row,0].axhspan(30,35,color='#54a873',alpha=.13,label='Intermediate target 30-35')
        axes[row,0].axhline(40,color='#888',ls=':',lw=1)
        axes[row,1].axhline(80,color='#54a873',ls=':',lw=1)
        for mode,color in [('basic','#456c9b'),('imitation','#d17d2f')]:
            for seed,style in [(42,'-'),(43,'--')]:
                key=f'{arch}-{seed}-{mode}';scores=[state['comparison'][f'{key}-s{b}'] for b in [0]+BUDGETS];label=f'{mode}, seed {seed}'
                axes[row,0].plot(x,[s['mean'] for s in scores],style,marker='o',color=color,label=label,lw=1.8)
                axes[row,1].plot(x,[s['in_middle']/s['episodes']*100 for s in scores],style,marker='o',color=color,label=label,lw=1.8)
        axes[row,0].set_title(f'{arch}: mean contiguous cleared waves');axes[row,1].set_title(f'{arch}: games in waves 30-35')
        axes[row,0].set_ylabel('Completed waves');axes[row,1].set_ylabel('Games (%)');axes[row,1].set_ylim(-3,103)
        for ax in axes[row]:ax.grid(alpha=.2);ax.set_xticks(x);ax.set_xlabel('PPO environment interactions (thousands)')
    handles,labels=axes[0,0].get_legend_handles_labels();fig.legend(handles,labels,fontsize=8,loc='upper center',bbox_to_anchor=(.5,.955),ncol=5)
    fig.suptitle('PPO budget study | same parent per curve | 20 paired game seeds | full actions',fontsize=12,y=.99)
    fig.tight_layout(rect=(0,0,1,.91));fig.savefig(OUT/'PPO_학습스텝증가_학습곡선.png',dpi=180);fig.savefig(OUT/'PPO_학습스텝증가_학습곡선.svg');plt.close(fig)

REPLAY='''from pathlib import Path
import argparse,hashlib,json,sys
import torch
p=argparse.ArgumentParser();p.add_argument('--python-seed',type=int,required=True);args=p.parse_args()
base=Path(__file__).resolve().parent
for rel,h in json.loads((base/'sha256.json').read_text(encoding='utf-8')).items():assert hashlib.sha256((base/rel).read_bytes()).hexdigest()==h,rel
sys.path.insert(0,str(base/'engine'))
from ml.fixed_env import FixedScaleEnv
from sb3_contrib import MaskablePPO
config=json.loads((base/'config.json').read_text(encoding='utf-8'));torch.set_num_threads(1)
model=MaskablePPO.load(base/'model.zip',device='cpu');assert model.num_timesteps==config['ppo_steps']
counts={};sequence=[];steps=0
with FixedScaleEnv(**config['env']) as env:
    assert env.unwrapped.actions==json.loads((base/'action-table.json').read_text(encoding='utf-8'))
    scales=json.loads((base/'feature-scaling.json').read_text(encoding='utf-8'))['scales']
    assert all(float(scales[n])==float(s) for n,s in zip(env.unwrapped.feature_names,env.scales))
    obs,info=env.reset(seed=args.python_seed)
    while True:
        mask=env.action_masks();a,_=model.predict(obs,deterministic=True,action_masks=mask);a=int(a);assert mask[a]
        name=env.unwrapped.actions[a]['name'];counts[name]=counts.get(name,0)+1
        if name!='wait':sequence.append([steps,a])
        obs,r,t,c,info=env.step(a);steps+=1
        if t or c:break
print(json.dumps({'python_seed':args.python_seed,'game_seed':info['seed'],'contiguous_cleared':info['contiguous_cleared'],'wave':info['wave'],
    'steps':steps,'end_reason':info['end_reason'],'action_counts':counts,'sequence_sha256':hashlib.sha256(json.dumps(sequence).encode()).hexdigest()}))
'''

def package(state):
    selected=state['middle_selection'];key=selected['key'];budget=selected['budget'];meta=state['runs'][key]['training'];proof=evaluation(key,budget,'middle-confirmation');s=proof['summary']
    adopt='intermediate' in s['eligible_tiers'] and s['diversity_pass'];target=OUT/'ppo_step_budget_policy';target.mkdir(exist_ok=True)
    source=BASE/'runs'/key/'checkpoints'/f'ppo_{budget}.zip';assert sha(source)==read(source.with_suffix('.json'))['model_sha256'];shutil.copy2(source,target/'model.zip')
    model=MaskablePPO.load(source,device='cpu');assert model._n_updates==budget//256*4
    for rel in ['lib/game-engine.js','lib/trees.js','public/game/game.js','public/game/balance.js','ml/__init__.py','ml/env.py','ml/fixed_env.py','ml/hierarchical.py','ml/experiment.py','ml/bridge.mjs','ml/fast_masks.mjs']:
        dest=target/'engine'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ENGINE/rel,dest)
    write(target/'engine/package.json',{'type':'module','private':True,'engines':{'node':'>=22.13.0'}});shutil.copy2(BASE/'feature-scaling.json',target/'feature-scaling.json')
    write(target/'action-table.json',meta['environment']['actions'])
    config={'status':'adopted' if adopt else 'not_adopted','difficulty':'intermediate','policy_key':key,'training_seed':meta['seed'],'architecture':meta['architecture'],
        'initialization':meta['initialization'],'bc_selected_update':meta['bc']['selected_update'],'bc_performed_updates':meta['bc']['performed_updates'],
        'ppo_steps':budget,'post_gradient_update':True,'gradient_epochs':model._n_updates,'env':ENV,'ppo':PPO,'inference':{'deterministic':True,'decision_seconds':1},
        'source':str(source),'model_sha256':sha(source),'parent_model_sha256':meta['parent_model_sha256'],'environment':meta['environment'],
        'input_scaling':'feature-scaling.json','actions':'action-table.json','model':'model.zip','summary':s,'runtime':runtime_versions(),
        'confirmation_python_seeds':[640000,640019],'game_seed_kind':'Gym seeded RNG to uint32; see evidence, not the training seed'}
    write(target/'config.json',config);write(target/'confirmation-evidence.json',proof);(target/'replay.py').write_text(REPLAY,encoding='utf-8')
    versions=runtime_versions();(target/'requirements.txt').write_text('\n'.join(f'{k}=={v}' for k,v in versions.items() if k!='python')+'\n',encoding='utf-8')
    (target/'README.md').write_text('**스텝 비교에서 동결한 중급 검토 정책**\n\nconfig.json의 status가채택여부다. not_adopted는검토자료이고난이도등록이아니다.\n'
        'model.zip은배우/가치함수가중치,config.json은부모계보·시드·학습예산·평가결과,confirmation-evidence.json은독립20판원자료다.\n'
        'engine은오프라인추론에필요한엔진·어댑터사본이고Node실행파일과Python환경은별도다. requirements.txt에현재Python패키지를기록했다.\n\n'
        f'현재로컬실행: `& "{ROOT/"work/ppo-venv/Scripts/python.exe"}" "{target/"replay.py"}" --python-seed 640000`\n\n'
        '재생기는파일SHA256·행동표·입력단위를검사한뒤함락까지추론하며원확인게임과의전체행동시퀀스일치는replay-verification.json에저장했다.\n',encoding='utf-8')
    for name in ['transport-verification.json','initialization-verification.json']:shutil.copy2(BASE/name,target/name)
    inventory={str(p.relative_to(target)).replace('\\','/'):sha(p) for p in sorted(target.rglob('*')) if p.is_file() and p.name not in ('sha256.json','replay-verification.json') and '__pycache__' not in p.parts};write(target/'sha256.json',inventory)
    first=proof['episodes'][0];done=subprocess.run([sys.executable,str(target/'replay.py'),'--python-seed',str(first['python_seed'])],capture_output=True,text=True,encoding='utf-8',check=True);actual=json.loads(done.stdout)
    for field in ['game_seed','contiguous_cleared','wave','steps','end_reason','action_counts','sequence_sha256']:assert actual[field]==first[field],field
    write(target/'replay-verification.json',{'status':'passed','episode':actual,'checks':['SHA256','schema','input units','post-update weights','full first-game action sequence and outcome']})
    inventory['replay-verification.json']=sha(target/'replay-verification.json');write(target/'sha256.json',inventory)
    for rel,h in inventory.items():assert sha(target/rel)==h
    decision={'status':config['status'],'config':str(target/'config.json'),'summary':s,'key':key,'budget':budget,'training_seed':meta['seed'],'replay':'passed','files_verified':len(inventory)}
    write(OUT/'PPO_학습스텝증가_정책판정.json',decision)
    if adopt:
        registry=read(OUT/'PPO_난이도정책_등록부.json');registry['version']=registry.get('version',1)+1;registry['intermediate']=decision;registry['candidate']=decision;registry['game_deployment']='local adoption only; no production deployment';write(OUT/'PPO_난이도정책_등록부.json',registry)
    return decision

def main():
    state=read(BASE/'study-state.json');assert state['status']=='complete';gen=read(BASE/'generalization-state.json');assert gen['status'] in ('complete','not_run')
    for key in list(state['runs'])+list(gen['runs']):
        for budget in BUDGETS:
            p=BASE/'runs'/key/'checkpoints'/f'ppo_{budget}.zip';m=read(p.with_suffix('.json'));assert sha(p)==m['model_sha256'] and m['post_update'] and m['gradient_epochs']==budget//256*4
    effects=[effect(key) for key in sorted(state['runs'])];generalization=[effect(key,'generalization') for key in sorted(gen['runs'])] if gen['status']=='complete' else []
    plot(state);decision=package(state);audit=read(BASE/'data-audit.json');quality=read(BASE/'teacher-quality.json')
    total_steps=8*262144+len(gen['runs'])*262144;bcupdates=sum(r['training']['bc']['performed_updates'] for r in state['runs'].values())+sum(r['training']['bc']['performed_updates'] for r in gen['runs'].values())
    pair_checks={}
    for arch in ('flat','hierarchy'):
        for seed in (42,43):
            a=state['runs'][f'{arch}-{seed}-basic']['training']['initial_random_weights_sha256'];b=state['runs'][f'{arch}-{seed}-imitation']['training']['initial_random_weights_sha256'];assert a==b;pair_checks[f'{arch}-{seed}']=a
    result={'status':'complete','client_date':'2026-11-09','study':state,'generalization':gen,'paired_effects':effects,'generalization_effects':generalization,'policy_decision':decision,
        'initial_random_weights_matched_pairs':pair_checks,
        'training_diagnostics':{key:training_diagnostics(key) for key in state['runs']},
        'cost':{'primary_interactions':8*262144,'generalization_interactions':len(gen['runs'])*262144,'total_interactions':total_steps,'actor_bc_updates':bcupdates,'actor_bc_sample_presentations':bcupdates*256,
            'separate_discarded_verification_interactions':1024,'separate_verification_actor_updates':2},
        'uncertainty':'Bootstrap resamples game seeds conditional on these trained weights; it does not estimate all training-seed uncertainty. Primary has only2training seeds; comparisons are descriptive, not multiplicity-adjusted significance claims.'}
    next_plan={'status':'planned_not_started','hypothesis':'A smaller PPO learning rate may preserve imitation behavior and reduce late-budget drift; it does not guarantee the middle band.',
        'architecture':decision['key'].split('-')[0],'training_seeds':[42,43],'initializations':['basic','imitation'],
        'parents':'Reuse this study initial.zip for each matching architecture/seed/initialization',
        'learning_rates':{'reference':.0001,'new':.00003},'new_budget_per_model':131072,'new_models':4,'new_interactions':524288,
        'baseline':'Reuse corresponding frozen 131072 checkpoints, no baseline retraining','evaluation_python_seeds':[660000,660019],
        'middle_confirmation_python_seeds':[670000,670019],'reward_actions_gamma':'unchanged','criterion':'same middle80%+diversity; paired survival and dispersion; then new49/50 only if configuration improves'}
    result['next_plan']=next_plan;write(OUT/'PPO_학습스텝증가_후속계획.json',next_plan)
    write(OUT/'PPO_학습스텝증가_결과.json',result)
    imit=[e for e in effects if e['key'].endswith('imitation')];basic=[e for e in effects if e['key'].endswith('basic')]
    lines=['**PPO 학습 스텝 증가의 효과 — 결과 보고서(2026-11-09)**','',
        f"결론: 학습량 증가는 일부 조건의 생존 성능에 도움이 됐지만,무조건적인 개선이나 중급 달성 수단은 아니다. 본8조건의 사전 짝 비교에서 생존 개선{sum(e['verdict']=='생존 개선' for e in effects)},악화{sum(e['verdict']=='생존 악화' for e in effects)},뚜렷한 개선 없음{sum(e['verdict']=='뚜렷한 개선 없음' for e in effects)}조건이었다. 이는 게임 난수에 대한 조건부 구간을 사용한 기술적 분류다.",
        f"완료: 본 비교8조건×262,144={8*262144:,}PPO 상호작용. 새 시드 일반화{len(gen['runs'])}조건을 포함한 실제 총량{total_steps:,}. 중급 정책 판정: **{decision['status']}**.",
        f"65,536→262,144에서 모방4조건 중{sum(e['mean_delta']>0 for e in imit)}조건 평균 생존 증가,그중{sum(e['paired_bootstrap95'][0]>0 for e in imit)}조건의 게임 난수 bootstrap구간이0보다 높았다. 기본4조건 중 평균 증가{sum(e['mean_delta']>0 for e in basic)}조건. 이 숫자는 학습 스텝 증가가 항상 도움이 된다는 뜻이 아니다.",
        '생존 성능과 중급 적합성을 구분했다. 학습으로40웨이브를 넘으면 생존 성능은 좋아져도30–35중급 목표에는 불리하다. 이번 결과는 아래 조건·엔진·학습 난수에 대한 관측이다.','',
        '스텝 효과는 이번에 고정한 동일 신규 부모 안의65,536→262,144 변화로 판단했다. 이전47·48시드나 다른 시연 실험과의 성능 차이 전체를 스텝 증가의 효과로 해석하지 않았다.','',
        '**동일 조건에서 비교한 학습 곡선**','',f"![학습 곡선]({(OUT/'PPO_학습스텝증가_학습곡선.png').as_posix()})",'',
        '|구조·시드·초기화|0스텝 평균|65,536 평균|131,072 평균|262,144 평균|장기−단기 평균[게임95%구간]|중급 판수 단기→장기|판정|',
        '|---|---:|---:|---:|---:|---|---|---|']
    for e in effects:
        k=e['key'];scores=[state['comparison'][f'{k}-s{b}'] for b in [0]+BUDGETS];lo,hi=e['paired_bootstrap95']
        lines.append(f"|{k}|"+'|'.join(f"{s['mean']:.2f}" for s in scores)+f"|{e['mean_delta']:+.2f}[{lo:+.2f},{hi:+.2f}]|{scores[1]['in_middle']}/20→{scores[-1]['in_middle']}/20|{e['verdict']}|")
    lines+=['','|조건|표준편차65k→262k|하위10%65k→262k|262k 범위|중급 가변성 통과 판수262k|추가65k→262k에서 개선/동일/악화 게임|','|---|---|---|---|---|---|']
    for e in effects:
        a=state['comparison'][e['key']+'-s65536'];b=state['comparison'][e['key']+'-s262144']
        lines.append(f"|{e['key']}|{a['sd']:.2f}→{b['sd']:.2f}|{a['p10']:.1f}→{b['p10']:.1f}|{b['min']}–{b['max']}|{b['diversity_games']}/20|{e['improved_games']}/{e['unchanged_games']}/{e['worsened_games']}|")
    declines=[key for key in state['runs'] if state['comparison'][key+'-s262144']['mean']<state['comparison'][key+'-s131072']['mean']]
    lines+=['',f"131,072→262,144 추가 구간에서 평균이 하락한 조건은{len(declines)}/8: {', '.join(declines) if declines else '없음'}. 중간 예산보다 더 학습한 최종 모델이 자동으로 최선은 아니다. 표준편차가 줄더라도 목표보다 낮은 웨이브로 수렴하면 중급 개선으로 보지 않는다.",
        '훈련 로그의 평균 보상/entropy/KL/value loss도 결과JSON에 보존했다. 훈련 보상은 확률적으로 행동한 훈련 에피소드의 이동평균이고,이 표는 결정적으로 추론한 별도 게임의 실제 완료 웨이브다. 둘은 같은 지표가 아니다. 고정 할인 보상과 최대 생존 목표의 차이,확률적 훈련과최빈선택평가의차이,정책이시연행동에서이탈하는현상은가능한원인이지만이번고정설계가각원인을분리검증한것은아니다.',
        '시연에는서로다른투자계획을가진교사와참고자료가섞여있고교사ID는학생입력이아니다. 유사상태에서상충하는정답이나희소행동균형추출이정책일관성에영향을줄가능성도있다. 이번예산별비교에서는자료와추출규칙을고정했으므로이문제의원인효과를별도로확정하지않았다.']
    lines+=['','같은 Python 평가 시드와 실제 엔진uint32 대응을 확인한 뒤 게임별 차이를 계산했다.',
        '주 비교는 사전 지정한65,536→262,144다. 각 체크포인트20판,표준편차는표본ddof1,하위10%는경험분위수다. bootstrap10,000회는 게임 시드20개를 짝으로 재추출한 조건부 구간이다. 폭0구간은관측한게임들의차이가동일했음을뜻하며전체게임의보장은아니다. 본 비교의 학습 시드는2개라 학습 난수 전체로 일반화할 수 없고,여러 조건의 구간은 다중 비교 보정한 유의성 판정이 아니다.',
        f"제한 종료 총{sum(s['censored'] for s in state['comparison'].values())},무효 행동 총{sum(s['invalid'] for s in state['comparison'].values())}. 제한 종료가 있다면 성과는 함락 최대치의 하한이고 해당 효과는 미확정으로 표시한다.",'',
        '**새 학습 시드49·50 확인**','']
    if generalization:
        lines+=['개발 증가량으로 고른 한 구조/초기화만 새 가중치49·50에서 반복했다. 비교용 새 게임650000–650019를 사용했다. 같은 설정을 새 학습 난수에서 다시 학습한 결과이며42·43 가중치를 가져오지 않았다.','', '|조건|65k→262k 평균 차이|게임95%구간|중급 판수 변화|판정|','|---|---:|---|---:|---|']
        for e in generalization:lines.append(f"|{e['key']}|{e['mean_delta']:+.2f}|[{e['paired_bootstrap95'][0]:+.2f},{e['paired_bootstrap95'][1]:+.2f}]|{e['middle_count_delta']:+}|{e['verdict']}|")
    else:lines+=[f"일반화 미실행: {gen.get('reason')}. 개발에서 선택한 개선이 독립 본 비교에서도 양수여야 한다는 사전 조건을 만족하지 못했다. 이 경우 새 시드를 계속 바꾸어 개선처럼 보이게 만들지 않는다."]
    s=decision['summary'];lines+=['','**중급 후보와 난이도 상태**','',
        f"개발 세트로 먼저 동결한 후보는{decision['key']}의{decision['budget']:,}스텝,학습 시드{decision['training_seed']}이다. 별도640000–640019 확인20판:평균{s['mean']:.2f}/중앙값{s['median']}/범위{s['min']}–{s['max']},30–35구간{s['in_middle']}/20,가변성 조건{s['diversity_games']}/20,대기 비중{s['mean_wait_share']:.1%}. 최종 판정{decision['status']}. 모델·설정은 검토 묶음에 저장했고 첫 판 전체 행동·결과가 재생에서 일치했다.",
        '채택 조건은 중앙값30–35·구간16/20이상·무효/제한종료0 및 행동 가변성 통과다. 35웨이브 강제 종료나 유리한 게임 시드 선별은 없다. 초급20–25는기본초기화계보만,중급30–35와고급40이상은모방을허용한다. 다음 목록은 본 비교에서 성능 대역 기준을 만족한 저장 정책이며 게임 배포를 뜻하지 않는다.']
    lines+=['']
    for tier in ('beginner','intermediate','advanced'):
        eligible=[f'{k}@{b}' for k in sorted(state['runs']) for b in BUDGETS if tier in state['comparison'][f'{k}-s{b}']['eligible_tiers']]
        lines.append(f"- {tier}: {', '.join(eligible) if eligible else '이번 본 비교에서 성능 대역 기준 통과 없음'}.")
    lines+=['','**자료·공정성·계산 비용**','',
        '교사300설정×3판 탐색,12후보×20판 품질 선별,3후보×20판 확인 후 주 교사를 확정했다. 주 교사는 새20판 중17판30–35,평균31.7/중앙값32/범위26–34,20판모두다종타워였다. 포격포 보조교사는15/20으로중급확정교사가아니다. 교사 성능은 학생 성능이 아니다.',
        f"새 중급 훈련60판/{audit['splits']['training']['middle_samples']:,}상태·검증20판/{audit['splits']['validation']['middle_samples']:,}상태를 수집했다. 새 시연 타워 건설{audit['splits']['training']['middle_build_counts']}. 서리/번개는 새 중급 시연에 없어 기존 확장 훈련100,325/검증32,301상태를 별도 참고 역할로 재사용했다. 배치256개는중급230/참고26,각역할안에서대기반·행동반이다. 두 구조는 같은 파일·SHA·표본 추출 난수 규칙을 쓴다. 기본 초기화에는 시연과 시연 통계가 없다.",
        f"같은구조·시드42/43의기본/모방무작위초기값SHA가4짝모두일치했다. 모방 연산 추가 비용은 실제 actor업데이트{bcupdates:,}회/{bcupdates*256:,}표본 제시다. PPO 상호작용{total_steps:,}과 다른 단위이며 모방 critic/PPO optimizer는 초기화 시 학습하지 않았다. 검증용폐기모델PPO1,024스텝과actor2업데이트는별도다. 각 조건이 수행8,000회 중 선택한 업데이트는 아래와 같다. CPU4worker(일반화2worker)·torch1thread로 공유 자원에서 측정해 개별 하드웨어 벤치마크로 해석하지 않는다."]
    lines+=['']
    for k,r in sorted(state['runs'].items()):
        m=r['training'];lines.append(f"- {k}:모방수행{m['bc']['performed_updates']}/선택{m['bc']['selected_update']},PPO시간{m['training_wall_seconds']:.1f}초,전체작업{m['total_wall_seconds']:.1f}초.")
    lines+=['','보상·행동은 학습 예산별로 동일하다. 처치+0.01,실제 웨이브 처치 비율0–1,피해−0.02,무효−0.05,함락−10;gamma0.99는미래할인율로보상항목변경이아니다. LR0.0001,entropy0.003,rollout256/batch64/epoch4,173행동·148고정단위입력·목표종료0·120,000틱제한을 유지했다. 교사의 투자 예산은 학생의 행동 마스크 제한이 아니다.',
        '65k·131k·262k는 게임 환경의 행동 상호작용 횟수이며 모방업데이트나 경사epoch 횟수가 아니다. 저장은 해당 수집 자료의 경사 업데이트 후다.262,144에서rollout1,024개×4epoch=4,096epoch,각epoch4미니배치다. 예산을늘릴때추가경험과추가최적화가함께늘어났으므로두요소각각의효과는분리하지않았다.','',
        '**정확한 파일과 실제 호출 관계**','',
        f"- `{BASE/'teachers.mjs'}`·`{BASE/'search.mjs'}`가 `{ENGINE/'lib/game-engine.js'}`의 실제 함락 결과로 교사를 평가한다. `{BASE/'collect.mjs'}`가 관측·유효 마스크·행동 정답 바이너리를 저장한다.",
        f"- `{ROOT/'work/ppo_step_prepare.py'}`가 바이너리와 `{ROOT/'work/ppo-expanded-demo-v2/data/teacher-training.npz'}` 참고 자료를 읽어 `{BASE/'data/teacher-training.npz'}`·`{BASE/'data/teacher-validation.npz'}` 및`{BASE/'data-audit.json'}`을 쓴다. 훈련/검증직접엔진시드는분리돼있다.",
        f"- `{ROOT/'work/ppo_step_study.py'}` → `{ENGINE/'ml/fixed_env.py'}` → `{ENGINE/'ml/env.py'}` → 캐시마스크JSONL → Node `{ENGINE/'ml/bridge.mjs'}` → `{ENGINE/'lib/game-engine.js'}`. 각상태의마스크는같은게임전이응답과함께받아보관한다. `{BASE/'runs'}`에부모ZIP·경사후체크포인트·훈련CSV,`{BASE/'evaluations'}`에게임별JSON을저장한다.",
        f"- `{ROOT/'work/ppo_step_transport_verify.py'}`가 기존/새통신1,864스텝관측·마스크·보상·전체정보일치를검증했다. `{ROOT/'work/ppo_step_verify.py'}`가같은표본추출·유한경사·critic보존·PPO512스텝·저장재개를검증했고그모델은본학습에쓰지않았다.",
        f"- `{ROOT/'work/ppo_step_generalize.py'}`는개발선정설정을새학습시드로반복하고`{BASE/'generalization-state.json'}`에기록한다. `{ROOT/'work/ppo_step_report.py'}`가저장모델해시·경사횟수를감사하고짝비교·학습곡선·현재문서를만든다.",
        f"- 검토정책 `{OUT/'ppo_step_budget_policy/config.json'}`·`{OUT/'ppo_step_budget_policy/model.zip'}`. 같은묶음의`replay.py` → 묶음엔진이첫확인게임을재생했다. `{OUT/'PPO_학습스텝증가_정책판정.json'}`은실제채택여부이며통과시에만전체난이도등록부를갱신한다.",'',
        f"다음 학습 계획(미실행): {next_plan['architecture']}구조의이번초기가중치42/43×기본/모방4부모를그대로고정하고LR0.00003으로각131,072스텝(총524,288)을추가비교한다. 대조군은이미저장한LR0.0001/131,072모델이라재학습하지않는다. 낮은학습률이후반모방행동이탈과편차를줄이는지가설이며중급대역보장은아니다. 새Python660000–660019로짝평가,670000–670019로중급확인,같은80%·가변성기준을유지한다. 보상/행동/gamma는동일하게두고개선설정에만새49/50확인을붙인다. 기본초기화정체는별도탐색가설로분리하며이번결과에소급해설정을바꾸지않는다."]
    (OUT/'PPO_학습스텝증가_결과보고서.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'status':'complete','effects':effects,'generalization':generalization,'middle_decision':decision,'total_interactions':total_steps},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
