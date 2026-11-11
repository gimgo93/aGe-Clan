"""Synchronize replay contract and verify the exported frozen candidate."""
import json,subprocess,sys
from ppo_intermediate_report import REPLAY,OUT
from ppo_intermediate_select import read,sha
from ml.experiment import write_json
base=OUT/'ppo_intermediate_policy'
(base/'replay.py').write_text(REPLAY,encoding='utf-8')
inventory={str(p.relative_to(base)).replace('\\','/'):sha(p) for p in sorted(base.rglob('*')) if p.is_file() and p.name!='sha256.json'}
write_json(base/'sha256.json',inventory)
expected=read(base/'confirmation-evidence.json')['episodes'][0]
ran=subprocess.run([sys.executable,str(base/'replay.py'),'--python-seed',str(expected['python_seed'])],capture_output=True,text=True,encoding='utf-8',check=True)
actual=json.loads(ran.stdout)
for key in ['game_seed','contiguous_cleared','wave','end_reason','steps','action_counts','nonwait_sequence_sha256']:assert expected[key]==actual[key],key
write_json(base/'replay-verification.json',{'status':'passed','replayed':actual,'model_sha256':sha(base/'model.zip'),
    'checks':['all bundle SHA256','declared action table equals engine','declared input units equal actual scaling','configuration-driven inference','full first-game sequence and outcome']})
inventory['replay-verification.json']=sha(base/'replay-verification.json');write_json(base/'sha256.json',inventory)
for rel,digest in inventory.items():assert sha(base/rel)==digest
assert read(base/'config.json')['status']=='not_adopted'
assert read(OUT/'PPO_난이도정책_등록부.json')['intermediate'] is None
print(json.dumps({'status':'passed','files_verified':len(inventory),'replay':actual,'adoption':'not_adopted'},ensure_ascii=False))
