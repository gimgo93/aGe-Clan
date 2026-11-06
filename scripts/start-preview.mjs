// Portable compiled preview. Keep deployment output unchanged; only the local
// config copy drops the legacy field removed by current Wrangler releases.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
 if(args[i]!=='--port'||!/^\d+$/.test(args[i+1]||'')||Number(args[i+1])<1024||Number(args[i+1])>65535)throw Error('Preview accepts only --port <1024..65535>');
}
const configPath=new URL('../dist/server/wrangler.json',import.meta.url),previewPath=new URL('../dist/server/wrangler.local-preview.json',import.meta.url);
const config=JSON.parse(readFileSync(configPath,'utf8'));delete config.legacy_env;
writeFileSync(previewPath,JSON.stringify(config,null,2)+'\n');
const cli=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
const child=spawn(process.execPath,[fileURLToPath(cli),'dev','--config',fileURLToPath(previewPath),'--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--inspector-port','0',...args],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
process.exitCode=code;
