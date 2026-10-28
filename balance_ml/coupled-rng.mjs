// ML-only common-random-event adapter. Production source remains untouched.
import {createHash} from 'node:crypto';
export const RNG_PROTOCOL='event-sha256-u32-v1';
const EXPECTED={mine:1,spawn:2,hireWoodcutter:1,chooseNextTree:1};

export function eventUniform(seed,stream,event,draw) {
  if(!Number.isInteger(seed)||seed<0||seed>=2**32||typeof stream!=='string'||!stream||
    !Array.isArray(event)||event.some(x=>!Number.isSafeInteger(x)||x<0)||!Number.isSafeInteger(draw)||draw<0)
    throw Error('Invalid random event key');
  const key=JSON.stringify([RNG_PROTOCOL,seed,stream,event,draw]);
  return createHash('sha256').update(key).digest().readUInt32LE(0)/4294967296;
}

export function validateRngSites(D,source) {
  const total=(source.match(/this\.rng\s*\(/g)||[]).length;
  if(total!==Object.values(EXPECTED).reduce((a,b)=>a+b,0)||
     (source.match(/this\.rng\b/g)||[]).length!==6||
     (source.match(/Math\.random/g)||[]).length!==1)throw Error('Unsupported engine random call sites');
  for(const [name,count] of Object.entries(EXPECTED))
    if((D.Game.prototype[name]?.toString().match(/this\.rng\s*\(/g)||[]).length!==count)
      throw Error('Changed random method: '+name);
}

export function eventDefense(D,seed,source) {
  validateRngSites(D,source);
  // Validate the seed before game construction even if no draw is needed.
  eventUniform(seed,'validate',[],0);
  let lastTrace;
  class EventGame extends D.Game {
    constructor() {
      const fail=()=>{throw Error('Unscoped random draw in event protocol');};
      super(fail);
      const trace={protocol:RNG_PROTOCOL,counts:{},samples:[]};lastTrace=trace;
      let mineIndex=0;const transitions=new WeakMap(),sampleCounts={};
      const scoped=(stream,event,fn)=>{
        const previous=this.rng;let index=0;
        this.rng=()=>{
          const draw=index++,value=eventUniform(seed,stream,event,draw);
          trace.counts[stream]=(trace.counts[stream]??0)+1;
          // Keep a bounded audit sample, not the entire random tape.
          if((sampleCounts[stream]??0)<32) {
            trace.samples.push({stream,event:[...event],draw,value});sampleCounts[stream]=(sampleCounts[stream]??0)+1;
          }
          return value;
        };
        try{return fn();}finally{this.rng=previous;}
      };
      const mine=this.mine.bind(this);
      this.mine=(...args)=>scoped('mine',[mineIndex++],()=>mine(...args));
      const spawn=this.spawn.bind(this);
      this.spawn=w=>scoped('spawn',[w.number,w.spawned],()=>spawn(w));
      const hire=this.hireWoodcutter.bind(this);
      this.hireWoodcutter=(...args)=>scoped('hireWoodcutter',[this.s.population],()=>hire(...args));
      const next=this.chooseNextTree.bind(this);
      this.chooseNextTree=worker=>{
        const id=this.s.workers.indexOf(worker);
        if(id<0)throw Error('Untracked worker');
        const event=transitions.get(worker)??0;transitions.set(worker,event+1);
        return scoped('chooseNextTree',[id,event],()=>next(worker));
      };
      // Each simulation requires a new instance; prevent stale event counters on reset.
      this.reset=()=>{throw Error('Create a new event-protocol game to reset');};
    }
  }
  return {D:{...D,Game:EventGame},trace:()=>lastTrace};
}
