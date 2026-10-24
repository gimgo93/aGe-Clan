import fs from 'node:fs';
import vm from 'node:vm';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import trees from '../lib/trees.js';
import {POLICIES, run} from './policies.mjs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../public/game/game.js');
const balanceSource=read('../public/game/balance.js');
const c=vm.createContext({window:{}});vm.runInContext(balanceSource,c);
const base=JSON.parse(JSON.stringify(c.window.FRONTIER_BALANCE));
export const schema={};
for(const type of Object.keys(base.towers))for(const field of ['damage','gold']){
  const value=base.towers[type][field];schema[`towers.${type}.${field}`]={base:value,min:Math.round(value*.8),max:Math.round(value*1.2),integer:true};
}
schema.startGold={base:base.startGold,min:200,max:280,integer:true};
schema['soloArrowResistance.step']={base:base.soloArrowResistance.step,min:.15,max:.25,integer:false};
const sha=s=>createHash('sha256').update(s).digest('hex');
const sources={game:source,balance:balanceSource,policies:read('./policies.mjs'),trees};
const fingerprint=sha(JSON.stringify({sources,schema,worker:read('./worker.mjs')}));
export function engine(params={}){
  const config=structuredClone(base);
  for(const [key,value] of Object.entries(params)){
    const spec=schema[key];
    if(!spec||typeof value!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max||(spec.integer&&!Number.isInteger(value)))throw Error('Invalid parameter: '+key);
    const path=key.split('.');let node=config;for(const part of path.slice(0,-1))node=node[part];node[path.at(-1)]=value;
  }
  const context=vm.createContext({FRONTIER_BALANCE:config});vm.runInContext(source,context);
  return context.Defense;
}
const cache=new Map();
const lines=readline.createInterface({input:process.stdin});
for await(const line of lines){try{
  const q=JSON.parse(line);let result;
  if(q.op==='describe')result={fingerprint,schema,policies:POLICIES.map(p=>p.id),sources};
  else if(q.op==='simulate'){
    if(!Number.isInteger(q.seed)||q.seed<0||q.seed>=2**32)throw Error('Invalid seed');
    const policy=POLICIES.find(p=>p.id===q.policy);if(!policy)throw Error('Invalid policy');
    const key=JSON.stringify(q.params??{});if(!cache.has(key)){if(cache.size>=16)cache.clear();cache.set(key,engine(q.params));}
    result=run(cache.get(key),policy,q.seed,40,trees);
  }else throw Error('Unknown operation');
  process.stdout.write(JSON.stringify({ok:true,result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error)})+'\n');}}
