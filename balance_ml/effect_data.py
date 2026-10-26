"""Pair training-stage games only; held-out development/confirmation games stay untouched."""
import json


def extract_pairs(rows, fingerprint, target_wave):
    if target_wave not in (40,50) or not fingerprint:
        raise ValueError('Explicit source fingerprint and supported target required')
    data=[r for r in rows if r['stage']=='data']
    baselines={};candidates={};duplicates=0
    for row in data:
        result=row['result']
        # Legacy 40-wave records predate explicit target metadata.
        if result.get('target',40)!=target_wave:
            raise ValueError('Outcome target differs from declared dataset target')
        if not 0<=result['cleared']<=target_wave:
            raise ValueError('Outcome outside target')
        params=row['params']
        if len(params)>1:raise ValueError('Only one-parameter interventions are supported')
        key=(row['seed'],row['policy'],json.dumps(params,sort_keys=True))
        destination=candidates if params else baselines
        if key in destination:
            old=destination[key]['result']
            fields=('cleared','invalid','end','actions')
            if any(old[k]!=result[k] for k in fields):raise ValueError('Conflicting repeated deterministic outcome')
            duplicates+=1
        else:destination[key]=row
    pairs=[];missing=invalid=0
    for row in candidates.values():
        base=baselines.get((row['seed'],row['policy'],'{}'))
        if base is None:missing+=1;continue
        a,b=row['result'],base['result']
        if a['invalid'] or b['invalid'] or a['end']=='time_limit' or b['end']=='time_limit':
            invalid+=1;continue
        key=next(iter(row['params']))
        if key.startswith('towers.'):
            tower=key.split('.')[1]
            used=a['actions'].get('build:'+tower,0)>0 or b['actions'].get('build:'+tower,0)>0
            basis='tower_built_in_either_paired_game'
        elif key=='startGold':used=True;basis='starting_resource'
        else:used=False;basis='no_exposure_rule'
        pairs.append({'params':row['params'],'policy':row['policy'],'seed':row['seed'],
            'target_wave':target_wave,'fingerprint':fingerprint,
            'delta':a['cleared']-b['cleared'],'baseline_cleared':b['cleared'],'candidate_cleared':a['cleared'],
            'relevant_use':used,'exposure_basis':basis})
    return {'pairs':pairs,'diagnostics':{'training_rows':len(data),'matched_pairs':len(pairs),
        'paired_seeds':len({p['seed'] for p in pairs}),
        'paired_configurations':len({json.dumps(p['params'],sort_keys=True) for p in pairs}),
        'unmatched_candidates':missing,'invalid_or_time_censored_pairs':invalid,
        'unexposed_pairs':sum(not p['relevant_use'] for p in pairs),'duplicate_records_ignored':duplicates,
        'held_out_rows_ignored':len(rows)-len(data)}}
