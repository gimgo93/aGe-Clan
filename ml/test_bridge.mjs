import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ACTIONS, FEATURES, TrainingSession} from './bridge.mjs';
import trees from '../lib/trees.js';
import {restore, act} from '../lib/match-engine.js';

const action = (name, args) => ACTIONS.findIndex(a => a.name === name && JSON.stringify(a.args) === JSON.stringify(args));
const fresh = (options = {}) => {const env = new TrainingSession(); env.reset(options); return env;};
const plain = value => JSON.parse(JSON.stringify(value));

// Load the actual browser source independently to detect stale generated rules.
const context = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(new URL('../public/game/balance.js', import.meta.url), 'utf8'), context);
context.FRONTIER_BALANCE = context.window.FRONTIER_BALANCE;
vm.runInContext(fs.readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8'), context);
let seed = 123;
const browser = new context.Defense.Game(() => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
});
browser.setTreeSites(trees); browser.start();
const env = fresh({seed: 123, frameSkip: 10});
const script = [action('build', ['archer', 3]), action('hireWoodcutter'),
  action('upgradeCastle'), action('upgradeTower', ['archer']), action('startWave', [1]),
  ...Array(120).fill(0)];
for (const id of script) {
  const command = ACTIONS[id];
  if (id !== 0) browser[command.name](...(command.args ?? []));
  for (let i = 0; i < 10 && !browser.s.over; i++) browser.tick(.1);
  env.step(id);
  assert.deepEqual(plain(env.game.s), plain(browser.s), 'browser/bridge state parity');
  if (env.done) break;
}

// Same command validators, tree layout and seeded ticks as match-engine restore.
const matchEnv = fresh({seed: 1});
const player = {id: 'offline', s: structuredClone(matchEnv.game.s), seed: 1, nextId: 0};
const room = {status: 'playing', solo: true, players: [player]};
for (const id of [action('build', ['archer', 0]), action('hireWoodcutter'), 0, 0]) {
  const command = ACTIONS[id];
  if (id) act(room, player, command.name, command.args ?? []);
  const game = restore(player);
  for (let i = 0; i < 10; i++) game.tick(.1);
  player.nextId = game.id;
  matchEnv.step(id);
  assert.deepEqual(plain(matchEnv.game.s), plain(player.s), 'match-engine state parity');
}

const invalid = fresh();
const bad = invalid.step(action('build', ['storm', 0]));
assert.ok(bad.info.action_result.error);
assert.equal(bad.reward, -.05);
assert.equal(invalid.game.s.towers.length, 0);
assert.equal(bad.info.ticks, 10);
assert.equal(bad.observation.length, FEATURES.length);
assert.ok(bad.observation.every(Number.isFinite));
assert.throws(() => invalid.step(-1));
assert.throws(() => invalid.reset({frameSkip: 0}));
assert.throws(() => fresh().reset({seed: -1}));

const timeout = fresh({frameSkip: 10, maxTicks: 13});
timeout.step(0);
const end = timeout.step(0);
assert.equal(end.truncated, true);
assert.equal(end.terminated, false);
assert.equal(end.info.ticks, 13);
assert.throws(() => timeout.step(0), /reset/);

// Test fixtures alter only isolated in-memory state, never production files.
const defeat = fresh({frameSkip: 1});
defeat.game.startWave();
defeat.game.spawn(defeat.game.s.waves[0]);
Object.assign(defeat.game.s.enemies[0], {d: context.Defense.pathLength, siege: .74});
defeat.game.s.hp = 1;
const loss = defeat.step(0);
assert.equal(loss.terminated, true);
assert.equal(loss.truncated, false);
assert.equal(loss.reward, -10.02);

const victory = fresh({targetWave: 1, frameSkip: 1});
victory.game.startWave();
Object.assign(victory.game.s.waves[0], {spawned: 9, resolved: 9});
const win = victory.step(0);
assert.equal(win.info.end_reason, 'target_wave');
assert.equal(win.reward, 11);

const kill = fresh({frameSkip: 1});
kill.game.startWave(); kill.game.spawn(kill.game.s.waves[0]);
Object.assign(kill.game.s.enemies[0], {hp: 1, burn: 1});
assert.equal(kill.step(0).info.reward_terms.kills, .01);

const wood = fresh({frameSkip: 100});
wood.step(action('hireWoodcutter'));
assert.ok(wood.game.s.wood > 0, 'shared trees allow harvesting');
const sale = fresh({frameSkip: 1});
sale.step(action('build', ['archer', 0]));
assert.ok(sale.step(ACTIONS.findIndex(a => a.name === 'sellTower' && a.pad === 0)).info.action_result.ok);
assert.equal(sale.game.s.towers.length, 0);

const protocol = spawnSync(process.execPath, [fileURLToPath(new URL('./bridge.mjs', import.meta.url))], {
  input: 'bad json\n{"op":"unknown"}\n{"op":"step","action":0}\n{"op":"reset"}\n{"op":"close"}\n', encoding: 'utf8', timeout: 5000,
});
assert.equal(protocol.status, 0);
assert.deepEqual(protocol.stdout.trim().split('\n').map(line => JSON.parse(line).ok), [false, false, false, true, true]);
console.log(`PASS: browser/match parity, validation, rewards, termination, truncation, trees, sale, JSONL (${ACTIONS.length} actions, ${FEATURES.length} features)`);
