import { animate } from 'motion';
import { createRadioCatalog } from './radio-catalog.js';

const genres = ['all', 'jazz', 'pop', 'rock', 'classical', 'electronic'];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const readFavorites = () => { try { return new Set(JSON.parse(localStorage.getItem('openwave-radio-favorites') || '[]')); } catch { return new Set(); } };

export function mountRadioMode() {
  const nativeMode = () => document.documentElement.classList.contains('openwave-native');
  const screen = document.createElement('main');
  screen.id = 'radio-screen';
  screen.className = 'radio-screen';
  screen.hidden = true;
  screen.innerHTML = `
    <div class="radio-heading"><div><h1>EVERY FREQUENCY.<br>ONE PLACE.</h1><p>Internet streams from stations around the world.</p></div><span id="radio-count" class="radio-count">TUNING THE DIAL</span></div>
    <div class="radio-grid">
      <section class="radio-console" aria-label="Radio player">
        <div class="radio-console-top"><span class="radio-console-brand">OPENWAVE RADIO</span><span id="radio-signal-state" class="radio-signal-state"><i></i> READY TO TUNE</span></div>
        <div class="radio-orbit" aria-hidden="true"><div class="radio-orbit-ring radio-orbit-ring-a"></div><div class="radio-orbit-ring radio-orbit-ring-b"></div><div class="radio-orbit-ring radio-orbit-ring-c"></div><div class="radio-orbit-core"><span id="radio-initials">OW</span><small>OPENWAVE</small></div></div>
        <div class="radio-signal-bars" aria-hidden="true">${Array.from({ length: 27 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>
        <div class="radio-player-content"><div class="radio-content-top"><span id="radio-label" class="radio-label">YOUR NEXT LISTEN</span><span id="radio-frequency" class="radio-frequency">LIVE RADIO</span></div><h2 id="radio-now">Pick a station</h2><p id="radio-meta">Find a sound you love in the station guide.</p><p id="radio-status" role="status">Ready when you are.</p><div class="radio-controls"><button id="radio-play-toggle" class="radio-play-toggle" aria-label="Play station"><svg class="radio-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg><svg class="radio-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button><label class="radio-volume-label"><span>VOLUME</span><input id="radio-volume" type="range" min="0" max="100" value="75" aria-label="Radio volume"></label></div></div>
        <audio id="radio-audio" preload="none"></audio>
      </section>
      <aside class="radio-guide" aria-label="Radio station guide"><div class="radio-guide-heading"><div><h2>Explore radio</h2><p id="radio-summary">Loading stations…</p></div><button id="radio-favorites-toggle" class="radio-favorites-toggle" aria-pressed="false">♡ My stations</button></div>
        <div class="radio-search-row"><label class="radio-search"><span aria-hidden="true">⌕</span><span class="sr-only">Search stations</span><input id="radio-search-input" type="search" placeholder="Station, country, or genre" autocomplete="off"></label>
        <button id="radio-filter-toggle" class="radio-filter-toggle" type="button" aria-expanded="false" aria-controls="radio-filter-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg> Filters <span aria-hidden="true">⌄</span></button>
        </div>
        <div id="radio-filter-panel" class="radio-filter-panel">
        <div id="radio-genres" class="radio-genres" role="group" aria-label="Radio genres"></div>
        <div class="radio-place"><div class="radio-place-row"><button id="radio-country" class="radio-place-choice" aria-haspopup="dialog" aria-controls="radio-picker" aria-expanded="false">Everywhere <span>⌄</span></button><button id="radio-city" class="radio-place-choice" aria-haspopup="dialog" aria-controls="radio-picker" aria-expanded="false">All cities <span>⌄</span></button></div><div class="radio-place-row"><button id="radio-near-me" class="radio-near-me">◎ Use my location</button><button id="radio-fm-only" class="radio-fm-only" aria-pressed="false">FM frequencies</button></div><p id="radio-location-note" class="radio-location-note">OpenWave matches locally; your browser or OS may use a location provider. City data: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>.</p></div>
        </div>
        <div class="radio-list-heading"><span>STATIONS</span><span id="radio-list-count">—</span></div><div id="radio-list" class="radio-list"></div><div id="radio-pager" class="channel-pager" aria-label="Station pages" hidden><button id="radio-page-prev" type="button">← Previous</button><span id="radio-page-status" role="status" aria-live="polite"></span><button id="radio-page-next" type="button">Next →</button></div><button id="radio-more" class="radio-more" hidden>Show more stations ↓</button>
        <div id="radio-picker" class="radio-picker" role="dialog" aria-modal="true" aria-labelledby="radio-picker-title" hidden><div class="radio-picker-heading"><button id="radio-picker-back" aria-label="Back to radio guide">←</button><h3 id="radio-picker-title">Choose country</h3></div><label class="radio-picker-search"><span aria-hidden="true">⌕</span><span class="sr-only">Search places</span><input id="radio-picker-search" type="search" placeholder="Search places" aria-controls="radio-picker-list"></label><div id="radio-picker-list" class="radio-picker-list" role="group" aria-label="Country options"></div></div>
      </aside>
    </div>`;
  document.querySelector('.app-shell').append(screen);
  const el = {
    count: screen.querySelector('#radio-count'), now: screen.querySelector('#radio-now'), meta: screen.querySelector('#radio-meta'), status: screen.querySelector('#radio-status'), initials: screen.querySelector('#radio-initials'), label: screen.querySelector('#radio-label'), frequency: screen.querySelector('#radio-frequency'), signalState: screen.querySelector('#radio-signal-state'),
    audio: screen.querySelector('#radio-audio'), play: screen.querySelector('#radio-play-toggle'), volume: screen.querySelector('#radio-volume'),
    summary: screen.querySelector('#radio-summary'), favorites: screen.querySelector('#radio-favorites-toggle'), search: screen.querySelector('#radio-search-input'), genres: screen.querySelector('#radio-genres'),
    list: screen.querySelector('#radio-list'), listCount: screen.querySelector('#radio-list-count'), more: screen.querySelector('#radio-more'), pager: screen.querySelector('#radio-pager'), pagePrev: screen.querySelector('#radio-page-prev'), pageNext: screen.querySelector('#radio-page-next'), pageStatus: screen.querySelector('#radio-page-status'),
    country: screen.querySelector('#radio-country'), city: screen.querySelector('#radio-city'), nearMe: screen.querySelector('#radio-near-me'), fmOnly: screen.querySelector('#radio-fm-only'), locationNote: screen.querySelector('#radio-location-note'),
    picker: screen.querySelector('#radio-picker'), pickerTitle: screen.querySelector('#radio-picker-title'), pickerSearch: screen.querySelector('#radio-picker-search'), pickerList: screen.querySelector('#radio-picker-list')
  };
  const state = { stations: [], results: [], selected: null, favorites: readFavorites(), favoritesOnly: false, genre: 'all', query: '', shown: 60, page: 0, pageSize: 4, loading: false, loaded: false, catalogStale: false, country: 'all', city: 'all', fmOnly: false, pickerKind: null, pendingCountry: null };
  let nativeFilterKey = '';
  let pickerInertNodes = [];
  const pickerTriggers = { country: el.country, city: el.city };
  function setPickerBackgroundInert(inert) {
    if (!inert) { for (const [node, wasInert] of pickerInertNodes) node.inert = wasInert; pickerInertNodes = []; return; }
    for (let current = el.picker; current.parentElement && current !== document.body; current = current.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          pickerInertNodes.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
    }
  }
  const catalog = createRadioCatalog();
  el.audio.volume = .75;

  function stationId(station) { return `${station.countryCode}:${station.id}`; }
  function renderGenres() {
    el.genres.innerHTML = genres.map(g => `<button class="radio-genre ${state.genre === g ? 'active' : ''}" data-radio-genre="${g}" aria-pressed="${state.genre === g}">${g === 'all' ? 'All' : g[0].toUpperCase() + g.slice(1)}</button>`).join('');
  }
  function renderPlaceLabels() {
    const country = state.stations.find(station => station.countryCode === state.country)?.country || 'Everywhere';
    el.country.innerHTML = `${escapeHTML(country)} <span aria-hidden="true">⌄</span>`;
    el.city.innerHTML = `${escapeHTML(state.city === 'all' ? 'All cities' : state.city)} <span aria-hidden="true">⌄</span>`;
    el.fmOnly.classList.toggle('active', state.fmOnly);
    el.fmOnly.setAttribute('aria-pressed', String(state.fmOnly));
  }
  function placeOptions() {
    if (state.pickerKind === 'country') {
      const unique = new Map(state.stations.map(station => [station.countryCode, station.country]));
      return [{ value: 'all', label: 'Everywhere' }, ...[...unique].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];
    }
    const places = [...new Set(state.stations.filter(station => station.countryCode === state.country && station.state).map(station => station.state.trim()))].sort((a, b) => a.localeCompare(b));
    return [{ value: 'all', label: 'All cities and regions' }, ...places.map(value => ({ value, label: value }))];
  }
  function renderPlaceOptions() {
    const query = el.pickerSearch.value.trim().toLowerCase();
    const options = placeOptions().filter(item => item.label.toLowerCase().includes(query));
    el.pickerList.innerHTML = options.length ? options.map((item, index) => `<button class="radio-picker-option ${state[state.pickerKind] === item.value ? 'active' : ''}" aria-pressed="${state[state.pickerKind] === item.value}" tabindex="${index === 0 ? 0 : -1}" data-place-value="${escapeHTML(item.value)}">${escapeHTML(item.label)}<span aria-hidden="true">${state[state.pickerKind] === item.value ? '✓' : ''}</span></button>`).join('') : '<p class="radio-picker-empty">No matching places</p>';
    el.pickerList.scrollTop = 0;
  }
  function openPlacePicker(kind) {
    if (kind === 'city' && state.country === 'all') { el.locationNote.textContent = 'Choose a country first to browse its cities and regions.'; return; }
    state.pickerKind = kind;
    pickerTriggers[kind].setAttribute('aria-expanded', 'true');
    el.pickerTitle.textContent = kind === 'country' ? 'Choose country' : 'Choose city or region';
    el.pickerList.setAttribute('aria-label', kind === 'country' ? 'Country options' : 'City or region options');
    el.pickerSearch.setAttribute('aria-label', kind === 'country' ? 'Search countries' : 'Search cities and regions');
    el.pickerSearch.value = '';
    el.pickerSearch.placeholder = kind === 'country' ? 'Search countries' : 'Search cities';
    el.picker.hidden = false;
    renderPlaceOptions();
    setPickerBackgroundInert(true);
    el.pickerSearch.focus();
  }
  function closePlacePicker(focusTrigger = true) {
    const trigger = pickerTriggers[state.pickerKind];
    trigger?.setAttribute('aria-expanded', 'false');
    el.picker.hidden = true;
    setPickerBackgroundInert(false);
    state.pickerKind = null;
    if (focusTrigger) trigger?.focus();
  }
  function stationMarkup(station) {
    const id = stationId(station);
    const favorite = state.favorites.has(id);
    return `<div class="radio-row ${state.selected && stationId(state.selected) === id ? 'selected' : ''}"><button class="radio-row-main" data-radio-play="${escapeHTML(id)}" aria-label="Play ${escapeHTML(station.name)}"><span class="radio-row-mark">${escapeHTML(station.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase())}</span><span class="radio-row-text"><strong>${escapeHTML(station.name)}</strong><small>${escapeHTML(station.country)} · ${escapeHTML(station.codec.toUpperCase())}${station.fmMhz?.length ? ` · ${escapeHTML(station.fmMhz[0])} FM` : ''}</small></span><span class="radio-row-arrow">↗</span></button><button class="radio-row-favorite ${favorite ? 'saved' : ''}" data-radio-save="${escapeHTML(id)}" aria-label="${favorite ? 'Remove' : 'Save'} ${escapeHTML(station.name)} ${favorite ? 'from' : 'to'} My stations" aria-pressed="${favorite}">♡</button></div>`;
  }
  function renderList() {
    const pageCount = Math.max(1, Math.ceil(state.results.length / state.pageSize));
    if (nativeMode()) state.page = Math.min(state.page, pageCount - 1);
    const first = nativeMode() ? state.page * state.pageSize : 0;
    const visible = state.results.slice(first, nativeMode() ? first + state.pageSize : state.shown);
    el.list.innerHTML = visible.length ? visible.map(stationMarkup).join('') : `<div class="radio-empty">${state.favoritesOnly ? 'Save a station with the heart beside its name.' : 'No stations match this search.'}</div>`;
    el.listCount.textContent = state.results.length.toLocaleString();
    el.summary.textContent = `${state.results.length.toLocaleString()} stations${state.catalogStale ? ' · saved guide may be out of date' : ''}`;
    el.more.hidden = nativeMode() || state.results.length <= state.shown;
    el.pager.hidden = !nativeMode();
    if (nativeMode()) {
      el.pagePrev.disabled = state.page === 0;
      el.pageNext.disabled = state.page >= pageCount - 1;
      el.pageStatus.textContent = state.results.length ? `${first + 1}–${first + visible.length} of ${state.results.length.toLocaleString()}` : '0 stations';
    }
  }
  function filter() {
    if (nativeMode()) {
      const key = [state.favoritesOnly, state.genre, state.query, state.country, state.city, state.fmOnly].join('|');
      if (key !== nativeFilterKey) { state.page = 0; nativeFilterKey = key; }
    }
    const query = state.query.trim().toLowerCase();
    state.results = state.stations.filter(station => {
      if (state.favoritesOnly && !state.favorites.has(stationId(station))) return false;
      if (state.genre !== 'all' && !(station.genre || []).some(tag => tag.includes(state.genre))) return false;
      if (state.country !== 'all' && station.countryCode !== state.country) return false;
      if (state.city !== 'all' && !String(station.state || '').toLowerCase().includes(state.city.toLowerCase())) return false;
      if (state.fmOnly && !station.fmMhz?.length) return false;
      return !query || [station.name, station.country, ...(station.genre || [])].some(value => String(value).toLowerCase().includes(query));
    });
    el.count.innerHTML = `<strong>${state.results.length.toLocaleString()}</strong><small>STATIONS TO EXPLORE</small>`;
    renderGenres(); renderList(); renderPlaceLabels();
  }
  function adoptCatalog(data) {
    state.stations = data.stations;
    state.catalogStale = data.stale;
    if (state.pendingCountry && state.stations.some(station => station.countryCode === state.pendingCountry)) {
      state.country = state.pendingCountry;
      state.pendingCountry = null;
    }
    filter();
  }
  async function load() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    try {
      adoptCatalog(await catalog.load());
      state.loaded = true;
      catalog.refresh().then(updated => { if (updated) adoptCatalog(updated); });
    } catch {
      el.summary.textContent = 'Radio guide unavailable';
      el.list.innerHTML = '<div class="radio-empty">The station list could not load. Check your connection and try again.</div>';
      el.count.textContent = 'SIGNAL UNAVAILABLE';
    } finally { state.loading = false; }
  }
  function playStation(station) {
    state.selected = station;
    el.audio.pause(); el.audio.src = station.stream;
    el.now.textContent = station.name;
    el.meta.textContent = `${station.country} · ${station.codec.toUpperCase()}${station.fmMhz?.length ? ` · ${station.fmMhz[0]} FM` : ''}`;
    el.initials.textContent = station.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || 'FM';
    el.frequency.textContent = station.fmMhz?.length ? `${station.fmMhz[0]} MHz` : 'INTERNET RADIO';
    el.label.textContent = 'TUNING IN';
    el.signalState.innerHTML = '<i></i> CONNECTING';
    el.status.textContent = 'Connecting to station…';
    el.play.setAttribute('aria-label', 'Pause station');
    screen.classList.remove('radio-playing'); screen.classList.add('radio-connecting');
    renderList();
    el.audio.play().catch(() => { el.status.textContent = 'Tap play to start this station.'; el.play.setAttribute('aria-label', 'Play station'); el.signalState.innerHTML = '<i></i> READY'; screen.classList.remove('radio-connecting'); });
  }
  el.audio.addEventListener('playing', () => { el.status.textContent = 'Live audio'; el.label.textContent = 'NOW PLAYING'; el.signalState.innerHTML = '<i></i> ON AIR'; screen.classList.remove('radio-connecting'); screen.classList.add('radio-playing'); el.play.setAttribute('aria-label', 'Pause station'); });
  el.audio.addEventListener('pause', () => { screen.classList.remove('radio-playing', 'radio-connecting'); el.play.setAttribute('aria-label', 'Play station'); el.signalState.innerHTML = '<i></i> PAUSED'; if (state.selected) { el.label.textContent = 'PAUSED'; el.status.textContent = 'Paused'; } });
  el.audio.addEventListener('error', () => { screen.classList.remove('radio-playing', 'radio-connecting'); el.status.textContent = 'This station is unavailable right now. Try another.'; el.label.textContent = 'SIGNAL LOST'; el.signalState.innerHTML = '<i></i> SIGNAL LOST'; el.play.setAttribute('aria-label', 'Play station'); });
  el.play.addEventListener('click', () => { if (!state.selected) { el.status.textContent = 'Choose a station from the list.'; el.search.focus(); return; } if (el.audio.paused) el.audio.play().catch(() => { el.status.textContent = 'This station cannot play in your browser.'; }); else el.audio.pause(); });
  el.volume.addEventListener('input', () => { el.audio.volume = Number(el.volume.value) / 100; });
  el.search.addEventListener('input', event => { state.query = event.target.value; state.shown = 60; filter(); });
  screen.querySelector('#radio-filter-toggle').addEventListener('click', event => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
    screen.querySelector('.radio-guide').classList.toggle('filters-open', expanded);
  });
  el.genres.addEventListener('click', event => { const chip = event.target.closest('[data-radio-genre]'); if (!chip) return; state.genre = chip.dataset.radioGenre; state.shown = 60; filter(); });
  el.country.addEventListener('click', () => openPlacePicker('country'));
  el.city.addEventListener('click', () => openPlacePicker('city'));
  screen.querySelector('#radio-picker-back').addEventListener('click', () => closePlacePicker());
  el.pickerSearch.addEventListener('input', renderPlaceOptions);
  el.pickerSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') { el.pickerList.querySelector('.radio-picker-option')?.click(); event.preventDefault(); }
    if (event.key === 'ArrowDown') { el.pickerList.querySelector('.radio-picker-option')?.focus(); event.preventDefault(); }
  });
  el.pickerList.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = [...el.pickerList.querySelectorAll('.radio-picker-option')];
    const index = options.indexOf(document.activeElement);
    const next = options[Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { document.activeElement.tabIndex = -1; next.tabIndex = 0; next.focus(); }
    event.preventDefault();
  });
  el.pickerList.addEventListener('click', event => {
    const option = event.target.closest('[data-place-value]'); if (!option || !state.pickerKind) return;
    const kind = state.pickerKind;
    state[kind] = option.dataset.placeValue;
    if (kind === 'country') { state.city = 'all'; state.pendingCountry = null; }
    state.shown = 60; filter(); closePlacePicker();
  });
  el.picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closePlacePicker(); event.preventDefault(); event.stopPropagation(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...el.picker.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(node => node.tabIndex >= 0 && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
  });
  document.addEventListener('focusin', event => { if (state.pickerKind && !el.picker.contains(event.target)) el.pickerSearch.focus(); });
  el.fmOnly.addEventListener('click', () => { state.fmOnly = !state.fmOnly; state.shown = 60; filter(); });
  let citiesPromise;
  el.nearMe.addEventListener('click', () => {
    if (!navigator.geolocation) { el.locationNote.textContent = 'Location is unavailable in this browser. Choose a country instead.'; return; }
    el.locationNote.textContent = 'Finding an approximate city on this device…';
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        citiesPromise ||= fetch('/geo/cities.json').then(response => { if (!response.ok) throw new Error('City index unavailable'); return response.json(); });
        const cities = await citiesPromise;
        const lat = position.coords.latitude, lon = position.coords.longitude;
        let nearest, best = Infinity;
        const longitudeScale = Math.cos(lat * Math.PI / 180);
        for (const city of cities) {
          const distance = (city[2] - lat) ** 2 + ((city[3] - lon) * longitudeScale) ** 2;
          if (distance < best) { best = distance; nearest = city; }
        }
        if (!nearest) throw new Error('No city found');
        state.country = nearest[1];
        const cityName = nearest[0].toLowerCase();
        const matchingCity = [...new Set(state.stations.filter(station => station.countryCode === state.country && station.state).map(station => station.state.trim()))]
          .find(name => name.toLowerCase().includes(cityName) || cityName.includes(name.toLowerCase()));
        state.city = matchingCity || 'all';
        state.fmOnly = true; state.shown = 60; filter();
        if (!state.results.length) { state.fmOnly = false; filter(); }
        if (!state.results.length) { state.city = 'all'; filter(); }
        el.locationNote.innerHTML = `Near ${escapeHTML(nearest[0])}. ${state.city === 'all' ? 'Showing country stations.' : 'Showing local matches.'} OpenWave matches locally; your browser or OS may use a location provider. City data: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>.`;
      } catch { el.locationNote.textContent = 'Could not match a nearby city. Choose a country instead.'; }
    }, () => { el.locationNote.textContent = 'Location access was not available. Choose a country instead.'; }, { enableHighAccuracy: false, maximumAge: 3600000, timeout: 10000 });
  });
  el.favorites.addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; el.favorites.classList.toggle('active', state.favoritesOnly); el.favorites.setAttribute('aria-pressed', String(state.favoritesOnly)); filter(); });
  el.list.addEventListener('click', event => {
    const saved = event.target.closest('[data-radio-save]');
    if (saved) {
      const id = saved.dataset.radioSave;
      if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
      localStorage.setItem('openwave-radio-favorites', JSON.stringify([...state.favorites]));
      const top = el.list.scrollTop; filter(); el.list.scrollTop = top;
      return;
    }
    const play = event.target.closest('[data-radio-play]');
    if (play) { const station = state.stations.find(item => stationId(item) === play.dataset.radioPlay); if (station) playStation(station); }
  });
  el.more.addEventListener('click', () => { state.shown += 60; renderList(); });
  el.pagePrev.addEventListener('click', () => { if (state.page > 0) { state.page--; renderList(); el.pagePrev.focus(); } });
  el.pageNext.addEventListener('click', () => { if (!el.pageNext.disabled) { state.page++; renderList(); el.pageNext.focus(); } });
  new ResizeObserver(() => {
    if (!nativeMode()) return;
    const size = Math.max(1, Math.floor(el.list.clientHeight / 50));
    if (size !== state.pageSize) { state.pageSize = size; renderList(); }
  }).observe(el.list);
  document.addEventListener('visibilitychange', () => screen.classList.toggle('radio-hidden', document.hidden));
  renderGenres();

  return {
    refreshLayout() { state.page = 0; renderList(); },
    applyPreferences(preferences) {
      const code = preferences?.country === 'UK' ? 'GB' : preferences?.country;
      state.pendingCountry = code || null;
      if (code && state.stations.some(station => station.countryCode === code)) { state.country = code; state.city = 'all'; filter(); }
    },
    show() {
      document.querySelector('[data-tv-layout]').hidden = true;
      screen.hidden = false;
      document.documentElement.classList.add('radio-mode');
      window.scrollTo({ top: 0, behavior: 'instant' });
      load();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animate(screen, { opacity: [0.6, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: .46, ease: [.16, 1, .3, 1] });
    },
    hide() { if (state.pickerKind) closePlacePicker(false); el.audio.pause(); screen.hidden = true; document.documentElement.classList.remove('radio-mode'); document.querySelector('[data-tv-layout]').hidden = false; }
  };
}
