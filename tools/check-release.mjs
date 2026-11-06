import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const checks=['security-boundaries','accounts','account-badges','pvp-gateway','pvp','checkpoint','client-commands','network-recovery','lag-regressions','ui-audio','startup','ux-refinement','achievement-state','interface-style','frontier-protocol','title-travelers','client-observer'];
const results=[];
for(const check of checks){
 const result=spawnSync(process.execPath,['tools/check-'+check+'.mjs'],{encoding:'utf8',timeout:30000});
 const passed=result.status===0&&!result.error;
 results.push({check,passed,exitCode:result.status,output:(result.stdout+result.stderr).trim(),error:result.error?.message});
 console.log(`${passed?'PASS':'FAIL'} ${check}`);
}
const report={at:new Date().toISOString(),scope:'Local unit and regression checks only; no production requests',passed:results.every(r=>r.passed),results};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
if(!report.passed)process.exitCode=1;
