import hashlib
import json
from pathlib import Path

from sb3_contrib import MaskablePPO
import torch


WORK = Path(__file__).resolve().parent
RESULTS = WORK / 'ppo-results'
SOURCE = Path(r'C:\Users\jjiho\Documents\Codex\projects\age-clan-ML-local')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def text_hash(path):
    return hashlib.sha256(path.read_text(encoding='utf-8').encode('utf-8')).hexdigest()


def main():
    torch.set_num_threads(1)
    old = WORK / 'ppo-phase6'
    original = SOURCE / 'ml/reports/2026-10-22-phase6/results.json'
    prior = read(original)['confirmation']
    checks = {}
    for name in ('defense-g099', 'scripted'):
        result = read(RESULTS / 'phase6-reproduction' / f'{name}.json')
        assert result == prior[name], f'Original reproduction changed for {name}'
    checks['reproduction'] = 'All saved summaries and episode fields exactly equal the original report.'
    manifest = read(old / 'ml/runs/phase6-wave20-20261022/defense-g099/manifest.json')
    expected_sources = manifest['environment']['source_sha256']
    assert all(text_hash(old / name) == digest for name, digest in expected_sources.items())
    checks['old_engine_sources'] = expected_sources
    checks['current_engine_sources'] = {name: text_hash(WORK / 'ppo-current' / name)
                                        for name in expected_sources}
    artifact_hashes = read(SOURCE / 'ml/reports/2026-10-22-phase6/provenance.json')['runs']['defense-g099']['artifact_sha256']
    for name, digest in artifact_hashes.items():
        path = old / 'ml/runs/phase6-wave20-20261022/defense-g099' / name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    checks['original_model_files'] = artifact_hashes
    added = 0
    wall = 0.0
    for relative in ('phase7-seed43/legacy-g099', 'phase7-seed43/defense-g099',
                     'current-engine/fresh-defense-g099'):
        run = RESULTS / relative
        record = read(run / 'manifest.json')
        model = MaskablePPO.load(run / 'model.zip', device='cpu')
        assert record['status'] == 'complete'
        assert model.num_timesteps == record['actual_timesteps']
        assert record['added_timesteps'] == 16384
        assert model.gamma == model.rollout_buffer.gamma == .99
        assert model.n_steps == 256 and model.batch_size == 64 and model.n_epochs == 4
        assert model.ent_coef == .003
        assert all(group['lr'] == .0001 for group in model.policy.optimizer.param_groups)
        source_root = WORK / ('ppo-current' if relative.startswith('current-engine') else 'ppo-phase6')
        assert all(text_hash(source_root / name) == digest
                   for name, digest in record['environment']['source_sha256'].items())
        checks[relative] = {'steps': model.num_timesteps, 'added': record['added_timesteps'],
                            'wall_seconds': record['wall_seconds'], 'model_sha256': hashlib.sha256((run / 'model.zip').read_bytes()).hexdigest(),
                            'vecnormalize_sha256': hashlib.sha256((run / 'vecnormalize.pkl').read_bytes()).hexdigest()}
        added += record['added_timesteps']
        wall += record['wall_seconds']
    assert added == 49152
    checks['total_strategy_training_steps'] = added
    checks['total_strategy_training_seconds'] = wall
    opening = read(RESULTS / 'opening-diagnostic.json')
    before = opening['confirmation']['policy']
    after = opening['confirmation']['scripted-first-build']
    assert before == after, 'Expected zero-effect opening intervention'
    checks['opening_intervention'] = 'No action changes occurred. This is a diagnostic null result.'
    placement = read(RESULTS / 'first-build-placement.json')
    for phase in ('development', 'confirmation'):
        before = placement[phase]['policy']
        after = placement[phase]['first-build-pad3']
        assert after['summary']['interventions'] == after['summary']['episodes']
        assert before['summary']['invalid_action_rate'] == after['summary']['invalid_action_rate'] == 0
        assert [row['python_seed'] for row in before['episodes']] == [row['python_seed'] for row in after['episodes']]
        assert all(row['first_build']['action']['args'] == ['archer', 3] for row in after['episodes'])
        assert all(row['first_build']['before']['time'] == 0 for row in after['episodes'])
        differences = [a['contiguous_cleared'] - b['contiguous_cleared']
                       for a, b in zip(after['episodes'], before['episodes'])]
        checks[f'placement_{phase}'] = {'paired_wave_differences': differences,
                                       'improved': sum(value > 0 for value in differences),
                                       'equal': sum(value == 0 for value in differences),
                                       'worse': sum(value < 0 for value in differences)}
    write = RESULTS / 'verification.json'
    write.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(checks, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
