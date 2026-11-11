"""Independent confirmation and concise report for completed imitation initializers."""
from concurrent.futures import ProcessPoolExecutor,wait,FIRST_COMPLETED
from pathlib import Path
from datetime import datetime
import json,sys,hashlib,time
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
WORK=ROOT/'work';BASE=WORK/'ppo-expanded-demo-v2';OUT=ROOT/'outputs'
sys.path[:0]=[str(BASE/'engine'),str(WORK)]
import torch
from ml.fixed_env import FixedScaleEnv
from ml.experiment import write_json,environment_signature
from sb3_contrib import MaskablePPO
from ppo_expanded_train import rollout,CONFIG
KEYS=[f'{arch}-{seed}-imitation' for seed in (47,48) for arch in ('flat','hierarchy')]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def confirm(key):
    torch.set_num_threads(1)
    run=BASE/'initial'/key;meta=read(run/'manifest.json')
    assert meta['status']=='complete' and meta['stage']=='initial' and meta['actual_timesteps']==0
    assert meta['imitation']['updates_performed'] in (4000,8000)
    assert meta['imitation']['dataset_sha256']==read(BASE/'data-audit.json')['data']['training']['npz_sha256']
    with FixedScaleEnv(**CONFIG['env']) as env:
        assert environment_signature(env.unwrapped)==meta['environment']
        model=MaskablePPO.load(run/'model.zip',env=env,device='cpu')
        assert model.num_timesteps==0 and not model.policy.optimizer.state
        result=rollout(model,key,'imitation','bc-confirmation',432000,20)
    return key,{'selected_update':meta['imitation']['selected_update'],
        'updates_performed':meta['imitation']['updates_performed'],'independent':result,
        'model':str(run/'model.zip'),'model_sha256':hashlib.sha256((run/'model.zip').read_bytes()).hexdigest()}

def main():
    plan=BASE/'bc-confirmation-plan.json'
    if not plan.exists():
        write_json(plan,{'models':KEYS,'stage':'imitation initialization only, zero PPO interaction',
            'python_game_seeds':[432000,432019],'selection_seeds':[412000,412004],
            'ppo_final_seeds_reserved':[430000,430019],
            'selection':'Existing BC checkpoints frozen before this independent confirmation',
            'registered_at':datetime.now().isoformat()})
    results={};submitted=set();pending={}
    with ProcessPoolExecutor(max_workers=2) as pool:
        while len(results)<len(KEYS):
            training_status=read(BASE/'summary.json')
            if training_status['status']=='failed':raise RuntimeError(training_status.get('errors'))
            for key in KEYS:
                if key in submitted:continue
                path=BASE/'initial'/key/'manifest.json'
                if not path.exists():continue
                try:meta=read(path)
                except json.JSONDecodeError:continue
                if meta.get('status')=='complete':
                    pending[pool.submit(confirm,key)]=key;submitted.add(key)
            if not pending:time.sleep(5);continue
            done,_=wait(pending,timeout=5,return_when=FIRST_COMPLETED)
            for future in done:
                key,result=future.result();results[key]=result;pending.pop(future)
                write_json(BASE/'bc-final-summary.json',{'status':'running','models':results})
    final={'status':'complete','finished':datetime.now().isoformat(),'models':results,'independent_games':80}
    write_json(BASE/'bc-final-summary.json',final)
    audit=read(BASE/'data-audit.json')
    lines=['**확장 교사 시연 모방 초기화 — 간단 결과 보고서**','',
        '기존 구조와 계층형, 학습 시드47·48의 모방 초기화 4개를 완료했다. 아래는 **PPO 추가 학습 전** 저장 가중치를 다시 읽어 평가한 결과다.',
        '', '|구조|학습 시드|선택 업데이트|독립20판 평균 완료|중앙값|완료 범위|',
        '|---|---:|---:|---:|---:|---|']
    for key in KEYS:
        r=results[key];s=r['independent'];arch,seed,_=key.split('-')
        lines.append(f"|{'기존' if arch=='flat' else '계층형'}|{seed}|{r['selected_update']:,}|{s['mean']:.2f}|{s['median']:.1f}|{s['min']}~{s['max']}|")
    lines+=['',
        f"훈련36판·{audit['data']['training']['samples']:,}상태, 시연 검증12판·{audit['data']['validation']['samples']:,}상태를 두 구조에 동일하게 제공했다. 궁수·발리스타·폭격포·서리·번개 및 경제·연구·포션 행동을 포함한다. 번개 건설은 훈련8건·검증3건으로 적다.",
        '모방 업데이트500·1000·2000·4000·8000을 검증했고, 검증 게임5판의 중앙값→평균→종류 균형 손실로 초기 가중치를 선택했다. 선택용 Python게임 시드412000–412004와 이번 독립 확인432000–432019를 분리했다. 계층형은 상위→타워 종류→위치의 경로 로그 확률 합으로 배우고 단계별 정확도를 측정했다. 선택 횟수와 실제 수행 횟수는 JSON에 별도 기록했다.',
        '결과는 실제 연속 완료 웨이브다. 무효 행동과 시간 제한 종료 수는 아래와 같다. 교사 평균34.6~47.2웨이브는 학생 결과와 구분한다. 이번 값은 모방 초기화 성능이며, 현재 별도로 진행 중인 PPO 후 성능이나 최종 게임 난이도 확정 값은 아니다.',
        f"독립 확인80판: 무효 행동 {sum(r['independent']['invalid'] for r in results.values())}건, 제한 종료 {sum(r['independent']['censored'] for r in results.values())}판.",
        '다음 단계는 같은 초기 모델에서 진행 중인 PPO 후 결과와 비교해 향상·퇴화를 확인하는 것이다. 보상 defense-v1은 유지했고 actor 모방 중 critic과 PPO optimizer는 갱신하지 않았다.',
        '', '**파일·데이터 흐름**','',
        f"Node 교사·수집 `{BASE / 'teachers.mjs'}`·`{BASE / 'collect.mjs'}` → 같은 실제 게임 엔진 → 원본 관측·마스크·정답 → `{WORK / 'ppo_expanded_prepare.py'}`의 공통 NPZ 검증 → `{WORK / 'ppo_expanded_train.py'}`의 모방 초기화. 이번 독립 평가·보고 제어는 `{WORK / 'ppo_imitation_brief.py'}`다.",
        f"자료와 모델은 `{BASE}`의 data·initial 폴더에, 에피소드별 결과는 bc-confirmation-*.json과 bc-final-summary.json에 저장했다."]
    for key in KEYS:lines.append(f"- {key}: `{results[key]['model']}`")
    report=OUT/'PPO_확장시연_모방초기화_간단보고서.md'
    report.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    write_json(OUT/'PPO_확장시연_모방초기화_결과.json',final)
    print(json.dumps(final,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
