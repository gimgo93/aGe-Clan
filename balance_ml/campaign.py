"""One locked daily budget: 64 frontier games + 4935 legacy ML games."""
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace
from . import agent
from .frontier_feedback import feedback
from .frontier_metrics import strategy_effects

FRONTIER_RESERVE = 65
TOTAL = 5000


def allocation(total=TOTAL):
    if total != TOTAL:
        raise ValueError('This experiment is predeclared for 5000 games only')
    return {'frontier_reserved':FRONTIER_RESERVE,'frontier_planned':64,'ml_games':total-FRONTIER_RESERVE}


def jobs(plan):
    profiles=['mixed-timing-1s','mixed-timing-02s','mixed-no-potions-02s','mixed-no-economy-02s']
    return [{'id':f'{stage}:{seed}:{policy}:{hp}', 'stage':stage,'seed':seed,'policy':policy,'hpMultiplier':hp}
            for stage,seeds in [('development',plan['development_seeds']),('confirmation',plan['confirmation_seeds'])]
            for seed in seeds for policy in profiles for hp in [1,1.05]]


def ensure_day_available(runs, day, campaign_name, ml_name):
    for directory in runs.iterdir():
        if not directory.is_dir() or directory.name in (campaign_name,ml_name):
            continue
        # Legacy date-prefixed runs already reserve the full daily budget.
        if directory.name.startswith(day) and (directory/'manifest.json').exists():
            raise ValueError('Existing daily run reserves this day; finish it and use a later day')


class FrontierWorker(agent.Worker):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(agent.ROOT/'balance_ml/frontier-worker.mjs')],cwd=agent.ROOT,
                                   stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')


def execute(day, max_seconds=21600):
    budget=allocation(); began=time.monotonic()
    name=day+'-frontier50';ml_name=day+'-ml40'
    ensure_day_available(agent.RUNS,day,name,ml_name)
    directory=agent.RUNS/name;directory.mkdir(parents=True,exist_ok=True)
    quota_path=directory/'time-budget.json'
    if quota_path.exists():
        deadline=json.loads(quota_path.read_text(encoding='utf-8'))['deadline_epoch']
    else:
        deadline=time.time()+max_seconds
        agent.write(quota_path,{'deadline_epoch':deadline})
    # Persist the original wall-clock deadline; restarting cannot reset six hours.
    max_seconds=min(max_seconds,max(0,deadline-time.time()))
    if max_seconds<=0:
        agent.write(directory/'progress.json',{'state':'paused','reason':'Original time budget expired; review next-day allocation'})
        return
    worker=FrontierWorker()
    try:
        description=worker.request(op='describe')
        plan=json.loads((agent.ROOT/'balance_ml/frontier50-plan.json').read_text(encoding='utf-8'))
        queue=jobs(plan)
        if len(queue)!=64:raise ValueError('Unexpected frontier plan size')
        manifest={'fingerprint':description['fingerprint'],'budget':TOTAL,'allocation':budget,'jobs':queue}
        path=directory/'manifest.json'
        if path.exists():
            if json.loads(path.read_text(encoding='utf-8')) != manifest:
                raise ValueError('Campaign source/plan changed; preserve old run and review a new plan')
        else:
            agent.write(path,manifest);agent.write(directory/'source-snapshot.json',description['sources'])
        journal=directory/'episodes.jsonl';rows=[]
        if journal.exists():
            raw=journal.read_bytes();lines=raw.splitlines(keepends=True);valid=[]
            for i,line in enumerate(lines):
                try:rows.append(json.loads(line));valid.append(line)
                except json.JSONDecodeError:
                    if i!=len(lines)-1:raise
                    journal.write_bytes(b''.join(valid))
            if rows and not journal.read_bytes().endswith(b'\n'):
                with journal.open('ab') as stream:stream.write(b'\n')
        done={r['id'] for r in rows}
        if len(done)!=len(rows) or not done <= {j['id'] for j in queue}:
            raise ValueError('Invalid campaign journal IDs')
        for job in queue:
            if job['id'] in done:continue
            if time.monotonic()-began>=max_seconds:
                agent.write(directory/'progress.json',{'state':'paused','phase':'frontier','completed_games':len(rows)});return
            result=worker.request(op='simulate',**{k:job[k] for k in ['seed','policy','hpMultiplier']})
            row={**job,'result':result}
            with journal.open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(row)+'\n');stream.flush();agent.os.fsync(stream.fileno())
            rows.append(row)
            agent.write(directory/'progress.json',{'state':'running','phase':'frontier','completed_games':len(rows)})
        summaries={}
        for stage in ['development','confirmation']:
            for policy in description['profiles']:
                for hp in [1,1.05]:
                    rs=[r['result'] for r in rows if r['stage']==stage and r['policy']==policy['id'] and r['hpMultiplier']==hp]
                    summaries[f'{stage}:{policy["id"]}:{hp}']={
                        'games':len(rs),'mean_cleared':sum(r['cleared'] for r in rs)/len(rs),
                        'reached40':sum(r['cleared']>=40 for r in rs),'reached50':sum(r['cleared']>=50 for r in rs),
                        'invalid_actions':sum(r['invalid'] for r in rs),'time_censored':sum(r['end']=='time_limit' for r in rs)}
        agent.write(directory/'frontier-report.json',{'fingerprint':description['fingerprint'],'summaries':summaries,
                    'feedback':feedback(rows),'strategy_effects':strategy_effects(rows),'recommendation':'review_only','limitations':['Fixed policies are not optimal strategies or human skill cohorts.',
                    'If no baseline policy reaches50, improve strategy before adopting harder late waves.']})
    finally:worker.close()
    remaining=int(max_seconds-(time.monotonic()-began))
    ml_progress=agent.RUNS/ml_name/'progress.json'
    already_complete=ml_progress.exists() and json.loads(ml_progress.read_text(encoding='utf-8')).get('state')=='complete'
    if remaining>0 and not already_complete:
        agent.execute(SimpleNamespace(run=ml_name,games=budget['ml_games'],seed=24601,max_seconds=remaining))
    ml_progress=agent.RUNS/ml_name/'progress.json'
    state=json.loads(ml_progress.read_text(encoding='utf-8'))['state'] if ml_progress.exists() else 'paused'
    agent.write(directory/'progress.json',{'state':state,'phase':'ml40','frontier_games':len(rows),
                'ml_run':ml_name,'daily_reserved_games':TOTAL})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    # Use Korean calendar day even when the host timezone differs.
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    parser.add_argument('--day',default=today)
    parser.add_argument('--plan-only',action='store_true')
    args=parser.parse_args()
    if args.day!=today:parser.error('Only the current Korean calendar day may run')
    if args.plan_only:
        print(json.dumps(allocation()));return
    with agent.lock():execute(args.day)


if __name__=='__main__':main()
