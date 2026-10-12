import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRadioCatalog, normalizeRadioCatalog, RADIO_SNAPSHOT_URL, RADIO_SOURCE_URL } from './radio-catalog.js';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const fixture = (generated = '2026-10-01', countries = 1, stationsPerCountry = 1) => ({
  schemaVersion: 1,
  generated,
  countries: Array.from({ length: countries }, (_, country) => ({
    countryCode: `${String.fromCharCode(65 + Math.floor(country / 26))}${String.fromCharCode(65 + country % 26)}`,
    country: `Country ${country}`,
    stations: Array.from({ length: stationsPerCountry }, (_, station) => ({
      id: `station-${station}`,
      name: `Station ${country}-${station}`,
      stream: `https://example.com/${country}/${station}.mp3`,
      codec: 'mp3',
      votes: station
    }))
  }))
});
const response = value => ({ ok: true, json: async () => value });

test('normalization rejects malformed, expired, and older remote catalogs', () => {
  const good = fixture();
  assert.equal(normalizeRadioCatalog(good, { now: NOW }).stations.length, 1);
  assert.throws(() => normalizeRadioCatalog({ ...good, schemaVersion: 9 }, { now: NOW }), /schema/);
  assert.throws(() => normalizeRadioCatalog({ ...good, generated: '2026-02-30' }, { now: NOW }), /date/);
  assert.throws(() => normalizeRadioCatalog({ ...good, generated: '2026-01-01' }, { now: NOW, maxAgeDays: 90 }), /expired/);
  assert.throws(() => normalizeRadioCatalog(good, { now: NOW, minimumGenerated: '2026-10-02' }), /expired/);
  assert.throws(() => normalizeRadioCatalog({ ...good, countries: [] }, { now: NOW }), /insufficient/);
});

test('normalization keeps playable HTTPS audio and stable station IDs', () => {
  const raw = fixture();
  raw.countries[0].stations.push({ ...raw.countries[0].stations[0], id: 'insecure', stream: 'http://example.com/audio.mp3' });
  raw.countries[0].stations.push({ ...raw.countries[0].stations[0], id: 'station-0' });
  raw.countries[0].stations.push({ ...raw.countries[0].stations[0], id: 'unsupported', codec: 'unknown' });
  assert.deepEqual(normalizeRadioCatalog(raw, { now: NOW }).stations.map(station => `${station.countryCode}:${station.id}`), ['AA:station-0']);
});

test('bundled snapshot loads and survives malformed remote refresh', async () => {
  const snapshot = fixture();
  const requests = [];
  const catalog = createRadioCatalog({
    fetchImpl: async address => { requests.push(address); return response(address === RADIO_SNAPSHOT_URL ? snapshot : { generated: '2026-10-12', countries: [] }); },
    cacheRead: async () => null,
    cacheWrite: async () => { throw new Error('Must not cache malformed data'); },
    store: new MapStore(),
    clock: () => NOW
  });
  assert.equal((await catalog.load()).stations.length, 1);
  assert.equal(await catalog.refresh(), null);
  assert.deepEqual(requests, [RADIO_SNAPSHOT_URL, RADIO_SOURCE_URL]);
});

test('expired cached and remote data cannot replace the bundled guide', async () => {
  const snapshot = fixture('2026-08-26');
  const expired = fixture('2026-01-01', 100, 10);
  let writes = 0;
  const catalog = createRadioCatalog({
    fetchImpl: async address => response(address === RADIO_SNAPSHOT_URL ? snapshot : expired),
    cacheRead: async () => expired,
    cacheWrite: async () => { writes++; },
    store: new MapStore(),
    clock: () => NOW
  });
  assert.equal((await catalog.load()).generated, '2026-08-26');
  assert.equal(await catalog.refresh(), null);
  assert.equal(writes, 0);
});

test('valid refresh persists a newer guide and is not repeated on every cold start', async () => {
  const snapshot = fixture('2026-08-26');
  const remote = fixture('2026-10-10', 100, 10);
  const store = new MapStore();
  let cached = null;
  let remoteRequests = 0;
  const options = {
    fetchImpl: async address => {
      if (address === RADIO_SOURCE_URL) { remoteRequests++; return response(remote); }
      return response(snapshot);
    },
    cacheRead: async () => cached,
    cacheWrite: async value => { cached = value; },
    store,
    clock: () => NOW
  };
  const first = createRadioCatalog(options);
  assert.equal((await first.load()).stations.length, 1);
  assert.equal((await first.refresh()).stations.length, 1000);
  const second = createRadioCatalog(options);
  assert.equal((await second.load()).stations.length, 1000);
  assert.equal(await second.refresh(), null);
  assert.equal(remoteRequests, 1);
});

test('valid cached guide remains available when the bundled request fails', async () => {
  const cached = fixture('2026-10-10', 100, 10);
  const catalog = createRadioCatalog({
    fetchImpl: async () => { throw new Error('Offline'); },
    cacheRead: async () => cached,
    cacheWrite: async () => {},
    store: new MapStore(),
    clock: () => NOW
  });
  assert.equal((await catalog.load()).stations.length, 1000);
});

test('a refreshed stream URL wins even when the catalog date and count are unchanged', async () => {
  const snapshot = fixture('2026-10-10', 100, 10);
  const updated = structuredClone(snapshot);
  updated.countries[0].stations[0].stream = 'https://example.com/new-feed.mp3';
  let cached = null;
  const options = {
    fetchImpl: async address => response(address === RADIO_SNAPSHOT_URL ? snapshot : updated),
    cacheRead: async () => cached,
    cacheWrite: async value => { cached = value; },
    store: new MapStore(), clock: () => NOW
  };
  const first = createRadioCatalog(options);
  await first.load();
  assert.equal((await first.refresh()).stations.find(station => station.countryCode === 'AA' && station.id === 'station-0').stream, 'https://example.com/new-feed.mp3');
  const second = createRadioCatalog(options);
  assert.equal((await second.load()).stations.find(station => station.countryCode === 'AA' && station.id === 'station-0').stream, 'https://example.com/new-feed.mp3');
});

class MapStore {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}
