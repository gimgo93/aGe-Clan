"""Resumable local simulation -> learned surrogate -> paired validation agent."""
import os
# Set before importing numpy: one numerical CPU thread per agent.
for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ[key]='1'
import argparse
import contextlib
import datetime as dt
import hashlib
import json
from pathlib import Path
import random
import subprocess
import time
from .model import Surrogate

ROOT=Path(__file__).resolve().parent.parent
RUNS=ROOT/'balance_ml/runs'
TARGETS=[13,15,20,30,40]  # Controller proxies, never claimed as human skill cohorts.


def write(path,value):
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(path)


class Worker:
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(ROOT/'balance_ml/worker.mjs')],cwd=ROOT,
                                   stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    def request(self,**query):
        self.proc.stdin.write(json.dumps(query)+'\n');self.proc.stdin.flush()
        line=self.proc.stdout.readline()
        if not line:raise RuntimeError('Simulation worker exited')
        result=json.loads(line)
        if not result['ok']:raise ValueError(result['error'])
        return result['result']
    def close(self):
        self.proc.stdin.close()
        try:self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait()
        self.proc.stdout.close()


def sample(schema,rng):
    key=rng.choice(list(schema));s=schema[key]
    value=rng.uniform(s['min'],s['max'])
    value=round(value) if s['integer'] else round(value,5)
    return {key:s['min'] if value==s['base'] else value}


def score(clears):
    return sum(abs(v-t) for v,t in zip(clears,TARGETS))/len(TARGETS)


def summarize(rows,policies):
    out={}
    for p in policies:
        rs=[r['result'] for r in rows if r['policy']==p]
        if not rs:continue
        out[p]={k:sum(r[k] for r in rs)/len(rs) for k in ['cleared','hp','kills','leaks','damage','destroyed','time']}
        out[p].update(games=len(rs),max_cleared=max(r['cleared'] for r in rs),
                      invalid_actions=sum(r['invalid'] for r in rs),
                      invalid_action_rate=sum(r['invalid'] for r in rs)/max(1,sum(r['invalid']+sum(r['actions'].values()) for r in rs)),
                      time_censored=sum(r['end']=='time_limit' for r in rs),
                      reached={str(n):sum(r['cleared']>=n for r in rs) for n in [15,16,20,30,40]},
                      actions={a:sum(r['actions'].get(a,0) for r in rs) for a in sorted({a for r in rs for a in r['actions']})})
    return out


@contextlib.contextmanager
def lock():
    RUNS.mkdir(parents=True,exist_ok=True)
    path=RUNS/'agent.lock'
    try:handle=path.open('x',encoding='utf-8')
    except FileExistsError:raise RuntimeError('Agent lock exists. Check recorded PID; remove only after confirming process stopped.')
    try:
        with handle:json.dump({'pid':os.getpid(),'started':dt.datetime.now().isoformat()},handle)
        yield
    finally:path.unlink(missing_ok=True)


def execute(args):
    directory=RUNS/args.run
    directory.mkdir(parents=True,exist_ok=True)
    worker=Worker();began=time.monotonic()
    try:
        description=worker.request(op='describe');schema=description['schema'];policies=description['policies']
        previous_report=json.loads((directory/'report.json').read_text(encoding='utf-8')) if (directory/'report.json').exists() else {}
        manifest_path=directory/'manifest.json'
        if manifest_path.exists():
            manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
            if manifest['fingerprint']!=description['fingerprint'] or manifest['budget']!=args.games or manifest['seed']!=args.seed:
                raise ValueError('Resume requires identical source fingerprint, budget and seed; use a new run name')
        else:
            manifest={'fingerprint':description['fingerprint'],'budget':args.games,'seed':args.seed,
                      'created':dt.datetime.now().isoformat(),'schema':schema,'policies':policies}
            write(manifest_path,manifest);write(directory/'source-snapshot.json',description['sources'])
            write(directory/'hypothesis.json',{'hypothesis':'A one-parameter change can reduce controller progression target error while retaining archer cap.',
                 'method':'Random-feature ridge ensemble; configuration holdout; paired development; fresh confirmation',
                 'targets':dict(zip(policies,TARGETS)),'promotion':'Surrogate beats constant-policy holdout, fresh paired score improves by >=0.5 waves; no errors/censoring',
                 'scope':'Solo only. Human skill, PvP and live telemetry are unmeasured. No automatic production patch.'})
        journal=directory/'episodes.jsonl';rows=[]
        if journal.exists():
            # Recover an interrupted final append; never accept corrupted middle records.
            content=journal.read_bytes();lines=content.splitlines(keepends=True);valid=[]
            for i,line in enumerate(lines):
                try:rows.append(json.loads(line));valid.append(line)
                except json.JSONDecodeError:
                    if i!=len(lines)-1:raise
                    journal.write_bytes(b''.join(valid))
            if rows and journal.read_bytes() and not journal.read_bytes().endswith(b'\n'):
                with journal.open('ab') as stream:stream.write(b'\n')
        completed={r['id'] for r in rows}
        if len(completed)!=len(rows):raise ValueError('Duplicate journal IDs')
        def simulate(stage,candidate,params,seed,policy):
            identity=f'{stage}:{candidate}:{seed}:{policy}'
            if identity in completed:
                existing=next(r for r in rows if r['id']==identity)
                if existing['params']!=params:raise ValueError('Resumed job parameters changed')
                return
            if time.monotonic()-began>=args.max_seconds:raise TimeoutError('Wall-time budget reached; resume same command')
            started=time.monotonic()
            result=worker.request(op='simulate',params=params,seed=seed,policy=policy)
            row={'id':identity,'stage':stage,'candidate':candidate,'params':params,'seed':seed,'policy':policy,'result':result,'wall_seconds':time.monotonic()-started}
            with journal.open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(row)+'\n');stream.flush();os.fsync(stream.fileno())
            rows.append(row);completed.add(identity)
            write(directory/'progress.json',{'state':'running','completed_games':len(rows),'budget':args.games,'pid':os.getpid()})
        # 110 full games reserved for paired development (60) and untouched confirmation (50).
        data_games=args.games-110
        rng=random.Random(args.seed)
        configurations=[{}]+[sample(schema,rng) for _ in range(data_games//5-1)]
        plan_path=directory/'data-plan.json'
        if plan_path.exists():configurations=json.loads(plan_path.read_text(encoding='utf-8'))
        else:
            for row in rows:
                if row['stage']=='data':configurations[int(row['candidate'])]=row['params']
            write(plan_path,configurations)
        for i,params in enumerate(configurations):
            for policy in policies:simulate('data',str(i),params,args.seed+i//10,policy)
        model=Surrogate(schema,policies);metrics=model.fit([r for r in rows if r['stage']=='data'])
        model.save(directory/'surrogate.npz')
        candidates={}
        for _ in range(512):
            params=sample(schema,rng)
            key=json.dumps(params,sort_keys=True)
            candidates[key]=(score([model.predict(params,p)[0] for p in policies]),params)
        selected=[x[1] for x in sorted(candidates.values(),key=lambda x:x[0])[:3]]
        search_path=directory/'search.json'
        if search_path.exists():selected=json.loads(search_path.read_text(encoding='utf-8'))['selected']
        else:write(search_path,{'evaluated_configurations':len(candidates),'selected':selected,'metrics':metrics})
        for i,params in enumerate([{}]+selected):
            for seed in range(args.seed+100000,args.seed+100003):
                for policy in policies:simulate('development',str(i),params,seed,policy)
        def stage_summary(stage,candidate):return summarize([r for r in rows if r['stage']==stage and r['candidate']==str(candidate)],policies)
        def objective(summary):return score([summary[p]['cleared'] for p in policies])
        best=min(range(1,4),key=lambda i:objective(stage_summary('development',i)))
        chosen=selected[best-1]
        for candidate,params in [('baseline',{}),('candidate',chosen)]:
            for seed in range(args.seed+200000,args.seed+200005):
                for policy in policies:simulate('confirmation',candidate,params,seed,policy)
        control=stage_summary('confirmation','baseline');test=stage_summary('confirmation','candidate')
        improvement=objective(control)-objective(test)
        reasons=[]
        if metrics['holdout_mae_waves']>=metrics['constant_policy_mae_waves']:reasons.append('Surrogate did not outperform constant-policy holdout baseline')
        if improvement<.5:reasons.append('Fresh-seed objective improvement below 0.5 waves')
        if any(s['invalid_actions'] or s['time_censored'] for s in list(control.values())+list(test.values())):reasons.append('Invalid actions or time-censored games')
        seconds=time.monotonic()-began
        timed=[r for r in rows if 'wall_seconds' in r]
        per_game=(sum(r['wall_seconds'] for r in timed)/len(timed) if timed else
                  previous_report.get('measured_seconds_per_game',previous_report.get('invocation_wall_seconds',seconds)/len(rows)))
        # Throughput uses persisted per-game timing separately below on fresh runs only.
        report={'state':'complete','completed_games':len(rows),'budget':args.games,'fingerprint':manifest['fingerprint'],
                'model':metrics,'candidate':chosen,'recommendation':'review_candidate' if not reasons else 'no_patch',
                'reasons':reasons,'fresh_score_improvement':improvement,'baseline':control,'confirmation':test,
                'invocation_wall_seconds':seconds,'measured_seconds_per_game':per_game,
                'throughput_measurement_seconds':per_game*(len(timed) if timed else len(rows)),
                'throughput_basis':'per-game wall timings' if timed else 'original completed run wall time including training overhead',
                'estimated_simulation_hours':{str(n):per_game*n/3600 for n in [5000,10000]},
                'automation':'Local feedback only; no deployment or code application',
                'limitations':['Fixed controllers are not human skill cohorts','Solo only; PvP unvalidated','Ensemble spread is not calibrated','Only tower damage/cost, starting gold and solo arrow armor searched; potion/economy behavior observed but their constants not tuned']}
        write(directory/'report.json',report);write(directory/'progress.json',{'state':'complete','completed_games':len(rows),'budget':args.games})
        text='# Local balance ML feedback\n\n'+f"Completed full games: {len(rows)} / {args.games}\n\nRecommendation: {report['recommendation']}\n\n"+'\n'.join('- '+r for r in reasons)+f'\n\nHoldout MAE: {metrics["holdout_mae_waves"]:.3f} waves; constant-policy baseline: {metrics["constant_policy_mae_waves"]:.3f}.\n\nFresh paired improvement: {improvement:.3f} waves.\n\n'+ '\n'.join('- '+r for r in report['limitations'])+'\n\nSee report.json for HP, kills, leaks, survival, invalid actions and facility use. No live deployment.\n'
        (directory/'REPORT.md').write_text(text,encoding='utf-8')
        print(json.dumps({k:report[k] for k in ['state','completed_games','recommendation','reasons','invocation_wall_seconds']}),flush=True)
    except TimeoutError as error:
        write(directory/'progress.json',{'state':'paused','completed_games':len(rows),'budget':args.games,'reason':str(error)})
        print(str(error),flush=True)
    except Exception as error:
        write(directory/'progress.json',{'state':'failed','reason':str(error)})
        raise
    finally:worker.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',default=dt.date.today().isoformat())
    parser.add_argument('--games',type=int,default=5000)
    parser.add_argument('--seed',type=int,default=24601)
    parser.add_argument('--max-seconds',type=int,default=21600)
    parser.add_argument('--status',action='store_true')
    args=parser.parse_args()
    if Path(args.run).name!=args.run or args.run in ('.','..'):parser.error('run must be a directory name')
    if args.games<200 or args.games>10000 or args.games%5:parser.error('games must be a multiple of 5 between 200 and 10000')
    if not 0<=args.seed<2**32-300000:parser.error('seed outside supported range')
    if args.max_seconds<1:parser.error('max-seconds must be positive')
    if args.status:
        path=RUNS/args.run/'progress.json';print(path.read_text(encoding='utf-8') if path.exists() else 'not_started');return
    with lock():execute(args)


if __name__=='__main__':main()
