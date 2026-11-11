import json

from ppo_continuation import OUTPUT, eval_saved
from ml.experiment import write_json


summary = json.loads((OUTPUT / 'summary.json').read_text(encoding='utf-8'))
assert summary['confirmation']['scripted'], 'Run the predeclared comparison before this diagnostic.'
for seed in (42, 43):
    run = OUTPUT / f'seed-{seed}/imitation-initial'
    result = eval_saved(run, 230000, 20, f'confirmation-seed-{seed}-imitation-initial')
    summary['confirmation'][f'seed-{seed}-imitation-initial'] = result['summary']
    write_json(OUTPUT / 'summary.json', summary)
