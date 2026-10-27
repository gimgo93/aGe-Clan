import fs from 'node:fs';import vm from 'node:vm';import readline from 'node:readline';
import {createHash} from 'node:crypto';import trees from '../lib/trees.js';
import {runFrontier} from './frontier50.mjs';import {choose} from './policies.mjs';
import {tracedDefense,observeChoice,finishTrace,reconstructSpend} from './crystal-trace.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const sources={game:read('../public/game/game.js'),balance:read('../public/game/balance.js'),
 policies:read('./policies.mjs'),evaluator:read('./frontier50.mjs'),trace:read('./crystal-trace.mjs'),
 worker:read('./crystal-worker.mjs'),trees};
const fingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const c=vm.createContext({});c.window=c;vm.runInContext(sources.balance,c);vm.runInContext(sources.game,c);
for await(const line of readline.createInterface({input:process.stdin})) {
 try {
  const q=JSON.parse(line);let result;
  if(q.op==='describe')result={fingerprint,sources};
  else if(q.op==='simulate') {
    const traced=tracedDefense(c.Defense);
    const policy={id:'crystal-diagnostic',economy:true,castleMax:20,research:true,potions:true,repair:true};
    const game=runFrontier(traced.D,policy,q.seed,trees,
      {decisionTicks:2,hpMultiplier:1,chooseAction:observeChoice(choose,traced.trace)});
    const trace=finishTrace(traced.trace(),game),reconstructed=reconstructSpend(game,c.Defense);
    for(const key of new Set([...Object.keys(trace.spending),...Object.keys(reconstructed)]))
      if((trace.spending[key]??0)!==(reconstructed[key]??0))throw Error('Action ledger mismatch');
    result={...game,crystalTrace:trace};
  }else throw Error('Unknown operation');
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error)})+'\n');}
}
