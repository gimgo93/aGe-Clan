"""Six fresh diagnostic games with crystal conservation, not policy selection or ML fitting."""
import argparse
import datetime as dt
import hashlib
import json
import subprocess
import time
from pathlib import Path
from . import agent
from .reserve_experiment import allocated_today
from .frontier_metrics import summarize

SEEDS=tuple(range(71001,71007))


def summarize_resources(rows):
    if len(rows)!=len(SEEDS) or {r['seed'] for r in rows}!=set(SEEDS):raise ValueError('Missing/duplicate diagnostic seed')
    for row in rows:
        r=row['result'];t=r['crystalTrace']
        if r['target']!=50 or r['seed']!=row['seed']:raise ValueError('Result identity mismatch')
        if t['balanceError']!=0 or t['final']!=r['crystals'] or t['initial']+t['acquired']-t['spent']!=r['crystals']:
            raise ValueError('Crystal conservation mismatch')
        if sum(t['spending'].values())!=t['spent'] or sum(e['amount'] for e in t['events'])!=t['spent']:
            raise ValueError('Spend ledger mismatch')
    rs=[r['result'] for r in rows];traces=[r['crystalTrace'] for r in rs]
    keys=sorted({k for t in traces for k in t['spending']})
    return {'state':'complete','games':len(rows),'outcomes':summarize(rs),
      'mean_acquired':sum(t['acquired'] for t in traces)/len(rows),
      'mean_initial':sum(t['initial'] for t in traces)/len(rows),
      'mean_spent':sum(t['spent'] for t in traces)/len(rows),
      'mean_final':sum(t['final'] for t in traces)/len(rows),
      'mean_spending':{k:sum(t['spending'].get(k,0) for t in traces)/len(rows) for k in keys},
      'castle_wait_decisions':sum(t['castleWaitDecisions'] for t in traces),
      'mean_wait_seconds_per_game':sum(t['castleWaitDecisions']*.2 for t in traces)/len(rows),
      'castle17_games':sum(r['castle17At'] is not None for r in rs),
      'individual':[{'seed':r['seed'],'cleared':r['cleared'],'castle':r['castle'],
        'acquired':r['crystalTrace']['acquired'],'spent':r['crystalTrace']['spent'],
        'final':r['crystals'],'wait_by_castle':r['crystalTrace']['waitByCastle']} for r in rs],
      'automatic_patch':False,'limitations':['Six diagnostic seeds, not policy confirmation or human difficulty samples.',
        'Wait decisions measure observed unaffordability, not proven causal benefit of saving.',
        'No model fitting or policy selection from this diagnostic.']}


class CrystalWorker(agent.Worker):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(agent.ROOT/'balance_ml/crystal-worker.mjs')],cwd=agent.ROOT,
          stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')


def execute(day):
    parent=agent.RUNS/(day+'-frontier50')
    if json.loads((parent/'progress.json').read_text(encoding='utf-8'))['state']!='complete':
        raise ValueError('Completed parent campaign required')
    deadline=json.loads((parent/'time-budget.json').read_text(encoding='utf-8'))['deadline_epoch']
    if time.time()>=deadline:raise ValueError('Shared deadline expired')
    name=day+'-crystal-diagnostic';directory=agent.RUNS/name
    allocated,entries=allocated_today(agent.RUNS,day,name)
    if allocated+len(SEEDS)>5000:raise ValueError('Daily cap exceeded')
    worker=CrystalWorker()
    try:
        d=worker.request(op='describe')
        manifest={'calendar_day':day,'fingerprint':d['fingerprint'],'planned_games':len(SEEDS),
          'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'seeds':SEEDS,'deadline_epoch':deadline,'already_allocated':entries,'total_allocated_games':allocated+len(SEEDS)}
        # JSON canonicalization turns seed tuples into lists before resume comparison.
        manifest=json.loads(json.dumps(manifest));path=directory/'manifest.json'
        if path.exists() and json.loads(path.read_text(encoding='utf-8'))!=manifest:raise ValueError('Source/plan changed')
        directory.mkdir(parents=True,exist_ok=True)
        if not path.exists():agent.write(path,manifest);agent.write(directory/'source-snapshot.json',d['sources'])
        journal=directory/'episodes.jsonl';rows=[]
        if journal.exists():
            lines=journal.read_bytes().splitlines(keepends=True);valid=[]
            for i,line in enumerate(lines):
                try:row=json.loads(line)
                except json.JSONDecodeError:
                    if i!=len(lines)-1:raise
                    journal.write_bytes(b''.join(valid));break
                rows.append(row);valid.append(line)
            if rows and not journal.read_bytes().endswith(b'\n'):
                with journal.open('ab') as f:f.write(b'\n')
        done={r['seed'] for r in rows}
        if len(done)!=len(rows) or not done<=set(SEEDS):raise ValueError('Invalid journal seeds')
        for seed in SEEDS:
            if seed in done:continue
            if time.time()>=deadline:
                agent.write(directory/'progress.json',{'state':'paused','completed_games':len(rows)});return
            result=worker.request(op='simulate',seed=seed)
            row={'id':f'diagnostic:{seed}','seed':seed,'result':result}
            with journal.open('a',encoding='utf-8') as f:
                f.write(json.dumps(row)+'\n');f.flush();agent.os.fsync(f.fileno())
            rows.append(row)
            agent.write(directory/'progress.json',{'state':'running','completed_games':len(rows),'planned_games':len(SEEDS)})
        report=summarize_resources(rows);report['fingerprint']=d['fingerprint']
        report['daily_total_allocated']=allocated+len(SEEDS)
        agent.write(directory/'report.json',report)
        agent.write(directory/'progress.json',{'state':'complete','completed_games':len(rows),'planned_games':len(SEEDS)})
        print(json.dumps({'state':'complete','games':len(rows),'daily_total_allocated':allocated+len(SEEDS)}),flush=True)
    finally:worker.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    p.add_argument('--day',default=today);args=p.parse_args()
    if args.day!=today:p.error('Only current Korean calendar day may run')
    with agent.lock():execute(args.day)


if __name__=='__main__':main()
