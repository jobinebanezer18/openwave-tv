import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateWebCatalog } from './validate-web-catalog.mjs';

const candidate = () => ({ id: 'in-01', name: 'Sample', url: 'https://example.org/live.m3u8', country: 'IN', languages: ['eng'], categories: ['news'], logo: '', source_url: 'https://example.org/source' });
const catalog = () => ({ version: 1, countries: [{ code: 'IN', name: 'India' }], languages: [{ code: 'eng', name: 'English' }], channels: [candidate()] });

test('validates current India catalog', () => {
  const current = JSON.parse(fs.readFileSync(new URL('../public/catalog/india.v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateWebCatalog(current), []);
});

test('accepts valid catalog with catalog-level provenance', () => {
  const data = catalog();
  delete data.channels[0].source_url;
  data.sources = ['https://example.org/catalog'];
  assert.deepEqual(validateWebCatalog(data), []);
});

test('rejects wrong metadata, invalid URL shapes, categories, and missing provenance', () => {
  const data = catalog();
  data.version = 2;
  data.channels[0].url = 'https://user:pass@example.org/live.m3u8?token=secret';
  data.channels[0].categories = ['unknown'];
  delete data.channels[0].source_url;
  const errors = validateWebCatalog(data);
  assert.ok(errors.some(error => error.includes('version')));
  assert.ok(errors.some(error => error.includes('HTTPS HLS')));
  assert.ok(errors.some(error => error.includes('unknown app category')));
  assert.ok(errors.some(error => error.includes('provenance')));
});

test('rejects duplicate identities, placeholders, and excessive channel count', () => {
  const data = catalog();
  data.channels.push({ ...candidate(), logo: 'https://example.org/placeholder.png' });
  data.channels[1].id = data.channels[0].id;
  data.channels[1].url = data.channels[0].url;
  assert.ok(validateWebCatalog(data).some(error => error.includes('duplicated')));
  assert.ok(validateWebCatalog(data).some(error => error.includes('placeholder')));
  data.channels = Array.from({ length: 201 }, (_, index) => ({ ...candidate(), id: `in-${index}`, url: `https://example.org/${index}.m3u8` }));
  assert.ok(validateWebCatalog(data).some(error => error.includes('between 1 and 200')));
});
