"""Descriptive, seed-paired strategy effects; never changes selection or adoption."""
METRICS = ('cleared','time','hp','kills','leaks','damage','destroyed','miners','workers','gold','crystals')
COMPARISONS = {
    'faster_decisions': ('mixed-timing-02s','mixed-timing-1s'),
    'potion_use': ('mixed-timing-02s','mixed-no-potions-02s'),
    'additional_miner_investment': ('mixed-timing-02s','mixed-no-economy-02s'),
}


def summarize(results):
    if not results:raise ValueError('No games to summarize')
    actions = {key:sum(r['actions'].get(key,0) for r in results)
               for key in sorted({k for r in results for k in r['actions']})}
    invalid = sum(r['invalid'] for r in results)
    attempted = invalid+sum(actions.values())
    return {'games':len(results),
            'mean':{key:sum(r[key] for r in results)/len(results) for key in METRICS},
            'reached':{str(w):sum(r['cleared']>=w for r in results) for w in (40,50)},
            'actions':actions,'invalid_actions':invalid,
            'invalid_action_rate':invalid/attempted if attempted else 0,
            'time_censored':sum(r['end']=='time_limit' for r in results)}


def strategy_effects(rows):
    indexed={}
    for row in rows:
        key=(row['stage'],row['seed'],row['hpMultiplier'],row['policy'])
        if key in indexed:raise ValueError('Duplicate paired game')
        indexed[key]=row['result']
    output={}
    for stage in ('development','confirmation'):
        seeds=sorted({r['seed'] for r in rows if r['stage']==stage})
        if not seeds:raise ValueError('Missing experiment stage')
        for hp in (1,1.05):
            for label,(enabled,control) in COMPARISONS.items():
                pairs=[]
                for seed in seeds:
                    a=indexed.get((stage,seed,hp,enabled));b=indexed.get((stage,seed,hp,control))
                    if a is None or b is None:raise ValueError('Missing matched policy result')
                    pairs.append((seed,a,b))
                output[f'{stage}:{hp}:{label}']={
                    'enabled_policy':enabled,'control_policy':control,'pairs':len(pairs),
                    'delta_direction':'enabled minus control',
                    'mean_delta':{key:sum(a[key]-b[key] for _,a,b in pairs)/len(pairs) for key in METRICS},
                    'individual_wave_deltas':[{'seed':seed,'delta':a['cleared']-b['cleared']} for seed,a,b in pairs],
                    'enabled':summarize([a for _,a,b in pairs]),
                    'control':summarize([b for _,a,b in pairs]),
                }
    return {'comparisons':output,'limits':[
        'Additional miner comparison retains starting miners and passive income.',
        'Final stocks are not total income or expenditure; episode lengths differ.',
        'Fixed-policy comparisons do not prove optimality or necessity for human players.',
        'Censored or invalid games remain visible and must not be treated as clean successes.',
    ]}
