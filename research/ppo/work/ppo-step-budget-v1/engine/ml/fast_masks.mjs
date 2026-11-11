// Pure legality adapter. Uses the original engine's costs and era rules.
import D from '../lib/game-engine.js';
const {TYPES,castleCost,towerCost,minerCost,populationCost}=D;
export function fastMasks(game,actions,targetWave=0){
  const s=game.s,active=game.canAct(),occupied=new Set(s.towers.map(t=>t.pad));
  const specs=new Map(TYPES.map(t=>[t.id,t]));
  return actions.map(a=>{
    if(a.name==='wait')return true;
    if(!active)return false;
    switch(a.name){
      case 'build':{const [kind,pad]=a.args,p=specs.get(kind);return p.era<=game.era&&s.gold>=p.gold&&!occupied.has(pad);}
      case 'hire':{const c=minerCost(s.miners);return c!==null&&s.gold>=c;}
      case 'hireWoodcutter':{const c=populationCost(s.population);return c!==null&&s.gold>=c&&game.treeSites.length>0;}
      case 'upgradeCastle':{const c=castleCost(s.castle);return c!==null&&s.crystals>=c;}
      case 'upgradeTower':{const p=specs.get(a.args[0]),c=towerCost(s.towerLevels[p.id],p.id);return p.era<=game.era&&c!==null&&s.crystals>=c;}
      case 'startWave':return s.waves.length+a.args[0]<=2&&!(targetWave>0&&s.wave+a.args[0]>targetWave);
      case 'sellTower':return occupied.has(a.pad);
      case 'buildLab':return !s.lab&&s.wood>=200;
      case 'researchPotion':return s.lab&&s.labBuild<=0&&s.research[a.args[0]]===0&&s.crystals>=20;
      case 'potion':return s.research[a.args[0]]===-1&&s.enemies.length>0&&s.potionCooldown[a.args[0]]<=0&&s.crystals>=7;
      case 'repairCastle':return s.hp<s.maxHp&&s.wood>=5*2**s.repairCount;
      default:throw Error('Uncovered action '+a.name);
    }
  });
}
