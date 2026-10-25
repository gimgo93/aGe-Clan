"""Bounded local completion follow-through: diagnostics only, no new games."""
import argparse
import json
import os
from pathlib import Path
import time
from .audit import audit_run
from .compare import compare
from .agent import write


def finalize(directory):
    directory=Path(directory)
    output=directory/'analysis-complete.json'
    if output.exists():
        return {'state':'already_analyzed','path':str(output)}
    audit=audit_run(directory)
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    report=json.loads((directory/'report.json').read_text(encoding='utf-8'))
    rows=[json.loads(line) for line in (directory/'episodes.jsonl').read_text(encoding='utf-8').splitlines()]
    comparison=compare(rows,manifest['schema'],manifest['policies'])
    result={'state':'complete','fingerprint':audit['fingerprint'],'completed_games':audit['completed_games'],
            'original_recommendation':report['recommendation'],'original_reasons':report['reasons'],
            'audit':audit,'ridge_comparison':comparison,
            'automatic_model_replacement':False,'automatic_patch':False,
            'note':'Ridge comparison diagnoses prediction quality; original fresh-game validation used the original model.'}
    write(output,result)
    return {'state':'analyzed','path':str(output),'recommendation':report['recommendation']}


def follow(directory, wait_seconds=0, poll_seconds=10):
    directory=Path(directory)
    if not directory.is_dir():raise ValueError('Run directory does not exist')
    if not 0<=wait_seconds<=21600 or not 0<poll_seconds<=60:
        raise ValueError('Invalid bounded wait')
    lock=directory/'analysis.lock'
    try:handle=lock.open('x',encoding='utf-8')
    except FileExistsError:raise ValueError('Analysis already reserved; inspect its PID before removing a stale lock')
    try:
        with handle:json.dump({'pid':os.getpid(),'started_epoch':time.time()},handle)
        deadline=time.monotonic()+wait_seconds
        while True:
            if (directory/'analysis-complete.json').exists():return {'state':'already_analyzed'}
            progress=json.loads((directory/'progress.json').read_text(encoding='utf-8'))
            state=progress.get('state')
            if state=='complete':return finalize(directory)
            if state in ('failed','paused'):
                return {'state':'not_analyzed','run_state':state,'reason':progress.get('reason')}
            if state!='running':raise ValueError('Unknown run state')
            remaining=deadline-time.monotonic()
            if remaining<=0:return {'state':'pending','reason':'Bounded completion wait expired'}
            time.sleep(min(poll_seconds,remaining))
    finally:lock.unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',required=True)
    parser.add_argument('--wait-seconds',type=int,default=0)
    args=parser.parse_args()
    try:result=follow(args.run,args.wait_seconds)
    except (ValueError,FileNotFoundError) as error:parser.error(str(error))
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
