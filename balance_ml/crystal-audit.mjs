// Reconstruct completed solo ledgers from their own recorded engine. No games run.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {createHash} from 'node:crypto';import {reconstructSpend} from './crystal-trace.mjs';
const run=process.argv[2];if(!run)throw Error('Usage: node balance_ml/crystal-audit.mjs RUN');
const read=name=>JSON.parse(fs.readFileSync(path.join(run,name),'utf8'));
const manifest=read('manifest.json'),progress=read('progress.json'),sources=read('source-snapshot.json');
if(progress.state!=='complete')throw Error('Completed run required');
if(createHash('sha256').update(JSON.stringify(sources)).digest('hex')!==manifest.fingerprint)
 throw Error('Recorded source fingerprint mismatch');
const c=vm.createContext({});c.window=c;vm.runInContext(sources.balance,c);vm.runInContext(sources.game,c);
const D=c.Defense;
const castle17=Array.from({length:16},(_,i)=>D.castleCost(i+1)).reduce((a,b)=>a+b,0);
const rows=fs.readFileSync(path.join(run,'episodes.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
if(rows.length!==progress.completed_games||new Set(rows.map(r=>r.id)).size!==rows.length)
 throw Error('Journal count/identity mismatch');
const groups={};
for(const row of rows) {
 if(row.params&&Object.keys(row.params).length)throw Error('Changed-parameter runs require their own cost reconstruction');
 if(!['control','reserve','miners22'].includes(row.variant)||row.result.target!==50)throw Error('Unsupported paired solo protocol');
 const result=row.result,spending=reconstructSpend(result,D);
 const spent=Object.values(spending).reduce((a,b)=>a+b,0);
 const acquired=spent+result.crystals-D.BALANCE.startCrystals;
 if(!Number.isInteger(acquired)||acquired<0)throw Error('Invalid inferred crystal income');
 const key=row.stage+':'+row.variant;
 const g=groups[key]??={games:0,spending:{},spent:0,final:0,inferred_acquired:0,
   games_with_total_crystals_at_least_castle17_cost:0};
 g.games++;g.spent+=spent;g.final+=result.crystals;g.inferred_acquired+=acquired;
 if(spent+result.crystals>=castle17)g.games_with_total_crystals_at_least_castle17_cost++;
 for(const [key,value] of Object.entries(spending))g.spending[key]=(g.spending[key]??0)+value;
}
for(const g of Object.values(groups)) {
 g.mean_spent=g.spent/g.games;g.mean_final=g.final/g.games;
 g.mean_inferred_acquired=g.inferred_acquired/g.games;
 g.mean_spending=Object.fromEntries(Object.entries(g.spending).map(([k,v])=>[k,v/g.games]));
}
console.log(JSON.stringify({fingerprint:manifest.fingerprint,castle17_cost:castle17,groups,
 limitations:['Income inferred from ending stocks and reconstructed spending, not independently observed.',
 'No action timing reconstructed; cannot prove an alternative spending order would survive.',
 'Only the recorded solo policy action set is supported.']},null,2));
