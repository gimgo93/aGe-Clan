"""Read-only, configuration-grouped diagnostics for a completed ML run."""
import os
for key in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[key] = '1'
import argparse
import json
from pathlib import Path
import numpy as np
from .model import Surrogate, group


def evaluate(model, rows):
    train_groups = set(model.metrics['training_groups'])
    hold_groups = set(model.metrics['holdout_groups'])
    if train_groups & hold_groups:
        raise ValueError('Training and holdout configurations overlap')
    data = [r for r in rows if r['stage'] == 'data']
    if {group(r['params']) for r in data} != train_groups | hold_groups:
        raise ValueError('Journal configurations differ from saved model split')
    train = [r for r in data if group(r['params']) in train_groups]
    test = [r for r in data if group(r['params']) in hold_groups]
    summaries = {}
    for policy in model.policies:
        training = [r for r in train if r['policy'] == policy]
        testing = [r for r in test if r['policy'] == policy]
        if not training or not testing:
            raise ValueError('Missing training or holdout policy: ' + policy)
        baseline = float(np.mean([r['result']['cleared'] for r in training]))
        errors = []
        for row in testing:
            actual = row['result']['cleared']
            prediction = model.predict(row['params'], policy)[0]
            errors.append((group(row['params']), abs(prediction-actual), abs(baseline-actual)))
        # Resample whole configurations, keeping repeated simulation seeds together.
        groups = sorted({e[0] for e in errors})
        deltas = np.array([np.mean([e[2]-e[1] for e in errors if e[0] == g]) for g in groups])
        rng = np.random.default_rng(20261025)
        samples = np.mean(deltas[rng.integers(0, len(deltas), (1000, len(deltas)))], axis=1)
        interval = np.quantile(samples, [.025, .975]).tolist() if len(groups) >= 10 else None
        summaries[policy] = {
            'holdout_rows': len(testing), 'holdout_configuration_groups': len(groups),
            'model_mae_waves': float(np.mean([e[1] for e in errors])),
            'constant_policy_mae_waves': float(np.mean([e[2] for e in errors])),
            'equal_configuration_mae_improvement': float(np.mean(deltas)),
            'group_bootstrap_95pct_interval': interval,
            'positive_improvement_supported': interval is not None and interval[0] > 0,
            'time_censored_games': sum(r['result'].get('end') == 'time_limit' for r in testing),
            'invalid_actions': sum(r['result'].get('invalid', 0) for r in testing),
        }
    return {'policies': summaries, 'diagnostic_only': True,
            'limitations': ['Bootstrap interval concerns sampled configurations, not human skill or game outcomes.',
                           'Repeated model selection on this holdout needs a new untouched validation set.',
                           'This audit never promotes a candidate or applies a patch.']}


def audit_run(directory):
    directory = Path(directory)
    progress = json.loads((directory/'progress.json').read_text(encoding='utf-8'))
    if progress.get('state') != 'complete':
        raise ValueError('Run is not complete; active journals are left untouched')
    manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    report = json.loads((directory/'report.json').read_text(encoding='utf-8'))
    if manifest['fingerprint'] != report['fingerprint']:
        raise ValueError('Manifest/report source fingerprint mismatch')
    rows = [json.loads(line) for line in (directory/'episodes.jsonl').read_text(encoding='utf-8').splitlines()]
    if len(rows) != report['completed_games'] or len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Incomplete or duplicate journal records')
    model = Surrogate.load(directory/'surrogate.npz')
    if model.schema != manifest['schema'] or model.policies != manifest['policies'] or model.metrics != report['model']:
        raise ValueError('Saved model metadata differs from run manifest/report')
    return {'fingerprint': manifest['fingerprint'], 'completed_games': len(rows), **evaluate(model, rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, help='Completed run directory; no files are written')
    args = parser.parse_args()
    try:
        result = audit_run(args.run)
    except (ValueError, FileNotFoundError) as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
