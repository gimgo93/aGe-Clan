import hashlib
import json
from pathlib import Path
import zipfile


root = Path(__file__).resolve().parent.parent / 'outputs'
bundle = root / 'ppo_execution'
inventory = bundle / 'artifact-inventory.json'
records = {str(path.relative_to(bundle)).replace('\\', '/'): {
    'bytes': path.stat().st_size,
    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
} for path in sorted(bundle.rglob('*')) if path.is_file() and path != inventory}
inventory.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
archive = root / 'PPO_실험자료_2026-11-07.zip'
paths = [root / 'PPO_실행결과_2026-11-07.md', *sorted(bundle.rglob('*'))]
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6,
                     strict_timestamps=False) as output:
    for path in paths:
        if path.is_file():
            output.write(path, path.relative_to(root))
with zipfile.ZipFile(archive) as check:
    assert check.testzip() is None
    for relative, record in records.items():
        data = check.read('ppo_execution/' + relative)
        assert len(data) == record['bytes']
        assert hashlib.sha256(data).hexdigest() == record['sha256']
print(json.dumps({'files': len(records), 'zip_bytes': archive.stat().st_size,
                  'archive': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()},
                 ensure_ascii=False))
