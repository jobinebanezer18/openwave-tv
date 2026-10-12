import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, rankChannels } from './search.js';

const countries = [{ code: 'IN', name: 'India' }, { code: 'UK', name: 'United Kingdom' }];
const languages = [{ code: 'eng', name: 'English' }, { code: 'hin', name: 'Hindi' }];
const channels = [
  { id: 'a', name: 'India News', country: 'IN', categories: ['news'], languages: ['hin'] },
  { id: 'b', name: 'London News', country: 'UK', categories: ['news'], languages: ['eng'] },
  { id: 'c', name: 'India Music', country: 'IN', categories: ['music'], languages: ['hin'] }
];

test('natural country and category terms narrow the guide', () => {
  assert.deepEqual(rankChannels(channels, 'Indian news', countries, languages).map(c => c.id), ['a']);
});

test('language terms select the actual feed language', () => {
  assert.deepEqual(rankChannels(channels, 'English news', countries, languages).map(c => c.id), ['b']);
  assert.equal(parseQuery('British English news', countries, languages).countryCode, 'UK');
});

test('a language in the channel name remains searchable when source language metadata is missing', () => {
  const entries = [{ id: 'sports', name: 'Star Sports 2 Telugu', country: 'IN', categories: ['sports'], languages: [] }];
  assert.deepEqual(rankChannels(entries, 'Star Sports 2 Telugu', countries, [...languages, { code: 'tel', name: 'Telugu' }]).map(c => c.id), ['sports']);
});

test('British and UK searches use the worldwide catalog country code', () => {
  const worldCountries = [{ code: 'GB', name: 'United Kingdom' }];
  assert.equal(parseQuery('British news', worldCountries, languages).countryCode, 'GB');
  assert.equal(parseQuery('UK news', worldCountries, languages).countryCode, 'GB');
});
