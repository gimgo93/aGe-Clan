"""Package the completed round, accepting historic source archive timestamps."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
work = Path(__file__).resolve().parent
out = work.parent / 'outputs'
package = out / 'ppo_maxwave_r1'
archive = out / 'PPO_최대웨이브_1차_실험자료.zip'
assert archive.resolve().parent == out.resolve()
for name in ('ppo_maxwave_finalize.py','ppo_maxwave_package.py'):
    shutil.copy2(work / name, package / name)
inventory = {str(p.relative_to(package)):hashlib.sha256(p.read_bytes()).hexdigest()
             for p in package.rglob('*') if p.is_file() and p.name != 'sha256.json'}
(package / 'sha256.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,strict_timestamps=False) as z:
    for p in package.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(package))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name, expected in inventory.items():
        assert hashlib.sha256(z.read(name.replace('\\','/'))).hexdigest() == expected, name
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(inventory),
                  'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},ensure_ascii=False))
