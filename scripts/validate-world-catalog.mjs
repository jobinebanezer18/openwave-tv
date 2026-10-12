import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/catalog/world');
const index = JSON.parse(fs.readFileSync(path.join(root, 'index.v1.json'), 'utf8'));
const errors = [];
const seenIds = new Set();
const seenCountries = new Set();
let total = 0;
let directoryTotal = 0;

function hlsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
      url.hostname.includes('.') && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.internal') &&
      url.pathname.toLowerCase().endsWith('.m3u8');
  } catch { return false; }
}

function websiteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.hostname.includes('.');
  } catch { return false; }
}

if (index.version !== 1 || !Array.isArray(index.countries) || !index.countries.length) errors.push('Invalid world index.');
if (index.countries?.[0]?.code !== 'IN') errors.push('India must be first in the world index.');
if (!Array.isArray(index.languages)) errors.push('World index languages must be an array.');

for (const country of index.countries || []) {
  const code = country.code;
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code) || seenCountries.has(code)) { errors.push(`Invalid or repeated country ${code}.`); continue; }
  seenCountries.add(code);
  const file = path.join(root, `${code}.v1.json`);
  if (!fs.existsSync(file)) { errors.push(`Missing catalog ${code}.`); continue; }
  if (fs.statSync(file).size > 25 * 1024 * 1024) errors.push(`${code} exceeds the hosting file limit.`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || data.country?.code !== code || !Array.isArray(data.channels) || !Array.isArray(data.directory)) { errors.push(`Invalid catalog ${code}.`); continue; }
  if (data.channels.length !== country.count) errors.push(`${code} count mismatch.`);
  if (data.channels.length + data.directory.length !== country.directory_count) errors.push(`${code} directory count mismatch.`);
  total += data.channels.length;
  directoryTotal += data.channels.length + data.directory.length;
  const localUrls = new Set();
  for (const channel of data.channels) {
    if (typeof channel.id !== 'string' || !channel.id || seenIds.has(channel.id)) errors.push(`${code} has a missing or repeated channel ID.`);
    seenIds.add(channel.id);
    if (typeof channel.name !== 'string' || !channel.name.trim() || channel.country !== code) errors.push(`${code} has invalid channel metadata.`);
    if (!Array.isArray(channel.languages) || !Array.isArray(channel.categories)) errors.push(`${code}:${channel.id} has invalid labels.`);
    const urls = channel.urls || [channel.url];
    if (!Array.isArray(urls) || !urls.length || urls[0] !== channel.url || urls.some(url => !hlsUrl(url))) errors.push(`${code}:${channel.id} has invalid HLS URLs.`);
    for (const url of urls) {
      if (localUrls.has(url)) errors.push(`${code} repeats stream ${url}.`);
      localUrls.add(url);
    }
  }
  for (const channel of data.directory) {
    if (typeof channel.id !== 'string' || !channel.id || seenIds.has(channel.id)) errors.push(`${code} has a missing or repeated directory ID.`);
    seenIds.add(channel.id);
    if (typeof channel.name !== 'string' || !channel.name.trim() || channel.country !== code) errors.push(`${code} has invalid directory metadata.`);
    if (!Array.isArray(channel.languages) || !Array.isArray(channel.categories)) errors.push(`${code}:${channel.id} has invalid directory labels.`);
    if (channel.url || (channel.website && !websiteUrl(channel.website))) errors.push(`${code}:${channel.id} has an invalid directory link.`);
  }
}

const countryFiles = fs.readdirSync(root).filter(file => /^[A-Z]{2}\.v1\.json$/.test(file));
if (countryFiles.length !== seenCountries.size) errors.push('World index and country file counts differ.');
if (index.total !== total) errors.push(`World total is ${index.total}; files contain ${total}.`);
if (index.directory_total !== directoryTotal) errors.push(`World directory total is ${index.directory_total}; files contain ${directoryTotal}.`);
if (errors.length) {
  for (const error of errors.slice(0, 25)) process.stderr.write(`${error}\n`);
  if (errors.length > 25) process.stderr.write(`... ${errors.length - 25} more errors\n`);
  process.exitCode = 1;
} else process.stdout.write(`World catalog valid: ${total} direct-stream candidates and ${directoryTotal} identities in ${seenCountries.size} countries.\n`);
