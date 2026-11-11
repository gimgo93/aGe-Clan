import assert from 'node:assert/strict';
import {ACTIONS, TrainingSession, applyAction} from './bridge.mjs';
import Defense from '../lib/game-engine.js';
const fresh = () => {const env = new TrainingSession(); env.reset({seed: 42, frameSkip: 10}); return env;};
let checks = 0;
function verify(env) {
  const before = structuredClone(env.game.s), id = env.game.id, ticks = env.ticks;
  const mask = env.actionMasks();
  assert.equal(mask.length, ACTIONS.length);
  assert.equal(mask[0], true);
  for (let i = 0; i < ACTIONS.length; i++) {
    const oracle = Object.create(Defense.Game.prototype);
    oracle.s = structuredClone(before); oracle.id = id;
    oracle.treeSites = structuredClone(env.game.treeSites); oracle.rng = () => 0.5;
    assert.equal(mask[i], !applyAction(oracle, ACTIONS[i]).error, `action ${i}: ${JSON.stringify(ACTIONS[i])}`);
    checks++;
  }
  assert.deepEqual(env.game.s, before, 'mask must not change state');
  assert.equal(env.game.id, id); assert.equal(env.ticks, ticks);
}
const env = fresh(); verify(env);
env.game.s.gold = 0; env.game.s.crystals = 0; verify(env);
Object.assign(env.game.s, {gold: 100000, crystals: 10000, wood: 10000, castle: 20}); verify(env);
env.game.build('archer', 0); env.game.build('storm', 1); verify(env);
Object.assign(env.game.s, {miners: 30, population: 50, hp: 10, lab: true, labBuild: 5});
for (const name of Object.keys(env.game.s.towerLevels)) env.game.s.towerLevels[name] = 5;
verify(env);
env.game.s.labBuild = 0; verify(env);
env.game.startWave(2); env.game.spawn(env.game.s.waves[0]);
env.game.s.research = {lightning: -1, ice: -1, attack: 0}; verify(env);
env.game.s.potionCooldown.lightning = 2; verify(env);
env.game.s.paused = true; verify(env);
// Repeated queries cannot consume the real engine RNG or alter a future trajectory.
const queried = fresh(), control = fresh();
for (let step = 0; step < 120; step++) {
  if (step % 5 === 0) verify(queried);
  queried.actionMasks(); queried.actionMasks();
  const action = step === 0 ? 132 : 0;
  const left = queried.step(action), right = control.step(action);
  assert.deepEqual(left, right, 'mask queries must preserve seeded trajectories');
  if (queried.done) break;
}
console.log(`PASS: ${checks} exhaustive engine/mask decisions, state/ID/time/RNG isolation`);
