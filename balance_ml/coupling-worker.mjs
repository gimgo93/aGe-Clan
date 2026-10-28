import fs from 'node:fs';import vm from 'node:vm';import readline from 'node:readline';
import {createHash} from 'node:crypto';import trees from '../lib/trees.js';
import {runFrontier} from './frontier50.mjs';import {choose} from './policies.mjs';
import {eventDefense,RNG_PROTOCOL,validateRngSites} from './coupled-rng.mjs';
import {tracedDefense,observeChoice,finishTrace,reconstructSpend} from './crystal-trace.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const sources={game:read('../public/game/game.js'),balance:read('../public/game/balance.js'),
 policies:read('./policies.mjs'),evaluator:read('./frontier50.mjs'),trace:read('./crystal-trace.mjs'),
 rng:read('./coupled-rng.mjs'),worker:read('./coupling-worker.mjs'),plan:read('./coupling-plan.json'),trees};
const fingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const c=vm.createContext({});c.window=c;vm.runInContext(sources.balance,c);vm.runInContext(sources.game,c);
validateRngSites(c.Defense,sources.game);
for await(const line of readline.createInterface({input:process.stdin})) {
 try {
  const q=JSON.parse(line);let result;
  if(q.op==='describe')result={fingerprint,sources};
  else if(q.op==='simulate') {
    if(!['legacy-lcg',RNG_PROTOCOL].includes(q.rngMode)||![18,22].includes(q.minerCap))throw Error('Unsupported protocol or cap');
    const coupled=q.rngMode===RNG_PROTOCOL?eventDefense(c.Defense,q.seed,sources.game):null;
    const traced=tracedDefense(coupled?.D??c.Defense);
    const policy={id:'cap'+q.minerCap,economy:true,castleMax:20,research:true,potions:true,repair:true,minerLateCap:q.minerCap};
    const game=runFrontier(traced.D,policy,q.seed,trees,
      {decisionTicks:2,hpMultiplier:1,chooseAction:observeChoice(choose,traced.trace)});
    const trace=finishTrace(traced.trace(),game),ledger=reconstructSpend(game,c.Defense);
    for(const key of new Set([...Object.keys(trace.spending),...Object.keys(ledger)]))
      if((trace.spending[key]??0)!==(ledger[key]??0))throw Error('Crystal ledger mismatch');
    result={...game,rngProtocol:q.rngMode,minerCap:q.minerCap,
      randomAudit:coupled?.trace()??null,crystalTrace:trace};
  }else throw Error('Unknown operation');
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error)})+'\n');}
}
