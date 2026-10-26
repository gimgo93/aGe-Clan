"""Offline effect-model readiness/training. Never starts games or changes game balance."""
import argparse
import json
from pathlib import Path
from .effect_data import extract_pairs
from .effect_model import EffectModel
from .model import group


def split_pairs(pairs):
    """Evaluate only on the intersection of unseen configurations AND unseen seeds."""
    configs=sorted({group(p['params']) for p in pairs})
    seeds=sorted({p['seed'] for p in pairs})
    held_configs=set(configs[::5]);held_seeds=set(seeds[::5])
    train=[];test=[];cross=[]
    for p in pairs:
        c=group(p['params']) in held_configs;s=p['seed'] in held_seeds
        (test if c and s else train if not c and not s else cross).append(p)
    return train,test,cross


def train_effect(pairs,schema,policies,target_wave,fingerprint):
    # Validate identity even when the sample is too small to fit.
    validator=EffectModel(schema,policies,target_wave,fingerprint)
    for p in pairs:
        if p['fingerprint']!=fingerprint or p['target_wave']!=target_wave:
            raise ValueError('Mixed dataset source or target')
        validator._validate(p['params'],p['policy'])
    eligible=[p for p in pairs if p['relevant_use']]
    configs={group(p['params']) for p in eligible};seeds={p['seed'] for p in eligible}
    report={'state':'insufficient_paired_data','target_wave':target_wave,'fingerprint':fingerprint,
        'matched_pairs':len(pairs),'exposed_pairs':len(eligible),'exposed_configurations':len(configs),
        'exposed_seeds':len(seeds),'minimum_configurations':10,'minimum_seeds':10,
        'limitations':['Fixed policies are not human skill samples.',
            'Built towers are minimum exposure evidence, not proof of firing or damage.',
            'Ensemble spread is not a calibrated confidence interval.',
            'No automatic game patch or model adoption.']}
    if len(configs)<10 or len(seeds)<10:return None,report
    train,test,cross=split_pairs(eligible)
    report['split']={'train_pairs':len(train),'test_pairs':len(test),'unused_cross_pairs':len(cross),
        'train_seeds':sorted({p['seed'] for p in train}),'test_seeds':sorted({p['seed'] for p in test}),
        'train_configurations':sorted({group(p['params']) for p in train}),
        'test_configurations':sorted({group(p['params']) for p in test})}
    if any(len({p['seed'] for p in train if p['policy']==policy})<3 or
           not any(p['policy']==policy for p in test) for policy in policies):
        report['reason']='Insufficient training/test policy coverage';return None,report
    model=validator.fit(train)
    errors=[];baseline_errors=[];blocked=[]
    for p in test:
        try:prediction,_=model.predict_delta(p['params'],p['policy'])
        except ValueError as exc:
            blocked.append({'policy':p['policy'],'params':p['params'],'seed':p['seed'],'reason':str(exc)});continue
        errors.append(abs(prediction-p['delta']));baseline_errors.append(abs(p['delta']))
    report.update(state='research_model_only',evaluated_pairs=len(errors),blocked_pairs=len(blocked),blocked=blocked,
        delta_mae=sum(errors)/len(errors) if errors else None,
        zero_effect_mae=sum(baseline_errors)/len(errors) if errors else None)
    report['beats_zero_effect_on_evaluated_subset']=bool(errors and sum(errors)<sum(baseline_errors))
    return model,report


def read_completed_run(path):
    path=Path(path)
    read=lambda name:json.loads((path/name).read_text(encoding='utf-8'))
    manifest=read('manifest.json');progress=read('progress.json');report=read('report.json')
    if progress['state']!='complete' or report['state']!='complete':raise ValueError('Run is not complete')
    if manifest['fingerprint']!=report['fingerprint']:raise ValueError('Run source mismatch')
    rows=[json.loads(line) for line in (path/'episodes.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    if len(rows)!=progress['completed_games'] or len(rows)!=report['completed_games'] or len(rows)!=manifest['budget']:
        raise ValueError('Run count mismatch')
    if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate journal ID')
    # This adapter is explicitly for the completed legacy 40-wave protocol.
    result=extract_pairs(rows,manifest['fingerprint'],40)
    return manifest,result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',required=True,type=Path)
    parser.add_argument('--output-name',required=True)
    args=parser.parse_args()
    if not args.output_name or args.output_name in ('.','..') or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in args.output_name):
        parser.error('output-name must be a simple run name')
    output=Path(__file__).resolve().parent/'runs'/args.output_name
    if output.exists():raise FileExistsError('Output already exists; preserve previous results')
    manifest,data=read_completed_run(args.run)
    model,report=train_effect(data['pairs'],manifest['schema'],manifest['policies'],40,manifest['fingerprint'])
    report['pairing']=data['diagnostics'];report['source_run']=str(args.run.resolve())
    output.mkdir(parents=True,exist_ok=False)
    if model is not None:model.save(output/'model')
    (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
