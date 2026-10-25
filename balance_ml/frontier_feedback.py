"""Predeclared paired feedback for frontier50; never applies a patch."""

def feedback(rows):
    expected = {}
    for row in rows:
        key = (row['stage'], row['seed'], row['policy'], row['hpMultiplier'])
        if key in expected:
            raise ValueError('Duplicate paired result')
        expected[key] = row
    policies = sorted({r['policy'] for r in rows})
    stages = {stage:sorted({r['seed'] for r in rows if r['stage']==stage})
              for stage in ['development','confirmation']}
    if len(policies)!=4 or len(stages['development'])!=3 or len(stages['confirmation'])!=5:
        raise ValueError('Incomplete predeclared experiment')
    if set(stages['development']) & set(stages['confirmation']):
        raise ValueError('Development and confirmation seed overlap')
    if len(rows)!=64:
        raise ValueError('Expected 64 paired games')
    for stage,seeds in stages.items():
        for seed in seeds:
            for policy in policies:
                for hp in [1,1.05]:
                    if (stage,seed,policy,hp) not in expected:
                        raise ValueError('Missing paired game')
    def results(stage,policy,hp):
        return [expected[stage,seed,policy,hp]['result'] for seed in stages[stage]]
    ranked=[]
    for policy in policies:
        rs=results('development',policy,1)
        wins=sum(r['cleared']>=50 for r in rs)
        if wins:ranked.append((-wins,-sum(r['cleared'] for r in rs)/len(rs),policy))
    out={'selected_policy':None,'decision':'improve_strategy_first','reasons':[],
         'automatic_patch':False,'limits':'Small fixed-policy sample; no optimality or human-difficulty guarantee.'}
    if not ranked:
        out['reasons'].append('No baseline development policy reached50')
        return out
    selected=min(ranked)[2];out['selected_policy']=selected
    baseline=results('confirmation',selected,1);candidate=results('confirmation',selected,1.05)
    mean=lambda rs,key:sum(r[key] for r in rs)/len(rs)
    successes=lambda rs,w:sum(r['cleared']>=w for r in rs)
    both=[(b,c) for b,c in zip(baseline,candidate) if '40' in b.get('milestones',{}) and '40' in c.get('milestones',{})]
    hp_delta=(sum(c['milestones']['40']['hp']-b['milestones']['40']['hp'] for b,c in both)/len(both)) if both else None
    loss=mean(baseline,'cleared')-mean(candidate,'cleared')
    success_loss=successes(baseline,40)-successes(candidate,40)
    out['confirmation']={'baseline50':successes(baseline,50),'candidate50':successes(candidate,50),
        'baseline40':successes(baseline,40),'candidate40':successes(candidate,40),
        'mean_progress_loss':loss,'paired_hp40_delta':hp_delta,'hp40_pair_count':len(both)}
    reasons=out['reasons']
    if successes(baseline,50)<3:reasons.append('Baseline50 not reproduced in at least3 of5 confirmation seeds')
    if successes(candidate,50)<3:reasons.append('Candidate50 not reproduced in at least3 of5 confirmation seeds')
    if any(r.get('invalid',0) or r['end']=='time_limit' for r in baseline+candidate):
        reasons.append('Invalid actions or time-censored confirmation games')
    if not (success_loss>0 or hp_delta is not None and hp_delta<0):
        reasons.append('No measured increase in wave40 difficulty')
    if loss>1 or success_loss>1:reasons.append('Difficulty increase exceeds provisional small-change bounds')
    out['decision']='hold' if reasons else 'review_candidate'
    return out
