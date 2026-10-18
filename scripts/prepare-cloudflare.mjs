import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep the Sites build intact; produce a separate config for the owner's account.
const databaseId = process.env.CLAN_DATABASE_ID;
if (!databaseId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(databaseId) || databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Set CLAN_DATABASE_ID to the real D1 database UUID returned by wrangler d1 create age-clan-db.');
}
const workerName = process.env.CLAN_WORKER_NAME || 'age-clan';
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)) throw new Error('Invalid CLAN_WORKER_NAME.');
const output = new URL('../dist/server/wrangler.deploy.json', import.meta.url);
const built = JSON.parse(await readFile(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
if (!built.durable_objects?.bindings?.some(binding => binding.name === 'CLAN_ROOMS' && binding.class_name === 'ClanRoom')) {
  throw new Error('The build is missing ClanRoom. Run npm run build with the current sources.');
}
const config = {
  name: workerName,
  main: built.main,
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  workers_dev: true,
  no_bundle: built.no_bundle,
  rules: built.rules,
  assets: built.assets,
  durable_objects: built.durable_objects,
  migrations: built.migrations,
  d1_databases: [{ binding: 'DB', database_name: process.env.CLAN_DATABASE_NAME || 'age-clan-db', database_id: databaseId, migrations_dir: '../../drizzle' }],
  observability: { enabled: true },
};
if (process.env.CLOUDFLARE_ACCOUNT_ID) config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID;
await writeFile(output, JSON.stringify(config, null, 2) + '\n');
console.log(`Cloudflare deploy config: ${fileURLToPath(output)}`);
