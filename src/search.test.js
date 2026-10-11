import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, rankChannels } from './search.js';

const countries = [{ code: 'IN', name: 'India' }, { code: 'GB', name: 'United Kingdom' }];
const languages = [{ code: 'eng', name: 'English' }, { code: 'hin', name: 'Hindi' }];
const channels = [
  { id: 'a', name: 'India News', country: 'IN', categories: ['news'], languages: ['hin'] },
  { id: 'b', name: 'London News', country: 'GB', categories: ['news'], languages: ['eng'] },
  { id: 'c', name: 'India Music', country: 'IN', categories: ['music'], languages: ['hin'] }
];

test('natural country and category terms narrow the guide', () => {
  assert.deepEqual(rankChannels(channels, 'Indian news', countries, languages).map(c => c.id), ['a']);
});

test('language terms select the actual feed language', () => {
  assert.deepEqual(rankChannels(channels, 'English news', countries, languages).map(c => c.id), ['b']);
  assert.equal(parseQuery('British English news', countries, languages).countryCode, 'GB');
});
