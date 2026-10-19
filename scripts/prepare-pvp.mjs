import {mkdir,writeFile} from 'node:fs/promises';
const id=process.env.CLAN_DATABASE_ID;
if(!id||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)||id==='00000000-0000-4000-8000-000000000000')throw Error('CLAN_DATABASE_ID에 본인 D1 database_id를 설정하세요.');
const name=process.env.CLAN_WORKER_NAME||'age-clan-pvp';
if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name))throw Error('Invalid CLAN_WORKER_NAME');
const config={name,main:'../../build/pvp-worker.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,
 durable_objects:{bindings:[{name:'CLAN_ROOMS',class_name:'ClanRoom'}]},migrations:[{tag:'clan-rooms-v1',new_sqlite_classes:['ClanRoom']}],
 d1_databases:[{binding:'DB',database_name:process.env.CLAN_DATABASE_NAME||'age-clan-pvp-db',database_id:id,migrations_dir:'../../drizzle'}],observability:{enabled:true}};
if(process.env.CLOUDFLARE_ACCOUNT_ID)config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID;
await mkdir(new URL('../dist/pvp/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/pvp/wrangler.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
console.log('PvP config ready: dist/pvp/wrangler.json (no credentials saved).');
