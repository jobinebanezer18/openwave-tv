import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebCatalog } from './web-catalog.js';

test('loads country catalogs on demand and shares repeated requests', async () => {
  const requests = [];
  const catalog = createWebCatalog(async url => {
    requests.push(url);
    const value = url.endsWith('index.v1.json') ? { version: 1, countries: [{ code: 'IN' }] } : { version: 1, country: { code: 'IN' }, channels: [{ id: 'news' }], directory: [] };
    return { ok: true, json: async () => value };
  });
  assert.equal((await catalog.index()).countries[0].code, 'IN');
  const [first, second] = await Promise.all([catalog.country('IN'), catalog.country('IN')]);
  assert.strictEqual(first, second);
  assert.deepEqual(requests, ['/catalog/world/index.v1.json', '/catalog/world/IN.v1.json']);
  await assert.rejects(catalog.country('../IN'), /Invalid country code/);
});

test('failed country downloads can be retried', async () => {
  let attempts = 0;
  const catalog = createWebCatalog(async () => {
    attempts += 1;
    return attempts === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ version: 1, country: { code: 'GB' }, channels: [], directory: [] }) };
  });
  await assert.rejects(catalog.country('GB'), /503/);
  assert.deepEqual(await catalog.country('GB'), { version: 1, country: { code: 'GB' }, channels: [], directory: [] });
  assert.equal(attempts, 2);
});

test('world sports guide loads on demand and is cached', async () => {
  const requests = [];
  const catalog = createWebCatalog(async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ version: 1, channels: [{ id: 'sport' }], directory: [{ id: 'other' }] }) };
  });
  const [first, second] = await Promise.all([catalog.sports(), catalog.sports()]);
  assert.strictEqual(first, second);
  assert.deepEqual(requests, ['/catalog/world/sports.v1.json']);
});
