"""New training-seed check, only after a development-selected improvement survives comparison."""
from concurrent.futures import ProcessPoolExecutor,as_completed
import numpy as np
from ppo_step_study import BASE,BUDGETS,read,write,train_job,evaluation_job

def main():
    state=read(BASE/'study-state.json');assert state['status']=='complete'
    path=BASE/'generalization-state.json';assert not path.exists(),'Inspect previous generalization rather than restarting'
    variants=[]
    for arch in ('flat','hierarchy'):
        for mode in ('basic','imitation'):
            keys=[f'{arch}-{seed}-{mode}' for seed in (42,43)]
            deltas=[state['runs'][k]['development']['262144']['mean']-state['runs'][k]['development']['65536']['mean'] for k in keys]
            variants.append({'architecture':arch,'initialization':mode,'development_mean_gain':float(np.mean(deltas)),'development_seed_gains':deltas})
    selected=max(variants,key=lambda v:v['development_mean_gain'])
    keys=[f"{selected['architecture']}-{seed}-{selected['initialization']}" for seed in (42,43)]
    confirmed=[state['comparison'][k+'-s262144']['mean']-state['comparison'][k+'-s65536']['mean'] for k in keys]
    selected['primary_comparison_seed_gains']=confirmed
    result={'status':'planned','selection':selected,'training_seeds':[49,50],'budgets':BUDGETS,'evaluation_python_seeds':[650000,650019],
        'criterion':'variant selected by development gain only; run new seeds iff development gain>0 and primary comparison mean gain>0',
        'runs':{},'comparison':{}}
    write(BASE/'generalization-selection.json',result)
    if selected['development_mean_gain']<=0 or np.mean(confirmed)<=0:
        result.update(status='not_run',reason='Development-selected improvement did not have positive mean gains in both development and independent primary comparison')
        write(path,result);print('GENERALIZATION NOT REQUIRED: improvement rejected',flush=True);return
    result['status']='training';write(path,result)
    try:
        with ProcessPoolExecutor(max_workers=2) as pool:
            pending={pool.submit(train_job,selected['architecture'],seed,selected['initialization']):seed for seed in (49,50)}
            for f in as_completed(pending):
                key,run=f.result();result['runs'][key]=run;write(path,result)
            result['status']='comparison';write(path,result)
            pending={pool.submit(evaluation_job,key,budget,'generalization',650000,20):(key,budget) for key in result['runs'] for budget in BUDGETS}
            for f in as_completed(pending):
                key,budget,summary=f.result();result['comparison'][f'{key}-s{budget}']=summary;write(path,result)
        result['status']='complete';write(path,result);print('GENERALIZATION COMPLETE',flush=True)
    except BaseException as exc:
        result.update(status='failed',error=repr(exc));write(path,result);raise
if __name__=='__main__':main()
