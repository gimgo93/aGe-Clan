import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observe} from './monitor.mjs';
let calls = 0;
const fetcher = async (url, options) => {
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
  assert.equal(new URL(url).origin, 'https://ageclan.com'); calls++;
  const endpoint = new URL(url).pathname;
  const body = endpoint === '/api/clan' ? JSON.stringify({status: 'ready', transport: 'websocket'})
    : endpoint.endsWith('.js') ? await readFile(new URL('../../public' + endpoint, import.meta.url), 'utf8') : '<html>Game</html>';
  return new Response(body, {status: 200});
};
const good = await observe({fetcher});
assert.equal(calls, 8); assert.equal(good.status, 'public_checks_pass');
assert.ok(good.targets[2].observations.every(row => row.matches_local_source));
const bad = await observe({samples: 1, fetcher: async () => new Response('unavailable', {status: 503})});
assert.equal(bad.status, 'issues_observed');
const missing = await observe({samples: 1, fetcher: async () => {throw new TypeError('network unavailable');}});
assert.equal(missing.status, 'observation_incomplete');
const notReady = await observe({samples: 1, fetcher: async (url, options) =>
  new URL(url).pathname === '/api/clan' ? new Response('<html>Not an API</html>') : fetcher(url, options)});
assert.equal(notReady.status, 'issues_observed');
const redirect = await observe({samples: 1, fetcher: async () => new Response(null, {status: 302})});
assert.equal(redirect.status, 'issues_observed'); // redirect reported; no redirected requests issued
await assert.rejects(observe({samples: 4}));
console.log('PASS: bounded GET only, local source parity, HTTP errors, incomplete observations, semantic readiness, redirects');
