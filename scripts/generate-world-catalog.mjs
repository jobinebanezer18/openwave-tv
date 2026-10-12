#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const defaults = {
  channels: path.resolve(repoDir, 'work/catalog/iptv-org-channels.json'),
  streams: path.resolve(repoDir, 'work/catalog/iptv-org-streams.json'),
  feeds: path.resolve(repoDir, 'work/catalog/iptv-org-feeds.json'),
  india: path.resolve(repoDir, 'public/catalog/india.v1.json'),
  checks: path.resolve(repoDir, 'catalog/india-browser-checks.v1.json'),
  outDir: path.resolve(repoDir, 'public/catalog/world'),
};
const SOURCE_URLS = [
  'https://iptv-org.github.io/api/channels.json',
  'https://iptv-org.github.io/api/streams.json',
  'https://iptv-org.github.io/api/feeds.json',
  'public/catalog/india.v1.json',
  'catalog/india-browser-checks.v1.json',
];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

function parseArgs(args) {
  const result = { ...defaults };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (!['--channels', '--streams', '--feeds', '--india', '--checks', '--out-dir'].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    if (!args[i + 1]) throw new Error(`Missing value for ${key}`);
    const dest = ({ '--channels': 'channels', '--streams': 'streams', '--feeds': 'feeds', '--india': 'india', '--checks': 'checks', '--out-dir': 'outDir' })[key];
    result[dest] = path.resolve(args[++i]);
  }
  return result;
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Could not read ${label} at ${file}: ${error.message}`); }
}

function safeHttpsUrl(raw, { hls = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    // IP literals are excluded so the catalog only points to public DNS hostnames.
    if (host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || !host.includes('.')) return null;
    if (hls && !url.pathname.toLowerCase().endsWith('.m3u8')) return null;
    return url.href;
  } catch { return null; }
}

function normalizeCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return null;
  const normalized = code.toUpperCase();
  return normalized === 'UK' ? 'GB' : normalized;
}

function displayCountry(code) {
  const name = countryNames.of(code);
  return name && name !== code ? name : null;
}

function languageDictionary(channels) {
  const codes = new Set();
  for (const channel of channels) {
    for (const code of Array.isArray(channel.languages) ? channel.languages : []) {
      if (typeof code === 'string' && /^[a-z]{3}$/.test(code)) codes.add(code);
    }
  }
  return [...codes].sort().map(code => ({ code, name: languageNames.of(code) || code }));
}

function cleanChannel(channel, code, urls, { curated = false } = {}) {
  const validUrls = [...new Set(urls.map(url => safeHttpsUrl(url, { hls: true })).filter(Boolean))];
  if (!validUrls.length) return null;
  const name = typeof channel.name === 'string' ? channel.name.trim() : '';
  if (!name) return null;
  const id = typeof channel.id === 'string' && channel.id.trim() ? channel.id.trim() : '';
  if (!id) return null;
  const languages = Array.isArray(channel.languages)
    ? [...new Set(channel.languages.filter(value => typeof value === 'string' && /^[a-z]{3}$/.test(value)))].sort()
    : [];
  const categories = Array.isArray(channel.categories)
    ? [...new Set(channel.categories.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].sort()
    : [];
  const logo = safeHttpsUrl(channel.logo);
  return {
    id,
    name,
    url: validUrls[0],
    ...(validUrls.length > 1 ? { urls: validUrls } : {}),
    country: code,
    languages,
    categories,
    ...(curated ? { featured: true } : {}),
    ...(logo ? { logo } : {}),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const upstreamChannels = readJson(args.channels, 'iptv-org channels');
  const upstreamStreams = readJson(args.streams, 'iptv-org streams');
  const upstreamFeeds = readJson(args.feeds, 'iptv-org feeds');
  const indiaCatalog = readJson(args.india, 'curated India catalog');
  const indiaChecks = readJson(args.checks, 'India browser checks');
  if (!Array.isArray(upstreamChannels) || !Array.isArray(upstreamStreams) || !Array.isArray(upstreamFeeds) || !Array.isArray(indiaCatalog.channels)) {
    throw new Error('Expected channels.json, streams.json, feeds.json, and India catalog to contain channel arrays.');
  }

  const feedLanguages = new Map();
  for (const feed of upstreamFeeds) {
    if (typeof feed?.channel !== 'string' || !Array.isArray(feed.languages)) continue;
    const languages = feedLanguages.get(feed.channel) || new Set();
    for (const code of feed.languages) if (typeof code === 'string' && /^[a-z]{3}$/.test(code)) languages.add(code);
    feedLanguages.set(feed.channel, languages);
  }

  const streamsById = new Map();
  for (const stream of upstreamStreams) {
    if (!stream || typeof stream.channel !== 'string' || stream.user_agent || stream.referrer) continue;
    const url = safeHttpsUrl(stream.url, { hls: true });
    if (!url) continue;
    const urls = streamsById.get(stream.channel) || [];
    urls.push(url);
    streamsById.set(stream.channel, urls);
  }

  const byCountry = new Map();
  const ensureCountry = code => {
    if (!byCountry.has(code)) byCountry.set(code, { name: displayCountry(code), channels: [], ids: new Set(), urls: new Set() });
    return byCountry.get(code);
  };
  const add = (code, channel, urls, options) => {
    const record = ensureCountry(code);
    const clean = cleanChannel(channel, code, urls, options);
    if (!clean || record.ids.has(clean.id)) return false;
    const freshUrls = (clean.urls || [clean.url]).filter(url => !record.urls.has(url));
    if (!freshUrls.length) return false;
    clean.url = freshUrls[0];
    if (freshUrls.length > 1) clean.urls = freshUrls;
    else delete clean.urls;
    record.channels.push(clean);
    record.ids.add(clean.id);
    for (const url of freshUrls) record.urls.add(url);
    return true;
  };

  // Curated India entries are emitted first and retain their IDs and preferred URLs.
  for (const channel of indiaCatalog.channels) {
    if (channel?.country !== 'IN') continue;
    add('IN', channel, [channel.url, ...(Array.isArray(channel.urls) ? channel.urls : [])], { curated: true });
  }
  for (const channel of upstreamChannels) {
    if (channel?.is_nsfw || channel?.closed) continue;
    const code = normalizeCode(channel?.country);
    if (!code || !displayCountry(code)) continue;
    const urls = streamsById.get(channel.id) || [];
    const languages = [...(feedLanguages.get(channel.id) || [])];
    if (code === 'IN') {
      const normalizedName = String(channel?.name || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const curated = byCountry.get('IN')?.channels.find(entry => {
        const existingName = entry.name.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        return normalizedName && normalizedName === existingName;
      });
      if (curated) {
        const allUrls = [...new Set([curated.url, ...(curated.urls || []), ...urls.map(url => safeHttpsUrl(url, { hls: true })).filter(Boolean)])];
        curated.url = allUrls[0];
        if (allUrls.length > 1) curated.urls = allUrls;
        curated.languages = [...new Set([...curated.languages, ...languages])].sort();
        const record = byCountry.get('IN');
        for (const url of allUrls) record.urls.add(url);
        continue;
      }
    }
    add(code, { ...channel, languages }, urls);
  }

  if (indiaChecks.version !== 1 || !indiaChecks.results || typeof indiaChecks.results !== 'object') {
    throw new Error('Expected an India browser-check map.');
  }
  for (const channel of byCountry.get('IN')?.channels || []) {
    if (!Object.hasOwn(indiaChecks.results, channel.id)) continue;
    const checkedUrl = indiaChecks.results[channel.id];
    const urls = channel.urls || [channel.url];
    if (typeof checkedUrl === 'string' && urls.includes(checkedUrl)) {
      channel.url = checkedUrl;
      channel.urls = [checkedUrl, ...urls.filter(url => url !== checkedUrl)];
      channel.browser_check = 'reachable';
      channel.health_score = 1;
    } else channel.browser_check = 'failed';
  }

  const countryRows = [...byCountry.entries()]
    .filter(([, value]) => value.name && value.channels.length)
    .map(([code, value]) => ({
      code,
      name: value.name,
      count: value.channels.length,
      languages: [...new Set(value.channels.flatMap(channel => channel.languages))].sort(),
      categories: [...new Set(value.channels.flatMap(channel => channel.categories))].sort(),
      channels: value.channels,
    }))
    .sort((a, b) => (a.code === 'IN' ? -1 : b.code === 'IN' ? 1 : a.name.localeCompare(b.name, 'en') || a.code.localeCompare(b.code)));
  if (!countryRows.some(country => country.code === 'IN')) throw new Error('India has no eligible curated channels.');

  fs.mkdirSync(args.outDir, { recursive: true });
  const retainedFiles = new Set(countryRows.map(row => `${row.code}.v1.json`).concat('index.v1.json'));
  for (const entry of fs.readdirSync(args.outDir, { withFileTypes: true })) {
    if (entry.isFile() && /^[A-Z]{2}\.v1\.json$/.test(entry.name) && !retainedFiles.has(entry.name)) {
      fs.unlinkSync(path.join(args.outDir, entry.name));
    }
  }
  const index = {
    version: 1,
    sources: SOURCE_URLS,
    countries: countryRows.map(({ code, name, count, languages, categories }) => ({ code, name, count, languages, categories })),
    languages: languageDictionary(countryRows.flatMap(row => row.channels)),
    total: countryRows.reduce((sum, country) => sum + country.count, 0),
  };
  for (const row of countryRows) {
    const document = { version: 1, country: { code: row.code, name: row.name }, channels: row.channels };
    const content = `${JSON.stringify(document)}\n`;
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_FILE_BYTES) throw new Error(`${row.code} catalog is ${bytes} bytes, over 25 MiB.`);
    fs.writeFileSync(path.join(args.outDir, `${row.code}.v1.json`), content);
  }
  fs.writeFileSync(path.join(args.outDir, 'index.v1.json'), `${JSON.stringify(index, null, 2)}\n`);
  const largestCountry = [...countryRows].sort((a, b) => b.channels.length - a.channels.length)[0];
  process.stdout.write(`Generated ${countryRows.length} countries and ${index.total} channels; India first. Largest: ${largestCountry.code} (${largestCountry.count}).\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
