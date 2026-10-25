"""Predeclared ridge-only comparison; completed runs only, no simulation or deployment."""
import os
for key in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[key] = '1'
import argparse
import json
from pathlib import Path
import numpy as np
from .model import Surrogate, features, group
from .audit import audit_run


def fit(rows, schema, policies, ridge):
    model = Surrogate(schema, policies)
    x = np.asarray([features(r['params'], r['policy'], schema, policies) for r in rows])
    y = np.asarray([r['result']['cleared']/40 for r in rows])
    model.weights = {}
    for i in range(5):
        rng = np.random.default_rng(100+i)
        w = rng.normal(0,.7,(x.shape[1],64)); b = rng.normal(0,.3,64)
        z = np.c_[np.ones(len(x)),x,np.tanh(x@w+b)]
        indices = rng.integers(0,len(x),len(x))
        zi = z[indices]; yi = y[indices]
        coef = np.linalg.solve(zi.T@zi+np.eye(zi.shape[1])*ridge,zi.T@yi)
        model.weights.update({f'w{i}':w,f'b{i}':b,f'c{i}':coef})
    return model


def errors(model, rows):
    by_group = {}
    for row in rows:
        key = group(row['params'])
        by_group.setdefault(key, []).append(abs(model.predict(row['params'],row['policy'])[0]-row['result']['cleared']))
    return float(np.mean([np.mean(v) for v in by_group.values()]))


def compare(rows, schema, policies):
    data = [r for r in rows if r['stage'] == 'data']
    groups = sorted({group(r['params']) for r in data})
    if len(groups) < 30:
        raise ValueError('At least 30 configuration groups required')
    if any({r['policy'] for r in data if group(r['params']) == g} != set(policies) for g in groups):
        raise ValueError('Each configuration must contain all policies')
    outer_groups = set(groups[::5])
    inner_groups = [g for g in groups if g not in outer_groups]
    inner = [r for r in data if group(r['params']) not in outer_groups]
    outer = [r for r in data if group(r['params']) in outer_groups]
    scores = {}
    for ridge in (.5, 2., 8.):
        folds = []
        for fold in range(3):
            valid_groups = set(inner_groups[fold::3])
            training = [r for r in inner if group(r['params']) not in valid_groups]
            validation = [r for r in inner if group(r['params']) in valid_groups]
            folds.append(errors(fit(training,schema,policies,ridge),validation))
        scores[str(ridge)] = float(np.mean(folds))
    selected = min((.5,2.,8.), key=lambda r:(scores[str(r)],abs(r-2)))
    baseline = fit(inner,schema,policies,2.)
    candidate = fit(inner,schema,policies,selected)
    per_policy = {}
    for policy in policies:
        test = [r for r in outer if r['policy'] == policy]
        mean = float(np.mean([r['result']['cleared'] for r in inner if r['policy'] == policy]))
        constant = type('Constant', (), {'predict':lambda self,params,p:(mean,0)})()
        per_policy[policy] = {'ridge2_mae':errors(baseline,test),'selected_mae':errors(candidate,test),
                              'constant_mae':errors(constant,test)}
    return {'selected_ridge':selected,'inner_cv_mae':scores,
            'outer_ridge2_mae':errors(baseline,outer),'outer_selected_mae':errors(candidate,outer),
            'outer_by_policy':per_policy,'inner_groups':inner_groups,'outer_groups':sorted(outer_groups),
            'patch_recommendation':'not_evaluated',
            'limitations':['Ridge selection only; no new games or fresh-seed candidate validation.',
                           'Outer results must not be reused to choose more hyperparameters.',
                           'Fixed policies do not represent human skill.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',required=True)
    args = parser.parse_args()
    try:
        # Also checks journal integrity, model metadata and source fingerprint.
        audit = audit_run(args.run)
        directory = Path(args.run)
        manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
        rows = [json.loads(line) for line in (directory/'episodes.jsonl').read_text(encoding='utf-8').splitlines()]
        result = compare(rows,manifest['schema'],manifest['policies'])
        result['fingerprint'] = audit['fingerprint']
    except (ValueError,FileNotFoundError) as error:
        parser.error(str(error))
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
