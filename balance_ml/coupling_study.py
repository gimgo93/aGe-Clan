"""Predeclared random-protocol benchmark only. No model fitting or policy adoption."""
import argparse
import datetime as dt
import hashlib
import json
import statistics
import subprocess
import time
from pathlib import Path
from . import agent
from .reserve_experiment import allocated_today
from .frontier_metrics import summarize

EVENT='event-sha256-u32-v1'


def jobs(plan):
    seeds=plan['seeds']
    if len(seeds)!=8 or len(set(seeds))!=8 or any(type(s) is not int or not 0<=s<2**32 for s in seeds):
        raise ValueError('Eight distinct valid benchmark seeds required')
    if plan['rng_modes']!=['legacy-lcg',EVENT] or plan['miner_caps']!=[18,22] or plan['target_wave']!=50 or plan['decision_ticks']!=2:
        raise ValueError('Unsupported predeclared benchmark factors')
    queue=[{'id':f'{mode}:{seed}:{cap}','stage':'method_benchmark','seed':seed,'rng_mode':mode,'miner_cap':cap}
           for seed in seeds for mode in plan['rng_modes'] for cap in plan['miner_caps']]
    if len(queue)!=plan['planned_games']:raise ValueError('Plan count mismatch')
    return queue


def sample_map(result):
    audit=result['randomAudit']
    if audit['protocol']!=EVENT:raise ValueError('Random audit protocol mismatch')
    output={}
    for sample in audit['samples']:
        key=(sample['stream'],tuple(sample['event']),sample['draw'])
        if key in output or not 0<=sample['value']<1:raise ValueError('Invalid random audit sample')
        output[key]=sample['value']
    return output


def analyze(rows,plan):
    expected={j['id']:j for j in jobs(plan)}
    if len(rows)!=len(expected) or {r['id'] for r in rows}!=expected.keys():raise ValueError('Incomplete/duplicate benchmark')
    indexed={}
    for row in rows:
        if any(row[k]!=expected[row['id']][k] for k in ('stage','seed','rng_mode','miner_cap')):
            raise ValueError('Job identity mismatch')
        r=row['result'];trace=r['crystalTrace']
        if r['seed']!=row['seed'] or r['target']!=50 or r['rngProtocol']!=row['rng_mode'] or r['minerCap']!=row['miner_cap']:
            raise ValueError('Result protocol/identity mismatch')
        if trace['balanceError']!=0 or trace['initial']+trace['acquired']-trace['spent']!=r['crystals']:
            raise ValueError('Resource ledger mismatch')
        indexed[row['rng_mode'],row['seed'],row['miner_cap']]=r
    output={};audits=[]
    for mode in plan['rng_modes']:
        differences=[]
        for seed in plan['seeds']:
            a=indexed[mode,seed,22];b=indexed[mode,seed,18]
            differences.append({'seed':seed,'delta':a['cleared']-b['cleared']})
            if mode==EVENT:
                x=sample_map(a);y=sample_map(b);common=x.keys()&y.keys()
                if not any(k[0]=='mine' for k in common):raise ValueError('Missing shared mining audit')
                mismatches=sum(x[k]!=y[k] for k in common)
                if mismatches:raise ValueError('Shared event random values differ')
                audits.append({'seed':seed,'shared_samples':len(common),'mismatches':mismatches})
        values=[r['delta'] for r in differences]
        summaries={str(cap):summarize([indexed[mode,seed,cap] for seed in plan['seeds']]) for cap in (18,22)}
        output[mode]={'pairs':len(values),'mean_wave_delta':statistics.mean(values),
            'sample_variance_of_wave_delta':statistics.variance(values),
            'paired_deltas':differences,'policies':summaries}
    clean=not any(v['invalid_actions'] or v['time_censored'] for mode in output.values() for v in mode['policies'].values())
    legacy=output['legacy-lcg']['sample_variance_of_wave_delta'];event=output[EVENT]['sample_variance_of_wave_delta']
    return {'state':'complete','decision':'method_diagnostic_only','clean_results':clean,'protocols':output,
      'common_event_audits':audits,'observed_variance_ratio_event_to_legacy':event/legacy if legacy else None,
      'automatic_patch':False,'limitations':['Eight fixed seed pairs per mode; descriptive variance, no significance or optimality guarantee.',
        'New random protocol changes deterministic trajectories; never pool these rows with legacy data.',
        'Audit samples are bounded; full event identity follows the keyed algorithm, not an identical world state.',
        'Different towers, workers and survival still create different endogenous outcomes.',
        'No model training, policy selection or balance adoption.']}


class CouplingWorker(agent.Worker):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(agent.ROOT/'balance_ml/coupling-worker.mjs')],cwd=agent.ROOT,
          stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')


def execute(day):
    name=day+'-rng-coupling';directory=agent.RUNS/name
    plan=json.loads((agent.ROOT/'balance_ml/coupling-plan.json').read_text(encoding='utf-8'));queue=jobs(plan)
    other,entries=allocated_today(agent.RUNS,day,name)
    if other+len(queue)>5000:raise ValueError('Daily cap exceeded')
    directory.mkdir(parents=True,exist_ok=True)
    clock=directory/'time-budget.json'
    if clock.exists():deadline=json.loads(clock.read_text(encoding='utf-8'))['deadline_epoch']
    else:
        # Share the earliest first-start deadline of any study already allocated today.
        deadlines=[]
        for entry in entries:
            folder=agent.RUNS/entry['run']
            for path in [folder/'manifest.json',folder/'time-budget.json']:
                if path.exists():
                    data=json.loads(path.read_text(encoding='utf-8'))
                    if 'deadline_epoch' in data:deadlines.append(data['deadline_epoch'])
                    elif 'created' in data:
                        created=dt.datetime.fromisoformat(data['created'])
                        if created.tzinfo is None:created=created.replace(tzinfo=dt.timezone(dt.timedelta(hours=9)))
                        deadlines.append(created.timestamp()+21600)
        deadline=min([time.time()+21600]+deadlines)
        agent.write(clock,{'deadline_epoch':deadline})
    if time.time()>=deadline:raise ValueError('Original daily deadline expired')
    worker=CouplingWorker()
    try:
        d=worker.request(op='describe')
        manifest={'calendar_day':day,'fingerprint':d['fingerprint'],'planned_games':len(queue),
          'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'plan':plan,
          'deadline_epoch':deadline,'already_allocated':entries,'total_allocated_games':other+len(queue)}
        path=directory/'manifest.json'
        if path.exists() and json.loads(path.read_text(encoding='utf-8'))!=manifest:raise ValueError('Source/plan/allocation changed')
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
        expected={j['id']:j for j in queue};done={r['id'] for r in rows}
        if len(done)!=len(rows) or not done<=expected.keys():raise ValueError('Invalid journal IDs')
        for row in rows:
            if any(row[k]!=expected[row['id']][k] for k in ('stage','seed','rng_mode','miner_cap')):
                raise ValueError('Stored job mismatch')
        for job in queue:
            if job['id'] in done:continue
            if time.time()>=deadline:
                agent.write(directory/'progress.json',{'state':'paused','completed_games':len(rows),'reason':'Original deadline reached'});return
            started=time.monotonic()
            result=worker.request(op='simulate',seed=job['seed'],rngMode=job['rng_mode'],minerCap=job['miner_cap'])
            row={**job,'result':result,'wall_seconds':time.monotonic()-started}
            with journal.open('a',encoding='utf-8') as f:
                f.write(json.dumps(row)+'\n');f.flush();agent.os.fsync(f.fileno())
            rows.append(row)
            agent.write(directory/'progress.json',{'state':'running','completed_games':len(rows),'planned_games':len(queue)})
        report=analyze(rows,plan);report.update(fingerprint=d['fingerprint'],daily_total_allocated=other+len(queue))
        agent.write(directory/'report.json',report)
        agent.write(directory/'progress.json',{'state':'complete','completed_games':len(rows),'planned_games':len(queue)})
        print(json.dumps({'state':'complete','games':len(rows),'decision':report['decision']}),flush=True)
    finally:worker.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    parser.add_argument('--day',default=today);args=parser.parse_args()
    if args.day!=today:parser.error('Only current Korean day may run')
    with agent.lock():execute(args.day)


if __name__=='__main__':main()
