import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import trees from '../../lib/trees.js';

// Immutable pre-patch engine/config preserve the real control after production source changes.
const source = fs.readFileSync(new URL('./fixtures/game-before-civilization.js', import.meta.url), 'utf8');
const balanceSource = fs.readFileSync(new URL('./fixtures/balance-before-civilization.js', import.meta.url), 'utf8');
const hit = "this.hurt(target,p.damage*(i&&p.type==='storm'?.65:1));";
export const CANDIDATES = [
  {id: 'baseline', step: 0}, {id: 'armor-020', step: .2},
  {id: 'armor-020-lightning070', step: .2, lightning: .7},
  {id: 'armor-020-lightning080', step: .2, lightning: .8},
];
export function engine(candidate) {
  const context = vm.createContext({window: {}});
  vm.runInContext(balanceSource, context);
  context.FRONTIER_BALANCE = context.window.FRONTIER_BALANCE;
  let script = source;
  if (candidate.step) {
    if (script.split(hit).length !== 2) throw new Error('Projectile source anchor changed');
    const factor = `(p.type==='archer'&&!s.multiplayer&&target.wave>=13&&['heavy','brute','saboteur'].includes(target.kind)?1-Math.min(.9,(target.wave-12)*${candidate.step}):1)`;
    script = script.replace(hit, hit.replace('));', `)*${factor});`));
  }
  if (candidate.lightning) {
    const anchor='this.hurt(e,e.hp*.6)';
    if(script.split(anchor).length!==2)throw new Error('Potion source anchor changed');
    script=script.replace(anchor,`this.hurt(e,e.hp*(s.multiplayer?.6:${candidate.lightning}))`);
  }
  vm.runInContext(script, context);
  return context.Defense;
}

const pads = [3,0,4,5,8,6,10,2,1,7,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
export const POLICIES = [
  {id: 'archer-fixed', archer: true, economy: false, castleMax: 5},
  {id: 'archer-economy', archer: true, economy: true, castleMax: 20, repair: true},
  {id: 'mixed-no-miners', economy: false, castleMax: 20, research: true, potions: true, repair: true},
  {id: 'mixed-no-potions', economy: true, castleMax: 20, research: true, repair: true},
  {id: 'mixed-potions', economy: true, castleMax: 20, research: true, potions: true, repair: true},
];

export function choose(game, D, policy) {
  const s = game.s;
  const count = type => s.towers.filter(t => t.type === type).length;
  const available = (name, ...args) => {
    // Query actual validators on a sandbox; never spend resources on rejected actions.
    const probe = Object.create(D.Game.prototype);
    probe.s = structuredClone(s); probe.id = game.id;
    probe.treeSites = game.treeSites; probe.rng = () => .5;
    return !probe[name](...args).error;
  };
  const command = (name, ...args) => available(name, ...args) ? {name,args} : null;
  const build = type => {
    const pad = pads.find(pad => !s.towers.some(t => t.pad === pad));
    return pad === undefined ? null : command('build', type, pad);
  };
  if (policy.id === 'archer-fixed') {
    if (s.towerLevels.archer < 5) {const a=command('upgradeTower','archer'); if(a)return a;}
    if (s.castle < 5) {const a=command('upgradeCastle');if(a)return a;}
    return build('archer');
  }
  if (s.towers.length < 2) {const a = build('archer'); if (a) return a;}
  if (s.towerLevels.archer < (s.wave >= 3 ? 5 : 3)) {
    const a=command('upgradeTower','archer');if(a)return a;
  }
  if (s.time < 180 && s.towers.length < 3) {const a=build('archer');if(a)return a;}
  if (policy.repair && s.hp < s.maxHp * .55) {const a=command('repairCastle');if(a)return a;}
  if (policy.potions && s.wave >= 30 && s.enemies.length) {
    const front = Math.max(...s.enemies.map(e => e.d / D.pathLength));
    const health = s.enemies.reduce((n,e) => n+e.hp,0);
    const threatened = s.enemies.filter(e => e.d > D.pathLength * .65);
    if (front > .8 && threatened.some(e=>e.frozen<.8) && s.time-(game.lastIce??-100)>5.5) {
      const a=command('potion','ice');if(a){game.lastIce=s.time;return a;}
    }
    if (front > .55 && s.enemies.length >= 8 && health > 10000 && game.lastLightningWave!==s.wave) {
      const a=command('potion','lightning');if(a){game.lastLightningWave=s.wave;return a;}
    }
  }
  if (policy.economy && s.miners < (s.wave >= 14 ? 18 : s.wave >= 7 ? 12 : 8) && s.towers.length >= 3 && s.time < 1800
      && s.gold >= D.minerCost(s.miners) + 140) {
    const a=command('hire');if(a)return a;
  }
  if ((policy.research || policy.repair) && s.population < 4 && s.wave >= 8
      && s.gold >= D.populationCost(s.population) + 140) {
    const a=command('hireWoodcutter');if(a)return a;
  }
  if (policy.research && s.population >= 2) {
    if (!s.lab) {const a=command('buildLab');if(a)return a;}
    if (s.lab && !s.labBuild && s.wave >= 8) {
      for (const kind of ['ice','lightning']) if (s.research[kind]===0) {
        const a=command('researchPotion',kind);if(a)return a;
      }
    }
  }
  const castleTarget = Math.min(policy.castleMax,
    s.wave >= 25 ? 20 : s.wave >= 18 ? 17 : s.wave >= 12 ? 13 : s.wave >= 7 ? 9 : 5);
  if (s.castle < castleTarget) {const a=command('upgradeCastle');if(a)return a;}
  const types = policy.archer ? ['archer'] : ['ballista','cannon','frost','storm','archer'];
  const desiredLevel = s.wave >= 15 ? 5 : s.wave >= 7 ? 3 : 2;
  for (const type of types) if (count(type) && s.towerLevels[type] < desiredLevel) {
    const a=command('upgradeTower',type);if(a)return a;
  }
  if (policy.archer) return build('archer');
  const weights = {archer: 2,ballista: 6,cannon: 8,frost: 4,storm: 6};
  const unlocked = D.TYPES.filter(t=>t.era<=game.era && (t.id!=='archer'||count('archer')<3))
    .sort((a,b)=>count(a.id)/weights[a.id]-count(b.id)/weights[b.id]);
  // Save for the next role instead of buying a cheaper tower on every fallback.
  return unlocked.length ? build(unlocked[0].id) : null;
}

export function run(D, policy, seed, target=40) {
  let rngState=seed;
  const game = new D.Game(()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;});
  game.setTreeSites(trees); game.start();
  const cleared=new Set(); const actions={}; let damage=0,leaks=0,destroyed=0,invalid=0;
  const resolve=game.resolveEnemy.bind(game);
  game.resolveEnemy=e=>{if(e.hp>0)leaks++;return resolve(e);};
  const destroy=game.destroyEffect.bind(game);
  game.destroyEffect=(t,cause)=>{destroyed++;return destroy(t,cause);};
  let tick=0;
  while (!game.s.over && tick<60000 && cleared.size<target) {
    const action = choose(game,D,policy);
    if(action) {
      const result = game[action.name](...action.args);
      if(result.error)invalid++;
      else {const key=action.name+':'+(action.args[0]??'');actions[key]=(actions[key]??0)+1;}
    }
    const hp=game.s.hp;
    for(let i=0;i<10&&!game.s.over&&tick<60000;i++) {
      const active=game.s.waves.map(w=>w.number);game.tick(.1);tick++;
      if(!game.s.over)for(const w of active)if(!game.s.waves.some(n=>n.number===w))cleared.add(w);
      if(cleared.size>=target&&!game.s.enemies.length)break;
    }
    damage+=Math.max(0,hp-game.s.hp);
  }
  let contiguous=0;while(cleared.has(contiguous+1))contiguous++;
  return {seed,cleared:contiguous,time:game.s.time,hp:game.s.hp,kills:game.s.kills,leaks,damage,destroyed,invalid,
    castle:game.s.castle,miners:game.s.miners,workers:game.s.population,gold:game.s.gold,crystals:game.s.crystals,
    actions,end:game.s.over?'castle_destroyed':contiguous>=target?'target_wave':'time_limit'};
}

export function summarize(rows) {
  const mean=key=>rows.reduce((n,row)=>n+row[key],0)/rows.length;
  return {episodes:rows.length,mean_cleared:mean('cleared'),min_cleared:Math.min(...rows.map(r=>r.cleared)),
    max_cleared:Math.max(...rows.map(r=>r.cleared)),mean_time:mean('time'),mean_kills:mean('kills'),mean_hp:mean('hp'),
    mean_damage:mean('damage'),mean_leaks:mean('leaks'),mean_destroyed:mean('destroyed'),invalid:rows.reduce((n,r)=>n+r.invalid,0),
    reached:Object.fromEntries([10,15,16,20,30,40].map(n=>[n,rows.filter(r=>r.cleared>=n).length]))};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const candidate=CANDIDATES.find(c=>c.id===(process.argv[2]??'baseline'));
  if(!candidate)throw new Error('Unknown candidate');
  const n=Number(process.argv[3]??3);if(!Number.isInteger(n)||n<1||n>20)throw new Error('Invalid episode count');
  const start=Number(process.argv[4]??100000);if(!Number.isInteger(start)||start<0||start+n>2**32)throw new Error('Invalid seed range');
  const output=process.argv[5];if(!output)throw new Error('Explicit new JSON output path required');
  if(fs.existsSync(output))throw new Error('Output exists');
  const began=performance.now();
  const sha=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
  const D=engine(candidate),results={candidate,seed_start:start,policies:{},
    source_sha256:{engine:sha(source),balance:sha(balanceSource),
      harness:sha(fs.readFileSync(new URL('./civilization.mjs',import.meta.url),'utf8'))}};
  for(const policy of POLICIES){const rows=Array.from({length:n},(_,i)=>run(D,policy,start+i));
    results.policies[policy.id]={summary:summarize(rows),episodes:rows};
    console.log(policy.id,JSON.stringify(results.policies[policy.id].summary));}
  results.wall_seconds=(performance.now()-began)/1000;
  fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n',{flag:'wx'});
}
