import fs from 'node:fs';
import vm from 'node:vm';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import trees from '../lib/trees.js';
import {runFrontier} from './frontier50.mjs';
import {chooseReserved} from './reserve-policy.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const sources={game:read('../public/game/game.js'),balance:read('../public/game/balance.js'),
 policies:read('./policies.mjs'),evaluator:read('./frontier50.mjs'),reserve:read('./reserve-policy.mjs'),
 worker:read('./reserve-worker.mjs'),plan:read('./reserve-plan.json'),trees};
const fingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const context=vm.createContext({});context.window=context;
vm.runInContext(sources.balance,context);vm.runInContext(sources.game,context);
for await(const line of readline.createInterface({input:process.stdin})) {
 try {
  const q=JSON.parse(line);let result;
  if(q.op==='describe')result={fingerprint,sources};
  else if(q.op==='simulate') {
   if(typeof q.reserve!=='boolean')throw Error('Explicit reserve flag required');
   const policy={id:q.reserve?'reserve':'control',economy:true,castleMax:20,research:true,
      potions:true,repair:true,castlePotionReserve:q.reserve};
   result=runFrontier(context.Defense,policy,q.seed,trees,
      {decisionTicks:2,hpMultiplier:1,chooseAction:chooseReserved});
  } else throw Error('Unknown operation');
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 } catch(error) {process.stdout.write(JSON.stringify({ok:false,error:String(error)})+'\n');}
}
