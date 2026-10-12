// The upstream station metadata is CC0: https://github.com/eyalev/verified-radio-streams
// Keep a compact, bundled copy so radio does not depend on GitHub at startup.
export const RADIO_SNAPSHOT_URL = '/radio/stations.v1.json';
export const RADIO_SOURCE_URL = 'https://raw.githubusercontent.com/eyalev/verified-radio-streams/main/stations/all.json';

const CACHE_NAME = 'openwave-radio-v1';
const CACHE_URL = '/radio/stations.remote.v1.json';
const REFRESH_KEY = 'openwave-radio-next-refresh-v1';
const DAY = 24 * 60 * 60 * 1000;
const SUPPORTED_CODECS = new Set(['mp3', 'aac', 'ogg']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function normalizeRadioCatalog(raw, { now = Date.now(), maxAgeDays = Infinity, minimumGenerated = '', minimumStations = 1, minimumCountries = 1 } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.countries) || (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)) {
    throw new Error('Invalid radio catalog schema');
  }
  const generatedAt = validDate(raw.generated);
  if (!Number.isFinite(generatedAt) || generatedAt > now + DAY || (now - generatedAt) / DAY > maxAgeDays || (minimumGenerated && raw.generated < minimumGenerated)) {
    throw new Error('Radio catalog is expired or has an invalid date');
  }

  const stations = [];
  const countries = new Set();
  const seen = new Set();
  for (const group of raw.countries) {
    if (!group || !/^[A-Z]{2}$/.test(group.countryCode) || typeof group.country !== 'string' || !group.country.trim() || !Array.isArray(group.stations)) continue;
    for (const station of group.stations) {
      if (!station || typeof station.id !== 'string' || !station.id.trim() || typeof station.name !== 'string' || !station.name.trim() || typeof station.stream !== 'string' || typeof station.codec !== 'string') continue;
      const codec = station.codec.toLowerCase();
      if (!SUPPORTED_CODECS.has(codec)) continue;
      let stream;
      try { stream = new URL(station.stream); } catch { continue; }
      if (stream.protocol !== 'https:' || !stream.hostname || stream.username || stream.password) continue;
      const id = `${group.countryCode}:${station.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      countries.add(group.countryCode);
      stations.push({
        id: station.id,
        name: station.name.trim(),
        stream: station.stream,
        codec,
        country: group.country.trim(),
        countryCode: group.countryCode,
        genre: Array.isArray(station.genre) ? station.genre.filter(value => typeof value === 'string') : [],
        fmMhz: Array.isArray(station.fmMhz) ? station.fmMhz : [],
        state: typeof station.state === 'string' ? station.state : '',
        votes: Number.isFinite(station.votes) ? station.votes : 0
      });
    }
  }
  if (stations.length < minimumStations || countries.size < minimumCountries) throw new Error('Radio catalog has insufficient valid stations');
  stations.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  return { generated: raw.generated, stations, countryCount: countries.size, stale: now - generatedAt > 90 * DAY };
}

async function browserCacheRead() {
  if (!globalThis.caches) return null;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(CACHE_URL);
  return response ? response.json() : null;
}

async function browserCacheWrite(raw) {
  if (!globalThis.caches) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(CACHE_URL, new Response(JSON.stringify(raw), { headers: { 'Content-Type': 'application/json' } }));
}

function browserStore() {
  try { return globalThis.localStorage; } catch { return null; }
}

async function fetchJSON(fetchImpl, address) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(address, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Radio catalog HTTP ${response.status}`);
    return response.json();
  } finally { clearTimeout(timeout); }
}

export function createRadioCatalog({ fetchImpl = globalThis.fetch, cacheRead = browserCacheRead, cacheWrite = browserCacheWrite, store = browserStore(), clock = Date.now } = {}) {
  let current = null;
  function nextRefresh() {
    try { return Number(store?.getItem(REFRESH_KEY)) || 0; } catch { return 0; }
  }
  function scheduleRefresh(delay) {
    try { store?.setItem(REFRESH_KEY, String(clock() + delay)); } catch { /* Private browsing may deny storage. */ }
  }
  return {
    async load() {
      const [snapshotResult, cacheResult] = await Promise.allSettled([
        fetchJSON(fetchImpl, RADIO_SNAPSHOT_URL), cacheRead()
      ]);
      const candidates = [];
      if (cacheResult.status === 'fulfilled' && cacheResult.value) {
        try { candidates.push(normalizeRadioCatalog(cacheResult.value, { now: clock(), maxAgeDays: 90, minimumStations: 1000, minimumCountries: 100 })); } catch { /* Do not replace a valid bundled guide. */ }
      }
      if (snapshotResult.status === 'fulfilled') {
        try { candidates.push(normalizeRadioCatalog(snapshotResult.value, { now: clock() })); } catch { /* Try cached or remote guide. */ }
      }
      current = candidates.sort((a, b) => b.generated.localeCompare(a.generated))[0] || null;
      if (current) return current;
      const rescued = await this.refresh({ force: true });
      if (rescued) return rescued;
      throw new Error('No valid radio catalog is available');
    },
    async refresh({ force = false } = {}) {
      if (!force && clock() < nextRefresh()) return null;
      try {
        const raw = await fetchJSON(fetchImpl, RADIO_SOURCE_URL);
        const candidate = normalizeRadioCatalog(raw, { now: clock(), maxAgeDays: 90, minimumGenerated: current?.generated || '', minimumStations: 1000, minimumCountries: 100 });
        await cacheWrite(raw).catch(() => {});
        scheduleRefresh(DAY);
        current = candidate;
        return candidate;
      } catch {
        scheduleRefresh(6 * 60 * 60 * 1000);
        return null;
      }
    }
  };
}
