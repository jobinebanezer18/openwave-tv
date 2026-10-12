#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = 'https://pwaapi.sunnxt.com/content/v2/contentList?type=live&fields=contents,images,generalInfo,publishingHouse,relatedMedia,relatedCast,subtitles,relatedMedia,relatedMultimedia&startIndex=1&count=100&orderBy=siblingOrder&orderMode=1&language=';
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../catalog/sunnxt-live.v1.json');
const languageCodes = { tamil: 'tam', telugu: 'tel', malayalam: 'mal', kannada: 'kan', bengali: 'ben', marathi: 'mar', hindi: 'hin', english: 'eng' };
const categoryCodes = { entertainment: 'entertainment', music: 'music', news: 'news', comedy: 'comedy', kids: 'kids' };

const response = await fetch(source, { headers: { 'X-myplex-platform': 'browser', 'User-Agent': 'Mozilla/5.0' } });
if (!response.ok) throw new Error(`Sun NXT catalogue returned HTTP ${response.status}`);
const payload = await response.json();
if (payload.status !== 'SUCCESS' || !Array.isArray(payload.results) || payload.results.length < 30 || payload.results.length > 100) {
  throw new Error('Sun NXT returned an unexpected live-channel catalogue; keeping the saved snapshot.');
}

const seen = new Set();
const channels = payload.results.map(row => {
  const contentId = String(row?.generalInfo?._id ?? '');
  const name = String(row?.generalInfo?.title ?? '').trim();
  const languages = [...new Set((row?.content?.language || []).map(language => languageCodes[String(language).toLowerCase()]).filter(Boolean))];
  const genre = String(row?.content?.genre?.[0]?.name ?? '').toLowerCase();
  const category = /\bmovies?\b/i.test(name) || /^KTV(?: HD)?$/i.test(name) ? 'movies' : categoryCodes[genre] || 'general';
  if (!/^\d+$/.test(contentId) || !name || !languages.length || seen.has(contentId) || row?.generalInfo?.type !== 'live') {
    throw new Error('Sun NXT returned incomplete or repeated channel metadata; keeping the saved snapshot.');
  }
  seen.add(contentId);
  return { contentId, name, languages, categories: [category], website: `https://www.sunnxt.com/tv/detail/${contentId}` };
});

fs.writeFileSync(target, `${JSON.stringify({ version: 1, source, checkedAt: new Date().toISOString(), channels }, null, 2)}\n`);
process.stdout.write(`Saved ${channels.length} Sun NXT live-channel identities to ${target}\n`);
