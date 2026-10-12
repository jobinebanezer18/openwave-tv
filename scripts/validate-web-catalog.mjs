import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, '../public/catalog/india.v1.json');
const categories = new Set(['news', 'music', 'culture', 'religious', 'general', 'business', 'education', 'entertainment']);

function httpsUrl(value, { hls = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password &&
      !url.search && !url.hash && (!hls || url.pathname.toLowerCase().endsWith('.m3u8'));
  } catch { return false; }
}

export function validateWebCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return ['Catalog must be an object.'];
  if (catalog.version !== 1) errors.push('version must be 1.');
  if (!Array.isArray(catalog.countries) || !catalog.countries.some(country => country?.code === 'IN' && country?.name === 'India')) errors.push('countries must include India (IN).');
  const languageCodes = new Set(Array.isArray(catalog.languages) ? catalog.languages.map(language => language?.code) : []);
  if (!languageCodes.size || [...languageCodes].some(code => typeof code !== 'string' || !/^[a-z]{3}$/.test(code))) errors.push('languages must contain three-letter language codes.');
  if (!Array.isArray(catalog.channels) || catalog.channels.length < 1 || catalog.channels.length > 200) {
    errors.push('channels must contain between 1 and 200 entries.');
    return errors;
  }
  const ids = new Set();
  const urls = new Set();
  for (const [index, channel] of catalog.channels.entries()) {
    const label = `channels[${index}]`;
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) { errors.push(`${label} must be an object.`); continue; }
    if (typeof channel.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(channel.id)) errors.push(`${label}.id must be a stable lowercase identifier.`);
    if (ids.has(channel.id)) errors.push(`${label}.id is duplicated.`);
    ids.add(channel.id);
    if (typeof channel.name !== 'string' || !channel.name.trim()) errors.push(`${label}.name is required.`);
    if (!httpsUrl(channel.url, { hls: true })) errors.push(`${label}.url must be an HTTPS HLS .m3u8 URL without userinfo, query, or fragment.`);
    if (urls.has(channel.url)) errors.push(`${label}.url is duplicated.`);
    urls.add(channel.url);
    if (channel.country !== 'IN') errors.push(`${label}.country must be IN.`);
    if (!Array.isArray(channel.languages) || !channel.languages.length || channel.languages.some(code => !languageCodes.has(code))) errors.push(`${label}.languages must reference catalog language codes.`);
    if (!Array.isArray(channel.categories) || !channel.categories.length || channel.categories.some(category => !categories.has(category))) errors.push(`${label}.categories contains an unknown app category.`);
    if (channel.logo && (typeof channel.logo !== 'string' || !httpsUrl(channel.logo) || /placeholder|example|dummy|default/i.test(channel.logo))) errors.push(`${label}.logo must be empty or a non-placeholder HTTPS URL.`);
    if (channel.source_url !== undefined && !httpsUrl(channel.source_url)) errors.push(`${label}.source_url must be an HTTPS URL without userinfo, query, or fragment.`);
    if (!httpsUrl(channel.source_url) && !Array.isArray(catalog.sources)) errors.push(`${label} needs source_url or top-level catalog.sources provenance.`);
  }
  if (Array.isArray(catalog.sources) && catalog.sources.some(source => !httpsUrl(source))) errors.push('sources must contain HTTPS URLs without userinfo, query, or fragment.');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv.find(arg => arg.endsWith('.json')) || defaultPath;
  try {
    const errors = validateWebCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (errors.length) {
      for (const error of errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`Web catalog valid: ${file}\n`);
  } catch (error) {
    process.stderr.write(`Could not validate web catalog: ${error.message}\n`);
    process.exitCode = 1;
  }
}
