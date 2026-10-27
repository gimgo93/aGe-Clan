// Read-only instrumentation on actual instances. Validator probes never get a trace.
const METHODS=['upgradeCastle','upgradeTower','researchPotion','potion'];
export function tracedDefense(D) {
  let latest;
  class TracedGame extends D.Game {
    constructor(...args) {
      super(...args);
      const trace={initial:this.s.crystals,acquired:0,spent:0,spending:{},events:[],
        castleWaitDecisions:0,waitByCastle:{}};
      latest=trace;
      for(const name of METHODS) {
        const original=this[name].bind(this);
        this[name]=(...values)=>{
          const before=this.s.crystals,castle=this.s.castle;
          const result=original(...values);
          const amount=before-this.s.crystals;
          if(!result.error&&amount) {
            const key=name+':'+(values[0]??'');
            trace.spent+=amount;trace.spending[key]=(trace.spending[key]??0)+amount;
            trace.events.push({time:this.s.time,wave:this.s.wave,castle,action:key,amount,
              before,after:this.s.crystals});
          }
          return result;
        };
      }
      const mine=this.mine.bind(this);
      this.mine=(...values)=>{const before=this.s.crystals;const result=mine(...values);
        trace.acquired+=this.s.crystals-before;return result;};
    }
  }
  return {D:{...D,Game:TracedGame},trace:()=>latest};
}

export function observeChoice(choose,trace) {
  return (game,D,policy)=>{
    const s=game.s;
    if(s.wave>=18&&s.castle<17&&s.crystals<D.castleCost(s.castle)) {
      trace().castleWaitDecisions++;
      const key=String(s.castle);trace().waitByCastle[key]=(trace().waitByCastle[key]??0)+1;
    }
    return choose(game,D,policy);
  };
}

export function finishTrace(trace,result) {
  const balanceError=trace.initial+trace.acquired-trace.spent-result.crystals;
  if(balanceError!==0)throw Error('Crystal conservation failed');
  return {...trace,final:result.crystals,balanceError};
}

export function reconstructSpend(result,D) {
  const spending={};const actions=result.actions;
  const count=key=>{
    const n=actions[key]??0;
    if(!Number.isInteger(n)||n<0)throw Error('Invalid action count');return n;
  };
  const castles=count('upgradeCastle:');if(castles>19)throw Error('Castle level overflow');
  if(result.castle!==undefined&&result.castle!==castles+1)throw Error('Castle/action mismatch');
  spending['upgradeCastle:']=Array.from({length:castles},(_,i)=>D.castleCost(i+1)).reduce((a,b)=>a+b,0);
  for(const type of D.TYPES) {
    const n=count('upgradeTower:'+type.id);if(n>4)throw Error('Tower level overflow');
    spending['upgradeTower:'+type.id]=Array.from({length:n},(_,i)=>D.towerCost(i+1,type.id)).reduce((a,b)=>a+b,0);
  }
  for(const kind of ['ice','lightning']) {
    const research=count('researchPotion:'+kind);if(research>1)throw Error('Research repeat unsupported');
    spending['researchPotion:'+kind]=research*20;spending['potion:'+kind]=count('potion:'+kind)*7;
  }
  const supported=new Set(['build','hire','hireWoodcutter','buildLab','repairCastle','upgradeCastle',
    'upgradeTower','researchPotion','potion']);
  for(const [key,n] of Object.entries(actions)) {
    if(!Number.isInteger(n)||n<0||!supported.has(key.split(':')[0]))throw Error('Unknown action in solo ledger');
    if(key.startsWith('researchPotion:')||key.startsWith('potion:'))
      if(!['ice','lightning'].includes(key.split(':')[1]))throw Error('Unsupported potion ledger');
    if(key.startsWith('upgradeTower:')&&!D.TYPES.some(t=>key==='upgradeTower:'+t.id))throw Error('Unknown tower');
  }
  return spending;
}
