// Low-volume public GET observations. No login, rooms, DB credentials or writes to the site.
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ORIGIN = 'https://ageclan.com';
const endpoints = ['/game/', '/api/clan', '/game/balance.js', '/game/game.js'];
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

async function bodyText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Response exceeds observation limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {await reader.cancel().catch(() => {});}
}

export async function observe({fetcher = fetch, samples = 2} = {}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 3) throw new Error('samples must be 1–3');
  const targets = await Promise.all(endpoints.map(async endpoint => {
    const observations = [];
    for (let i = 0; i < samples; i++) {
      const started = performance.now();
      try {
        // Refuse redirects: never silently probe another provider or call a mutating API.
        const response = await fetcher(ORIGIN + endpoint, {
          method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000),
          headers: {'User-Agent': 'aGe-Clan-low-volume-status/1.0'},
        });
        const text = await bodyText(response);
        const item = {status: response.status, response_ms: Math.round(performance.now() - started),
                      outcome: response.ok ? 'ok' : 'http_error', content_sha256: hash(text)};
        if (endpoint === '/api/clan' && response.ok) {
          let data; try {data = JSON.parse(text);} catch {}
          item.api_status = data?.status ?? null;
          item.reported_transport = data?.transport ?? null;
          if (data?.status !== 'ready') item.outcome = 'unexpected_payload';
        }
        if (endpoint.endsWith('.js') && response.ok) {
          const marker = endpoint.endsWith('balance.js') ? 'FRONTIER_BALANCE' : 'class Game';
          if (!text.includes(marker)) item.outcome = 'unexpected_payload';
          const local = await readFile(new URL('../../public' + endpoint, import.meta.url), 'utf8');
          item.local_sha256 = hash(local);
          item.matches_local_source = item.local_sha256 === item.content_sha256;
        }
        observations.push(item);
      } catch (error) {
        observations.push({response_ms: Math.round(performance.now() - started),
                           outcome: 'observation_error', error: error.code ?? error.cause?.code ?? error.name});
      }
    }
    return {url: ORIGIN + endpoint, observations};
  }));
  const rows = targets.flatMap(row => row.observations);
  return {observed_at_utc: new Date().toISOString(), timezone: 'Asia/Seoul', samples_per_endpoint: samples,
    status: rows.some(row => row.outcome === 'observation_error') ? 'observation_incomplete'
      : rows.every(row => row.outcome === 'ok') ? 'public_checks_pass' : 'issues_observed',
    limitations: ['Point-in-time public GET observations, not population latency or uptime statistics',
                 'API readiness does not verify login, actual rooms, WebSocket or game commands',
                 'A local/network observation failure alone does not establish a site outage'], targets};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await observe();
  const root = new URL('../runs/ops/', import.meta.url);
  await mkdir(root, {recursive: true});
  const destination = new URL(report.observed_at_utc.replace(/[:.]/g, '-') + '.json', root);
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({report: fileURLToPath(destination),
    ...report}, null, 2));
}
