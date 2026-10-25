import fs from 'node:fs';
import vm from 'node:vm';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import trees from '../lib/trees.js';
import {runFrontier,FRONTIER_PROFILES} from './frontier50.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const sources={game:read('../public/game/game.js'),balance:read('../public/game/balance.js'),
 policies:read('./policies.mjs'),evaluator:read('./frontier50.mjs'),worker:read('./frontier-worker.mjs'),trees};
const fingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const context=vm.createContext({});context.window=context;vm.runInContext(sources.balance,context);vm.runInContext(sources.game,context);
for await(const line of readline.createInterface({input:process.stdin})){
 try{const q=JSON.parse(line);let result;
  if(q.op==='describe')result={fingerprint,sources,profiles:FRONTIER_PROFILES};
  else if(q.op==='simulate'){
   const profile=FRONTIER_PROFILES.find(p=>p.id===q.policy);if(!profile)throw Error('Unknown profile');
   if(![1,1.05].includes(q.hpMultiplier))throw Error('Unknown HP candidate');
   result=runFrontier(context.Defense,profile,q.seed,trees,{decisionTicks:profile.decisionTicks,hpMultiplier:q.hpMultiplier});
  }else throw Error('Unknown operation');
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error)})+'\n');}
}
