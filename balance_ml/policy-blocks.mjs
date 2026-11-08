// ML-only policy decomposition. Existing workers retain policies.mjs as their default.
export const POLICY_BLOCKS_VERSION='investment-blocks-v1';
export const DEFAULT_INVESTMENT_ORDER=Object.freeze([
  'economy','workforce','research','castle','towerUpgrade','towerBuild',
]);
const PADS=Object.freeze([3,0,4,5,8,6,10,2,1,7,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]);

export function createPolicyChooser({investmentOrder=DEFAULT_INVESTMENT_ORDER}={}) {
  if(!Array.isArray(investmentOrder)||investmentOrder.length!==DEFAULT_INVESTMENT_ORDER.length||
     new Set(investmentOrder).size!==investmentOrder.length||
     Array.from(investmentOrder).some(name=>!DEFAULT_INVESTMENT_ORDER.includes(name)))
    throw Error('Expected every investment block exactly once');
  const order=Object.freeze([...investmentOrder]);
  return function chooseBlocks(game,D,policy) {
    const s=game.s;
    const count=type=>s.towers.filter(t=>t.type===type).length;
    const command=(name,...args)=>{
      const probe=Object.create(D.Game.prototype);
      probe.s=structuredClone(s);probe.id=game.id;
      probe.treeSites=game.treeSites;probe.rng=()=>.5;
      return !probe[name](...args).error?{name,args}:null;
    };
    const build=type=>{
      const pad=PADS.find(p=>!s.towers.some(t=>t.pad===p));
      return pad===undefined?null:command('build',type,pad);
    };
    // Preserve the dedicated archer controller and all survival priorities.
    if(policy.id==='archer-fixed') {
      if(s.towerLevels.archer<5){const a=command('upgradeTower','archer');if(a)return a;}
      if(s.castle<5){const a=command('upgradeCastle');if(a)return a;}
      return build('archer');
    }
    if(s.towers.length<2){const a=build('archer');if(a)return a;}
    if(s.towerLevels.archer<(s.wave>=3?5:3)) {
      const a=command('upgradeTower','archer');if(a)return a;
    }
    if(s.time<180&&s.towers.length<3){const a=build('archer');if(a)return a;}
    if(policy.repair&&s.hp<s.maxHp*.55){const a=command('repairCastle');if(a)return a;}
    if(policy.potions&&s.wave>=30&&s.enemies.length) {
      const front=Math.max(...s.enemies.map(e=>e.d/D.pathLength));
      const health=s.enemies.reduce((n,e)=>n+e.hp,0);
      const threatened=s.enemies.filter(e=>e.d>D.pathLength*.65);
      if(front>.8&&threatened.some(e=>e.frozen<.8)&&s.time-(game.lastIce??-100)>5.5) {
        const a=command('potion','ice');if(a){game.lastIce=s.time;return a;}
      }
      if(front>.55&&s.enemies.length>=8&&health>10000&&game.lastLightningWave!==s.wave) {
        const a=command('potion','lightning');if(a){game.lastLightningWave=s.wave;return a;}
      }
    }
    const blocks={
      economy:()=>{
        if(policy.economy&&s.miners<(s.wave>=14?(policy.minerLateCap??18):s.wave>=7?12:8)&&
           s.towers.length>=3&&s.time<1800&&s.gold>=D.minerCost(s.miners)+140)
          return command('hire');
        return null;
      },
      workforce:()=>{
        if((policy.research||policy.repair)&&s.population<4&&s.wave>=8&&
           s.gold>=D.populationCost(s.population)+140)return command('hireWoodcutter');
        return null;
      },
      research:()=>{
        if(policy.research&&s.population>=2) {
          if(!s.lab){const a=command('buildLab');if(a)return a;}
          if(s.lab&&!s.labBuild&&s.wave>=8)
            for(const kind of ['ice','lightning'])if(s.research[kind]===0) {
              const a=command('researchPotion',kind);if(a)return a;
            }
        }
        return null;
      },
      castle:()=>{
        const target=Math.min(policy.castleMax,s.wave>=25?20:s.wave>=18?17:s.wave>=12?13:s.wave>=7?9:5);
        return s.castle<target?command('upgradeCastle'):null;
      },
      towerUpgrade:()=>{
        const types=policy.archer?['archer']:['ballista','cannon','frost','storm','archer'];
        const desired=s.wave>=15?5:s.wave>=7?3:2;
        for(const type of types)if(count(type)&&s.towerLevels[type]<desired) {
          const a=command('upgradeTower',type);if(a)return a;
        }
        return null;
      },
      towerBuild:()=>{
        if(policy.archer)return build('archer');
        const weights={archer:2,ballista:6,cannon:8,frost:4,storm:6};
        const unlocked=D.TYPES.filter(t=>t.era<=game.era&&(t.id!=='archer'||count('archer')<3))
          .sort((a,b)=>count(a.id)/weights[a.id]-count(b.id)/weights[b.id]);
        return unlocked.length?build(unlocked[0].id):null;
      },
    };
    for(const name of order){const a=blocks[name]();if(a)return a;}
    return null;
  };
}

export const chooseBlocks=createPolicyChooser();
