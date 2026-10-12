const CATEGORY_PHRASES = {
  news: 'news current events headlines journalism politics world updates',
  sports: 'sports live games football soccer cricket basketball athletics',
  movies: 'movies cinema films drama actors',
  music: 'music songs concerts artists radio',
  kids: 'kids children cartoons family animation',
  documentary: 'documentary nature science history learning',
  entertainment: 'entertainment shows comedy celebrity variety',
  education: 'education learning lectures school university',
  cooking: 'cooking recipes food kitchen chefs',
  travel: 'travel destinations places tourism',
  religious: 'religious faith worship spiritual',
  business: 'business finance markets economy',
  culture: 'culture arts theater literature',
  general: 'general television local programming mixed shows'
};

const STOP = new Set(['show','shows','me','find','some','something','a','an','the','tv','channel','channels','from','in','for','with','about','watch','live','please','i','want','to','relaxing','calming','interesting','informative']);
const SYNONYMS = {
  football: 'sports', soccer: 'sports', cricket: 'sports', match: 'sports', game: 'sports',
  headlines: 'news', politics: 'news', current: 'news', cartoon: 'kids', children: 'kids',
  film: 'movies', cinema: 'movies', songs: 'music', concert: 'music', science: 'documentary',
  nature: 'documentary', food: 'cooking', recipe: 'cooking', finance: 'business'
};

const COUNTRY_ALIASES = { indian:'IN', british:'UK', american:'US', brazilian:'BR', french:'FR', german:'DE', japanese:'JP', korean:'KR', australian:'AU', canadian:'CA' };

export function parseQuery(query, countries, languages = []) {
  const lower = query.toLowerCase().trim();
  const words = lower.match(/[\p{L}\p{N}]+/gu) || [];
  const country = countries.find(c => c.name && new RegExp(`\\b${escapeRegExp(c.name.toLowerCase())}\\b`, 'u').test(lower));
  const countryCode = country?.code || words.map(w => COUNTRY_ALIASES[w]).find(Boolean) || (words.includes('usa') ? 'US' : words.includes('uk') ? 'UK' : null);
  const language = languages.find(l => l.name && new RegExp(`\\b${escapeRegExp(l.name.toLowerCase())}\\b`, 'u').test(lower));
  const languageCode = language?.code || null;
  const category = words.find(w => CATEGORY_PHRASES[w]) || words.map(w => SYNONYMS[w]).find(Boolean) || null;
  const excluded = new Set([...((country?.name || '').toLowerCase().split(' ')), ...((language?.name || '').toLowerCase().split(' '))]);
  const terms = words.filter(w => !STOP.has(w) && !excluded.has(w) && !COUNTRY_ALIASES[w] && w !== 'usa' && w !== 'uk' && !CATEGORY_PHRASES[w] && !SYNONYMS[w]);
  return { countryCode, languageCode, category, terms };
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function rankChannels(channels, query, countries, languages = [], aiCategory = null) {
  const parsed = parseQuery(query, countries, languages);
  const category = parsed.category || aiCategory;
  const result = channels.map(ch => {
    const name = ch.name.toLowerCase();
    const title = (ch.title || '').toLowerCase();
    let score = 0;
    if (parsed.countryCode) {
      if (ch.country !== parsed.countryCode) return null;
      score += 3;
    }
    if (parsed.languageCode) {
      if (!ch.languages?.includes(parsed.languageCode)) return null;
      score += 3;
    }
    if (category) {
      if (!ch.categories.includes(category)) return null;
      score += 5;
    }
    for (const term of parsed.terms) {
      if (name === term) score += 12;
      else if (name.includes(term)) score += 6;
      else if (title.includes(term)) score += 3;
      else return null;
    }
    if (!query.trim()) score += ch.featured ? 5 : 0;
    if (ch.quality?.includes('1080')) score += 0.2;
    return { ...ch, score };
  }).filter(Boolean);
  result.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return result;
}

let extractorPromise;
let categoryVectorsPromise;
export async function inferCategory(query) {
  if (import.meta.env.VITE_WEB_MODE === true) return null;
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' }));
  }
  const extractor = await extractorPromise;
  if (!categoryVectorsPromise) {
    categoryVectorsPromise = extractor(Object.values(CATEGORY_PHRASES), { pooling: 'mean', normalize: true })
      .then(t => t.tolist());
  }
  const vectors = await categoryVectorsPromise;
  const queryVector = (await extractor(query, { pooling: 'mean', normalize: true })).tolist()[0];
  const scored = Object.keys(CATEGORY_PHRASES).map((name, i) => ({
    name,
    score: vectors[i].reduce((sum, value, j) => sum + value * queryVector[j], 0)
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0.23 ? scored[0].name : null;
}
