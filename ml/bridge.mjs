// Offline-only adapter. No room server, wall-clock timers, network, or API clients.
import readline from 'node:readline';
import {pathToFileURL} from 'node:url';
import Defense from '../lib/game-engine.js';
import trees from '../lib/trees.js';

const {Game, TYPES, PADS, pathLength} = Defense;
export const ACTIONS = [
  {name: 'wait'},
  ...TYPES.flatMap(t => PADS.map((_, pad) => ({name: 'build', args: [t.id, pad]}))),
  {name: 'hire'}, {name: 'hireWoodcutter'}, {name: 'upgradeCastle'},
  ...TYPES.map(t => ({name: 'upgradeTower', args: [t.id]})),
  {name: 'startWave', args: [1]}, {name: 'startWave', args: [2]},
  ...PADS.map((_, pad) => ({name: 'sellTower', pad})),
  {name: 'buildLab'},
  ...['lightning', 'ice'].map(kind => ({name: 'researchPotion', args: [kind]})),
  ...['lightning', 'ice'].map(kind => ({name: 'potion', args: [kind]})),
  {name: 'repairCastle'},
];
export const FEATURES = [
  'time', 'gold', 'crystals', 'wood', 'hp', 'maxHp', 'castle', 'era',
  'miners', 'population', 'wave', 'completed', 'kills', 'activeWaves',
  'waveClock', 'miningClock', 'lab', 'labBuild', 'repairCount',
  'lightningResearch', 'iceResearch', 'lightningCooldown', 'iceCooldown',
  ...TYPES.map(t => `level.${t.id}`),
  ...PADS.flatMap((_, i) => ['type', 'hp', 'buildRemaining', 'cooldown'].map(k => `pad.${i}.${k}`)),
  ...Array.from({length: 8}, (_, i) => [`enemyBin.${i}.count`, `enemyBin.${i}.hp`]).flat(),
];

function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

export class TrainingSession {
  reset({seed = 0, frameSkip = 10, maxTicks = 6000, targetWave = 0} = {}) {
    this.seed = integer(seed, 0, 0xffffffff, 'seed');
    this.frameSkip = integer(frameSkip, 1, 10000, 'frameSkip');
    this.maxTicks = integer(maxTicks, 1, 10000000, 'maxTicks');
    this.targetWave = integer(targetWave, 0, 1000, 'targetWave');
    let state = this.seed;
    this.game = new Game(() => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    });
    this.game.setTreeSites(trees);
    this.game.start();
    this.ticks = 0;
    this.done = false;
    return this.result(0, false, false, {ok: true}, {});
  }

  observation() {
    const s = this.game.s;
    const values = [s.time, s.gold, s.crystals, s.wood, s.hp, s.maxHp, s.castle,
      this.game.era, s.miners, s.population, s.wave, s.completed, s.kills,
      s.waves.length, s.waveClock ?? 0, s.miningClock, +s.lab, s.labBuild,
      s.repairCount, s.research.lightning, s.research.ice,
      s.potionCooldown.lightning, s.potionCooldown.ice,
      ...TYPES.map(t => s.towerLevels[t.id])];
    for (let pad = 0; pad < PADS.length; pad++) {
      const t = s.towers.find(t => t.pad === pad);
      values.push(...(t ? [TYPES.findIndex(p => p.id === t.type) + 1, t.hp, t.buildRemaining, t.cd] : [0, 0, 0, 0]));
    }
    const bins = Array.from({length: 8}, () => [0, 0]);
    for (const e of s.enemies) {
      const bin = bins[Math.max(0, Math.min(7, Math.floor(e.d / pathLength * 8)))];
      bin[0]++;
      bin[1] += Math.max(0, e.hp);
    }
    return values.concat(bins.flat());
  }

  result(reward, terminated, truncated, actionResult, rewardTerms) {
    const s = this.game.s;
    return {observation: this.observation(), reward, terminated, truncated,
      info: {seed: this.seed, ticks: this.ticks, game_time: s.time, wave: s.wave,
        completed: s.completed, hp: s.hp, kills: s.kills, action_result: actionResult,
        reward_terms: rewardTerms, end_reason: terminated ? (s.over ? 'castle_destroyed' : 'target_wave') : truncated ? 'time_limit' : null}};
  }

  step(action) {
    if (!this.game || this.done) throw new Error('Call reset before stepping a new episode');
    integer(action, 0, ACTIONS.length - 1, 'action');
    const command = ACTIONS[action], s = this.game.s;
    const before = {kills: s.kills, completed: s.completed};
    let actionResult = {ok: true};
    if (command.name === 'sellTower') {
      const tower = s.towers.find(t => t.pad === command.pad);
      actionResult = tower ? this.game.sellTower(tower.id) : {error: 'No tower on this pad'};
    } else if (command.name !== 'wait') actionResult = this.game[command.name](...(command.args ?? []));
    // Start after the action so upgrades/repairs cannot earn healing rewards.
    const hp = s.hp;
    let success = false;
    for (let i = 0; i < this.frameSkip && this.ticks < this.maxTicks && !s.over; i++) {
      this.game.tick(0.1);
      this.ticks++;
      success = this.targetWave > 0 && s.completed >= this.targetWave && s.waves.length === 0;
      if (success) break;
    }
    const terminated = s.over || success;
    const truncated = !terminated && this.ticks >= this.maxTicks;
    this.done = terminated || truncated;
    const terms = {kills: (s.kills - before.kills) * 0.01,
      waves: s.completed - before.completed, damage: -Math.max(0, hp - s.hp) * 0.02,
      invalid: actionResult.error ? -0.05 : 0, terminal: s.over ? -10 : success ? 10 : 0};
    return this.result(Object.values(terms).reduce((a, b) => a + b, 0), terminated, truncated, actionResult, terms);
  }
}

function serve() {
  const session = new TrainingSession();
  const lines = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
  lines.on('line', line => {
    try {
      const request = JSON.parse(line);
      let data;
      switch (request.op) {
        case 'describe': data = {version: 1, actions: ACTIONS, features: FEATURES, tickSeconds: 0.1}; break;
        case 'reset': data = session.reset(request); break;
        case 'step': data = session.step(request.action); break;
        case 'close': process.stdout.write(JSON.stringify({ok: true}) + '\n'); lines.close(); process.stdin.destroy(); return;
        default: throw new Error('Unknown operation');
      }
      process.stdout.write(JSON.stringify({ok: true, data}) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ok: false, error: error.message}) + '\n');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve();
