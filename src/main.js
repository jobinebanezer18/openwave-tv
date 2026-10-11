import Hls from 'hls.js';
import { inferCategory, rankChannels, parseQuery } from './search.js';
import './style.css';

const app = document.querySelector('#app');
const state = {
  channels: [], countries: [], languages: [], results: [], selected: null, hls: null,
  search: '', category: 'all', country: 'all', language: 'all', favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem('openwave-favorites') || '[]')),
  aiCategory: null, searchSerial: 0, playSerial: 0, sourceCount: 0, sourceAttempt: 0
};

const icon = (name, size = 20) => {
  const paths = {
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 17 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/>',
    heart: '<path d="M20.8 8.4c0 4.7-8.8 10.5-8.8 10.5S3.2 13.1 3.2 8.4a4.3 4.3 0 0 1 8.8-1.1 4.3 4.3 0 0 1 8.8 1.1Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.5 4 5.5 4 9s-1.3 6.5-4 9c-2.7-2.5-4-5.5-4-9s1.3-6.5 4-9Z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.2 6.7M20 4v7h-7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    tv: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 22h8M12 19v3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const categories = ['all','news','sports','movies','music','kids','documentary','entertainment','education','cooking','travel','religious','business','culture','general'];

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar"><div class="brand">${icon('tv',21)} <strong>OPENWAVE</strong><span>TV</span></div><div class="topbar-right"><span class="local-badge"><i></i> LOCAL PLAYER</span><a href="https://github.com/jobinebanezer18/openwave-tv" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow',15)}</a></div></header>
    <div class="layout">
      <aside class="guide" aria-label="Channel guide">
        <div class="guide-head"><div><h1>Channels</h1><p id="result-summary">Loading guide…</p></div><button id="favorites-filter" class="favorites-filter" aria-pressed="false" title="Show favorites">${icon('heart',17)}<span class="favorite-count"></span></button></div>
        <form id="search-form" class="search-box"><label class="sr-only" for="search-input">Search channels</label>${icon('search',18)}<input id="search-input" type="search" placeholder="Name, place, or what to watch" autocomplete="off"><button type="submit" aria-label="Search with AI" title="Search with AI">AI</button></form>
        <div class="ai-hint" id="ai-hint">Press Enter to search by meaning. Model runs locally.</div>
        <div class="filters"><div><label for="country-filter">Country</label><select id="country-filter" aria-label="Filter by country"><option value="all">All countries</option></select></div><div><label for="language-filter">Language</label><select id="language-filter" aria-label="Filter by language"><option value="all">All languages</option></select></div></div>
        <div class="category-field"><label for="category-filter">Category</label><select id="category-filter" aria-label="Filter by category"></select></div>
        <div class="list-heading"><span>Available channels</span><span id="list-count"></span></div>
        <div class="channel-list" id="channel-list" aria-live="polite"></div>
        <button id="show-more" class="show-more" hidden>Show more ${icon('chevron',16)}</button>
      </aside>
      <main class="watch" aria-label="Live player">
        <div class="player-frame"><video id="video" controls playsinline preload="none"></video><div id="player-cover" class="player-cover">${icon('tv',46)}<h2>Select a channel</h2><p>Live TV plays here in your browser.</p></div><div class="player-live"><span></span> LIVE</div></div>
        <div class="watch-details"><div class="now-row"><div class="now-copy"><p class="now-label">NOW PLAYING</p><h2 id="now-title">No channel selected</h2><p id="now-meta">Choose a channel from the guide.</p></div><button id="favorite-button" class="icon-button" aria-label="Add to favorites" title="Add to favorites" hidden>${icon('heart',20)}</button></div><div id="player-error" class="player-error" hidden><span id="error-text"></span><button id="retry-button">Retry ${icon('refresh',16)}</button></div></div>
        <div class="source-note">Public links from <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener noreferrer">iptv-org</a>, with recent health checks from <a href="https://github.com/dearbulut/iptv" target="_blank" rel="noopener noreferrer">IPTV Nexus</a>. Playback can still vary by location.</div>
      </main>
    </div>
  </div>`;

const els = {
  video: document.querySelector('#video'), cover: document.querySelector('#player-cover'), list: document.querySelector('#channel-list'),
  result: document.querySelector('#result-summary'), count: document.querySelector('#list-count'), search: document.querySelector('#search-input'),
  category: document.querySelector('#category-filter'), country: document.querySelector('#country-filter'), language: document.querySelector('#language-filter'), more: document.querySelector('#show-more'),
  ai: document.querySelector('#ai-hint'), error: document.querySelector('#player-error'), errorText: document.querySelector('#error-text'),
  title: document.querySelector('#now-title'), meta: document.querySelector('#now-meta'), favorite: document.querySelector('#favorite-button')
};

let shown = 80;
function renderCategories() {
  els.category.innerHTML = categories.map(c => `<option value="${c}" ${state.category === c ? 'selected' : ''}>${c === 'all' ? 'All categories' : c[0].toUpperCase()+c.slice(1)}</option>`).join('');
}

function channelMarkup(ch) {
  const selected = state.selected?.id === ch.id;
  const favorite = state.favorites.has(ch.id);
  return `<button class="channel-row ${selected ? 'playing' : ''}" data-id="${ch.id}" aria-label="Play ${escapeHTML(ch.name)}">
    <span class="channel-logo">${ch.logo ? `<img src="${escapeHTML(ch.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${escapeHTML(ch.name.slice(0,2).toUpperCase())}</span>`}</span>
    <span class="channel-info"><strong>${escapeHTML(ch.name)}</strong><small>${escapeHTML(countryName(ch.country))} <i>·</i> ${escapeHTML((ch.languages || []).map(languageName).slice(0,2).join(', ') || ch.categories[0] || 'TV')}</small></span>
    ${favorite ? `<span class="row-favorite" aria-label="Favorite">${icon('heart',14)}</span>` : ''}<span class="row-play">${icon('play',16)}</span>
  </button>`;
}

function countryName(code) { return state.countries.find(c => c.code === code)?.name || code || 'Worldwide'; }
function languageName(code) { return state.languages.find(l => l.code === code)?.name || code; }
function renderList() {
  const displayed = state.results.slice(0, shown);
  els.list.innerHTML = displayed.length ? displayed.map(channelMarkup).join('') : `<div class="empty-list"><div>${icon('search',24)}</div><strong>No channels found</strong><p>Try a broader search or choose another country.</p></div>`;
  els.count.textContent = state.results.length.toLocaleString();
  els.result.textContent = `${state.results.length.toLocaleString()} channels`;
  els.more.hidden = state.results.length <= shown;
  document.querySelector('.favorite-count').textContent = state.favorites.size || '';
}

function filterChannels() {
  let pool = state.channels;
  if (state.favoritesOnly) pool = pool.filter(ch => state.favorites.has(ch.id));
  if (state.country !== 'all') pool = pool.filter(ch => ch.country === state.country);
  if (state.category !== 'all') pool = pool.filter(ch => ch.categories.includes(state.category));
  if (state.language !== 'all') pool = pool.filter(ch => ch.languages?.includes(state.language));
  state.results = rankChannels(pool, state.search, state.countries, state.languages, state.aiCategory);
  if (state.search && state.results.length === 0 && state.aiCategory) {
    const parsed = parseQuery(state.search, state.countries, state.languages);
    state.results = pool.filter(ch => (!parsed.countryCode || ch.country === parsed.countryCode) && (!parsed.languageCode || ch.languages?.includes(parsed.languageCode)) && ch.categories.includes(state.aiCategory));
  }
  renderCategories(); renderList();
}

function showError(message) { els.errorText.textContent = message; els.error.hidden = false; }
function clearError() { els.error.hidden = true; }

async function playChannel(id, attempt = 0, preferredLanguage = null) {
  const ch = state.channels.find(item => item.id === id);
  if (!ch) return;
  const serial = ++state.playSerial;
  if (preferredLanguage === null) preferredLanguage = state.language !== 'all' ? state.language : (parseQuery(state.search, state.countries, state.languages).languageCode || '');
  state.selected = ch;
  state.sourceAttempt = attempt;
  clearError();
  els.cover.hidden = true;
  els.video.classList.add('visible');
  els.title.textContent = ch.name;
  els.meta.textContent = attempt ? `Trying another feed (${attempt + 1} of ${state.sourceCount})…` : `${countryName(ch.country)} · ${(ch.languages || []).map(languageName).slice(0,2).join(', ') || ch.categories[0] || 'TV'}`;
  els.favorite.hidden = false;
  els.favorite.classList.toggle('is-favorite', state.favorites.has(id));
  els.favorite.setAttribute('aria-label', state.favorites.has(id) ? 'Remove from favorites' : 'Add to favorites');
  renderList();
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  els.video.pause(); els.video.removeAttribute('src'); els.video.load();
  try {
    const response = await fetch('/api/session', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, attempt, language: preferredLanguage}) });
    if (!response.ok) throw new Error(response.status === 503 ? 'No working feed is available for this channel right now.' : 'This channel could not be opened.');
    const {url, sources, sourceIndex} = await response.json();
    if (state.playSerial !== serial) return;
    state.sourceCount = sources;
    state.sourceAttempt = sourceIndex;
    const tryNext = () => {
      if (state.playSerial !== serial) return;
      if (sourceIndex + 1 < sources) playChannel(id, sourceIndex + 1, preferredLanguage);
      else showError(`No working feed for ${ch.name} right now. The listed source may be offline or restricted in your region.`);
    };
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 15, liveSyncDurationCount: 3 });
      state.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(els.video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { els.meta.textContent = `${countryName(ch.country)} · Feed ${sourceIndex + 1} of ${sources}`; els.video.play().catch(() => {}); });
      let handled = false;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal && !handled) { handled = true; tryNext(); }
      });
    } else if (els.video.canPlayType('application/vnd.apple.mpegurl')) {
      els.video.src = url;
      els.video.play().catch(() => {});
    } else { showError('This browser cannot play this stream format. Try a current version of Chrome, Edge, Firefox, or Safari.'); }
  } catch (error) { if (state.playSerial === serial) showError(error.message || 'This channel could not be opened.'); }
}

els.video.addEventListener('error', () => {
  if (!state.selected || state.hls) return;
  if (state.sourceAttempt + 1 < state.sourceCount) playChannel(state.selected.id, state.sourceAttempt + 1);
  else showError(`No working feed for ${state.selected.name} right now.`);
});
els.list.addEventListener('click', event => { const row = event.target.closest('[data-id]'); if (row) playChannel(row.dataset.id); });
els.category.addEventListener('change', event => { state.category = event.target.value; shown = 80; filterChannels(); });
els.country.addEventListener('change', event => { state.country = event.target.value; shown = 80; filterChannels(); });
els.language.addEventListener('change', event => { state.language = event.target.value; shown = 80; filterChannels(); });
els.more.addEventListener('click', () => { shown += 80; renderList(); });
els.search.addEventListener('input', event => { state.search = event.target.value; state.aiCategory = null; state.searchSerial++; shown = 80; filterChannels(); els.ai.textContent = 'Press Enter to search by meaning. Model runs locally.'; });
document.querySelector('#search-form').addEventListener('submit', async event => {
  event.preventDefault();
  const query = state.search.trim(); if (!query) { els.search.focus(); return; }
  const serial = ++state.searchSerial;
  const parsed = parseQuery(query, state.countries, state.languages);
  if (parsed.category || ((parsed.countryCode || parsed.languageCode) && parsed.terms.length === 0) || query.split(/\s+/).length < 2) {
    state.aiCategory = null;
    filterChannels();
    els.ai.textContent = parsed.category || parsed.countryCode || parsed.languageCode ? 'Matched your channel, place, or language terms.' : 'Try a phrase such as “relaxing nature shows” for AI search.';
    return;
  }
  els.ai.textContent = 'Loading on-device AI model and understanding your search…';
  try {
    const category = await inferCategory(query);
    if (serial !== state.searchSerial) return;
    state.aiCategory = category;
    filterChannels();
    els.ai.textContent = category ? `AI matched “${category}” · results stay on your device` : 'AI search ready · try a broader phrase';
  } catch { if (serial === state.searchSerial) els.ai.textContent = 'AI model unavailable right now · regular search still works'; }
});
document.querySelector('#favorites-filter').addEventListener('click', event => {
  state.favoritesOnly = !state.favoritesOnly;
  event.currentTarget.classList.toggle('active', state.favoritesOnly);
  event.currentTarget.setAttribute('aria-pressed', String(state.favoritesOnly));
  filterChannels();
});
els.favorite.addEventListener('click', () => {
  if (!state.selected) return;
  const id = state.selected.id;
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  localStorage.setItem('openwave-favorites', JSON.stringify([...state.favorites]));
  els.favorite.classList.toggle('is-favorite', state.favorites.has(id));
  els.favorite.setAttribute('aria-label', state.favorites.has(id) ? 'Remove from favorites' : 'Add to favorites');
  filterChannels();
});
document.querySelector('#retry-button').addEventListener('click', () => { if (state.selected) playChannel(state.selected.id); });

async function loadGuide() {
  try {
    const response = await fetch('/api/channels');
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    state.channels = data.channels;
    state.countries = data.countries.sort((a,b) => a.name.localeCompare(b.name));
    state.languages = data.languages || [];
    els.country.innerHTML = '<option value="all">All countries</option>' + state.countries.map(c => `<option value="${escapeHTML(c.code)}">${escapeHTML(c.name)}</option>`).join('');
    els.language.innerHTML = '<option value="all">All languages</option>' + state.languages.map(l => `<option value="${escapeHTML(l.code)}">${escapeHTML(l.name)}</option>`).join('');
    filterChannels();
  } catch {
    els.result.textContent = 'Could not load the channel guide';
    els.list.innerHTML = `<div class="empty-list"><div>${icon('refresh',24)}</div><strong>Guide unavailable</strong><p>Check your connection, then reload this page.</p></div>`;
  }
}
renderCategories(); loadGuide();
