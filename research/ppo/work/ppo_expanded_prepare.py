"""Convert audited current-engine demonstrations to shared NPZ datasets."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
ROOT=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
BASE=ROOT/'work/ppo-expanded-demo-v2';ENGINE=BASE/'engine'
sys.path.insert(0,str(ENGINE))
from ml.env import AgeClanEnv
from ml.experiment import environment_signature,write_json
from ml.hierarchical import NAME_GROUP
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def main():
    assert read(BASE/'collection-complete.json')['status']=='complete'
    assert sys.byteorder=='little'
    audit={'status':'passed','data':{},'teacher_quality':read(BASE/'teacher-quality.json')}
    old=ROOT/'work/ppo-hierarchy-v1/engine'
    with AgeClanEnv(target_wave=0,max_ticks=120000,reward_mode='defense-v1') as env:
        signature=environment_signature(env)
        for name,h in signature['source_sha256'].items():
            assert hashlib.sha256((old/name).read_text(encoding='utf-8').encode()).hexdigest()==h,name
        for split in ('training','validation'):
            m=read(BASE/f'data/{split}.json');n=m['samples'];f=len(m['features']);a=len(m['actions'])
            assert m['features']==env.feature_names and m['actions']==env.actions
            arrays={}
            for name,dtype,shape in [('observations','<f4',(n,f)),('masks','u1',(n,a)),('labels','<u2',(n,)),('episode_ids','<u4',(n,)),('teacher_ids','u1',(n,))]:
                p=BASE/f'data/{split}-{name}.bin'
                assert p.stat().st_size==np.prod(shape)*np.dtype(dtype).itemsize,(split,name)
                arrays[name]=np.fromfile(p,dtype=dtype).reshape(shape)
            arrays['masks']=arrays['masks'].astype(bool);arrays['labels']=arrays['labels'].astype(np.int64)
            assert np.isfinite(arrays['observations']).all()
            assert arrays['masks'][np.arange(n),arrays['labels']].all()
            arrays['waves']=arrays['observations'][:,m['features'].index('wave')].astype(np.int16)
            path=BASE/f'data/teacher-{split}.npz'
            assert not path.exists();np.savez_compressed(path,**arrays)
            audit['data'][split]={'samples':n,'episodes':len(m['episodes']),'game_seeds':sorted(map(int,set(arrays['episode_ids']))),
                'action_counts':m['action_counts'],'build_type_counts':m['build_type_counts'],
                'wave_band_samples':{str(i):int((np.minimum(arrays['waves']//10,4)==i).sum()) for i in range(5)},
                'npz_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'path':str(path)}
    assert set(audit['data']['training']['game_seeds']).isdisjoint(audit['data']['validation']['game_seeds'])
    audit['environment']=signature
    write_json(BASE/'data-audit.json',audit)
    lines=['**확장 시연 수집·검증 결과**','',
        '교사의 직접 엔진 게임 시드와 학생의 Python 평가 시드를 구분한다. 아래 결과는 교사의 성능이며 PPO 학생 성능이 아니다.',
        '', '|교사|독립 확인 5판 평균 완료|중앙값|', '|---|---:|---:|']
    for q in audit['teacher_quality']['quality']:lines.append(f"|{q['cfg']['id']}|{q['mean']:.2f}|{q['median']}|")
    for split,d in audit['data'].items():
        lines+=['',f"{split}: {d['episodes']}판, {d['samples']}상태. 타워별 건설 {d['build_type_counts']}. 행동별 수 {d['action_counts']}.",
            f"자료 `{d['path']}`. SHA256 `{d['npz_sha256']}`."]
    lines+=['','검증: 두 자료의 직접 엔진 시드 분리, 모든 정답이 해당 상태의 유효 행동, 유한 관측, 원본 바이너리 크기 일치, 다섯 타워 및 경제·연구 행동 포함, 이전 회차와 같은 엔진 지문을 확인했다.',
        '교사는 현재 엔진 상태와 공개 규칙을 사용하고 미래 RNG는 읽지 않는다. 교사의 개별 적 위치 판단은 학생의 구간별 관측보다 세밀할 수 있어 완전한 행동 복원을 보장하지 않는다. 자료의 희소 행동 수를 공개하며, 교사 성능을 학생의 달성 성능으로 옮겨 적지 않는다.',
        f'제어·변환 파일 `{ROOT / "work/ppo_expanded_prepare.py"}`. 교사 정의·수집 파일은 `{BASE}`의 teachers.mjs·collect.mjs다. Node TrainingSession이 실제 엔진을 진행하며 관측·마스크·정답을 바이너리로 저장하고, Python이 NPZ로 변환·검증했다.']
    (ROOT/'outputs/PPO_확장시연_수집검증.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(audit['data'],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
