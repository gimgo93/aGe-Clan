import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=data=>createHash('sha256').update(data).digest('hex');
const canonical=path=>sha(readFileSync(path,'utf8').replace(/\r\n/g,'\n'));
const paths=git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean).filter(p=>!p.startsWith('release/')&&!p.startsWith('.openai/'));
const files=Object.fromEntries(paths.sort().map(path=>[path,{sha256:sha(readFileSync(path))}]));
const report={format:1,createdAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),branch:git('branch','--show-current'),dirty:!!git('status','--porcelain'),
 referenceProduction:{siteVersion:56,sourceCommit:'109e353fd10547432d8a716ff84da8544d646df9',deployment:'appgdep_6aebab35c99c81919d29353b585e351b',verifiedAt:'2026-11-05',metadataRecheck:'unavailable: Sites project_not_found and empty project list; v56 is last authenticated frontend baseline, not reverified active metadata',externalPvpVersion:'3371a1f4-c92e-4bf9-a1bd-d87cd8fc87c0',externalPvpSourceCommit:'a7fb12ef2374f2aad2322ae727d2539602df3a61',externalPvpDeployedAt:'2026-11-05T12:01:00.2692Z'},
 canonicalLfSha256:Object.fromEntries(['public/game/game.js','public/game/balance.js','lib/game-engine.js','lib/match-engine.js','lib/clan-room.js','build/pvp-worker.js'].map(path=>[path,canonical(path)])),
 schemaMigrationSha256:Object.fromEntries(paths.filter(p=>/^drizzle\/.*\.sql$/.test(p)).map(path=>[path,canonical(path)])),excluded:['release/**','.openai/**'],files,
 limitations:['This is a local source manifest, not evidence of production deployment.','External Worker version, bindings and source must be independently checked.','No DB schema or Durable Object class migration in this patch.']};
const serialized=JSON.stringify(report,null,2)+'\n';if(process.argv[2])writeFileSync(process.argv[2],serialized);else console.log(serialized);
