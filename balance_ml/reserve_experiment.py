"""Bounded paired policy diagnostic, sharing the frontier campaign budget/deadline."""
import argparse
import datetime as dt
import hashlib
import json
import subprocess
import time
from pathlib import Path
from . import agent
from .frontier_metrics import summarize,METRICS


def queue(plan):
    dev=plan['development_seeds'];test=plan['confirmation_seeds']
    if set(dev)&set(test) or len(set(dev))!=10 or len(set(test))!=10:
        raise ValueError('Ten distinct, disjoint seeds per stage required')
    variants=plan.get('variants',['control','reserve'])
    if len(variants)!=2 or variants[0]!='control' or len(set(variants))!=2:raise ValueError('Expected control and one candidate')
    return [{'id':f'{stage}:{seed}:{variant}','stage':stage,'seed':seed,'variant':variant}
            for stage,seeds in [('development',dev),('confirmation',test)]
            for seed in seeds for variant in variants]


def allocated_today(runs,day,exclude):
    total=0;entries=[]
    for folder in runs.iterdir():
        if not folder.is_dir() or folder.name==exclude or not (folder/'manifest.json').exists():continue
        m=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        if m.get('calendar_day',m.get('created','')[:10])!=day and not folder.name.startswith(day):continue
        planned=m.get('planned_games',m.get('allocation',{}).get('frontier_planned',m.get('budget')))
        if not isinstance(planned,int) or planned<0:raise ValueError('Unrecognized daily allocation')
        total+=planned;entries.append({'run':folder.name,'planned_games':planned})
    return total,entries


def paired_report(rows,plan):
    expected={j['id'] for j in queue(plan)}
    if len(rows)!=len(expected) or {r['id'] for r in rows}!=expected:
        raise ValueError('Incomplete or duplicate paired results')
    for r in rows:
        if r['id']!=f"{r['stage']}:{r['seed']}:{r['variant']}":raise ValueError('Row identity mismatch')
        if r['result']['target']!=50 or r['result']['seed']!=r['seed']:
            raise ValueError('Result identity/target mismatch')
    candidate=plan.get('variants',['control','reserve'])[1]
    output={}
    for stage in ('development','confirmation'):
        pairs=[]
        for seed in plan[stage+'_seeds']:
            a=next(r['result'] for r in rows if r['stage']==stage and r['seed']==seed and r['variant']==candidate)
            b=next(r['result'] for r in rows if r['stage']==stage and r['seed']==seed and r['variant']=='control')
            pairs.append((seed,a,b))
        variant={}
        for index,label in [(1,candidate),(2,'control')]:
            results=[pair[index] for pair in pairs]
            variant[label]=summarize(results)
            variant[label]['castle17_games']=sum(r['castle17At'] is not None for r in results)
            variant[label]['mean_castle']=sum(r['castle'] for r in results)/len(results)
            variant[label]['storm_builds']=sum(r['actions'].get('build:storm',0) for r in results)
            if all('crystalTrace' in r for r in results):
                traces=[r['crystalTrace'] for r in results]
                variant[label]['mean_crystals_acquired']=sum(t['acquired'] for t in traces)/len(results)
                variant[label]['crystal_balance_errors']=sum(t['balanceError']!=0 for t in traces)
                keys=sorted({k for t in traces for k in t['spending']})
                variant[label]['mean_crystal_spending']={k:sum(t['spending'].get(k,0) for t in traces)/len(results) for k in keys}
        output[stage]={'variants':variant,'mean_delta':{k:sum(a[k]-b[k] for _,a,b in pairs)/len(pairs) for k in METRICS},
            'paired_wave_deltas':[{'seed':seed,'delta':a['cleared']-b['cleared']} for seed,a,b in pairs]}
    clean=not any(v['invalid_actions'] or v['time_censored'] or v.get('crystal_balance_errors',0) for s in output.values() for v in s['variants'].values())
    repeatable=all(s['mean_delta']['cleared']>0 for s in output.values())
    return {'state':'complete','stages':output,'clean_results':clean,
        'candidate':candidate,'decision':'positive_policy_signal_only' if clean and repeatable else 'no_consistent_policy_gain',
        'automatic_patch':False,'limitations':plan.get('limitations',['Ten paired seeds per stage; descriptive result, not calibrated significance.',
          'Protects potion budget only; tower upgrades and research still spend crystals.',
          'Fixed policies are not human skill samples or optimal strategies.',
          'No new ML weights trained; difficulty must be evaluated separately.'])}


class ReserveWorker(agent.Worker):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(agent.ROOT/'balance_ml/reserve-worker.mjs')],cwd=agent.ROOT,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')


class MinerWorker(agent.Worker):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(agent.ROOT/'balance_ml/miners-worker.mjs')],cwd=agent.ROOT,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    def request(self,op,**query):
        if op=='simulate':query['minerLateCap']=22 if query.pop('reserve') else 18
        return super().request(op=op,**query)


def execute(day,study='reserve'):
    if study not in ('reserve','miners22'):raise ValueError('Unknown study')
    parent=agent.RUNS/(day+'-frontier50')
    parent_progress=json.loads((parent/'progress.json').read_text(encoding='utf-8'))
    if parent_progress.get('phase')!='frontier_review' or parent_progress['state']!='complete':
        raise ValueError('Finish and review frontier campaign first')
    deadline=json.loads((parent/'time-budget.json').read_text(encoding='utf-8'))['deadline_epoch']
    if time.time()>=deadline:raise ValueError('Shared six-hour deadline expired')
    name=day+('-castle-reserve' if study=='reserve' else '-miners22');directory=agent.RUNS/name
    plan_name='reserve-plan.json' if study=='reserve' else 'miners-plan.json'
    plan=json.loads((agent.ROOT/'balance_ml'/plan_name).read_text(encoding='utf-8'))
    jobs=queue(plan)
    if len(jobs)!=plan['planned_games']:raise ValueError('Plan count mismatch')
    other,entries=allocated_today(agent.RUNS,day,name)
    if other+len(jobs)>5000:raise ValueError('Daily game cap would be exceeded')
    worker=ReserveWorker() if study=='reserve' else MinerWorker()
    try:
        description=worker.request(op='describe')
        source_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        manifest={'calendar_day':day,'fingerprint':description['fingerprint'],'runner_sha256':source_hash,
            'planned_games':len(jobs),'budget':5000,'already_allocated':entries,'total_allocated_games':other+len(jobs),
            'deadline_epoch':deadline,'plan':plan,'jobs':jobs}
        path=directory/'manifest.json'
        if path.exists() and json.loads(path.read_text(encoding='utf-8'))!=manifest:
            raise ValueError('Source/plan/allocation changed; preserve run and review')
        directory.mkdir(parents=True,exist_ok=True)
        if not path.exists():
            agent.write(path,manifest);agent.write(directory/'source-snapshot.json',description['sources'])
        journal=directory/'episodes.jsonl';rows=[]
        if journal.exists():
            raw=journal.read_bytes();valid=[]
            lines=raw.splitlines(keepends=True)
            for i,line in enumerate(lines):
                try:row=json.loads(line)
                except json.JSONDecodeError:
                    if i!=len(lines)-1:raise
                    journal.write_bytes(b''.join(valid));break
                rows.append(row);valid.append(line)
            if rows and not journal.read_bytes().endswith(b'\n'):
                with journal.open('ab') as stream:stream.write(b'\n')
        expected={j['id']:j for j in jobs};done={r['id'] for r in rows}
        if len(done)!=len(rows) or not done<=expected.keys():raise ValueError('Invalid journal IDs')
        if any(any(r[k]!=expected[r['id']][k] for k in ('stage','seed','variant')) for r in rows):
            raise ValueError('Stored job mismatch')
        for job in jobs:
            if job['id'] in done:continue
            if time.time()>=deadline:
                agent.write(directory/'progress.json',{'state':'paused','completed_games':len(rows),'reason':'Shared deadline reached'});return
            result=worker.request(op='simulate',seed=job['seed'],reserve=job['variant']!='control')
            row={**job,'result':result}
            with journal.open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(row)+'\n');stream.flush();agent.os.fsync(stream.fileno())
            rows.append(row);done.add(job['id'])
            agent.write(directory/'progress.json',{'state':'running','completed_games':len(rows),'planned_games':len(jobs)})
        report=paired_report(rows,plan);report['fingerprint']=description['fingerprint']
        report['daily_total_allocated']=other+len(jobs)
        agent.write(directory/'report.json',report)
        agent.write(directory/'progress.json',{'state':'complete','completed_games':len(rows),'planned_games':len(jobs)})
        print(json.dumps({'state':'complete','decision':report['decision'],'games':len(rows)}),flush=True)
    finally:worker.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    parser.add_argument('--day',default=today)
    parser.add_argument('--study',choices=['reserve','miners22'],default='reserve');args=parser.parse_args()
    if args.day!=today:parser.error('Only current Korean day may run')
    with agent.lock():execute(args.day,args.study)


if __name__=='__main__':main()
