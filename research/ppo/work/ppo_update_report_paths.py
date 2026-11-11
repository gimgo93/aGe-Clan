"""Correct readable report paths; retain frozen model/experiment history."""
from pathlib import Path
import hashlib
import json

root=Path(r'C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구')
out=root/'outputs'
replacements={
    r'C:\Users\jjiho\Documents\Codex\2026-11-07\new-chat-2':str(root),
    r'C:\Users\jjiho\Documents\Codex\PPO학습·Git·모의유엔 (2026-11-07)\PPO강화학습·난이도연구':str(root),
    r'C:\Users\jjiho\Documents\Codex\PPO학습(2026-11-07)\PPO강화학습·난이도연구':str(root),
    r'C:\Users\jjiho\Documents\Codex\2026-11-05\new-chat-2':r'C:\Users\jjiho\Documents\Codex\aGe게임개발·벚나무발표 (2026-11-05)\aGe게임개발',
}
changed=[]
for p in out.rglob('*.md'):
    rel=p.relative_to(out)
    if any('engine' in part.lower() or part=='experiment' for part in rel.parts[:-1]):continue
    if not (p.name.startswith('PPO_') or p.name in ('재실행.md','README.md')):continue
    before=p.read_bytes();text=before.decode('utf-8-sig')
    revised=text
    for old,new in replacements.items():
        for a,b in ((old,new),(old.replace('\\','\\\\'),new.replace('\\','\\\\')),(old.replace('\\','/'),new.replace('\\','/'))):
            revised=revised.replace(a,b)
    if revised!=text:
        p.write_text(revised,encoding='utf-8')
        changed.append({'path':str(p),'before_sha256':hashlib.sha256(before).hexdigest(),'after_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'report path text only'})
# An expanded deliverable's checksum list must reflect its corrected report.
for inventory in out.rglob('sha256.json'):
    if any('engine' in part.lower() for part in inventory.relative_to(out).parts):continue
    records=json.loads(inventory.read_text(encoding='utf-8-sig'))
    if isinstance(records,dict) and all(isinstance(v,str) for v in records.values()):
        touched=False
        for name,old in list(records.items()):
            p=inventory.parent/name
            if p.suffix=='.md' and p.is_file():
                new=hashlib.sha256(p.read_bytes()).hexdigest()
                if new!=old:records[name]=new;touched=True
        if touched:inventory.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
base=root/'work'/'ppo-gamma-r2'
base.mkdir(exist_ok=True)
(base/'path-corrections.json').write_text(json.dumps({'canonical_display_root':str(root),'changed':changed,
    'policy':'Frozen original ZIP archives and experiment/model manifests remain original history. Expanded readable reports use current descriptive paths.'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(changed,ensure_ascii=False,indent=2))
