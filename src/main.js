import Hls from 'hls.js';
import { animate, stagger } from 'motion';
import { inferCategory, rankChannels, parseQuery } from './search.js';
import { mountRadioMode } from './radio.js';
import { createOnboarding } from './onboarding.js';
import { parsePrivatePlaylist, PRIVATE_PLAYLIST_MAX_BYTES } from './private-playlist.js';
import { registerPwa } from './pwa.js';
import { createWebCatalog } from './web-catalog.js';
import { CATEGORIES } from './catalog-categories.js';
import './style.css';

const app = document.querySelector('#app');
const WEB_MODE = import.meta.env.VITE_WEB_MODE === true;
const IOS_DEVICE = WEB_MODE && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const WEB_STANDALONE = WEB_MODE && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
const nativeShell = window.__OPENWAVE_NATIVE__ === true;
const desktopViewport = window.matchMedia('(min-width: 1024px) and (min-height: 700px)');
let NATIVE_MODE = !WEB_MODE && (nativeShell || desktopViewport.matches);
if (NATIVE_MODE) document.documentElement.classList.add('openwave-native');
if (WEB_MODE) document.documentElement.classList.add('openwave-web');
if (IOS_DEVICE) document.documentElement.classList.add('ios-device');
if (WEB_STANDALONE) document.documentElement.classList.add('ios-standalone');
const webCatalog = createWebCatalog();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const categories = CATEGORIES;
const quickCategories = categories.slice(0, 6);
const state = {
  channels: [], directory: [], directoryView: false, sportsCatalog: null, sportsWorldwide: false, sportsCountry: 'all', nativeSportsReturn: null, countries: [], languages: [], results: [], selected: null, hls: null,
  privateChannels: [], privateOnly: false,
  search: '', category: 'all', country: 'all', language: 'all', favoritesOnly: false,
  favorites: new Set(readStore('openwave-favorites', [])),
  favoriteCountries: readStore('openwave-favorite-countries', {}), favoriteChannels: [],
  recent: readStore('openwave-recent', []),
  aiCategory: null, searchSerial: 0, playSerial: 0, sourceCount: 0, sourceAttempt: 0,
  filterTimer: null, tuneAnimation: null, tuneTimer: null, unavailable: readStore('openwave-unavailable', {}), recovered: new Set()
};
let webCatalogIndex = null;
let webCountryLoad = 0;

function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
  catch { return fallback; }
}

const glyph = (name, size = 20) => {
  const paths = {
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    heart: '<path d="M20.8 8.4c0 4.7-8.8 10.5-8.8 10.5S3.2 13.1 3.2 8.4a4.3 4.3 0 0 1 8.8-1.1 4.3 4.3 0 0 1 8.8 1.1Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.5 4 5.5 4 9s-1.3 6.5-4 9c-2.7-2.5-4-5.5-4-9s1.3-6.5 4-9Z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.2 6.7M20 4v7h-7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    tv: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 22h8M12 19v3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    signal: '<path d="M2 17h2l2-9 3 13 3-17 3 13 2-5 2 5h3"/>',
    sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const platformGlyph = name => {
  const paths = {
    mac: '<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M2 19h20l-2-3H4l-2 3Z"/>',
    windows: '<path d="M3 5.5 11 4v8H3V5.5Zm10-1.8 8-1.2V12h-8V3.7ZM3 13h8v8l-8-1.3V13Zm10 0h8v8.5l-8-1.2V13Z"/>',
    android: '<path d="m6 7-2-3m14 3 2-3M5 11a7 7 0 0 1 14 0v6H5v-6Zm-2 2v5m18-5v5M8 17v3m8-3v3"/><path d="M9 11h.01M15 11h.01" stroke-width="2.4"/>',
    ios: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-2 13.5h.01"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const titleCase = value => value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1);

function webStreamURLs(channel) {
  const candidates = [channel.url, ...(Array.isArray(channel.urls) ? channel.urls : []), ...(Array.isArray(channel.streams) ? channel.streams.map(stream => typeof stream === 'string' ? stream : stream?.url) : [])];
  return [...new Set(candidates.filter(value => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }))];
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="OpenWave TV home"><span class="brand-emblem">${glyph('signal', 23)}</span><span>OPENWAVE</span></a>
      <nav class="top-nav" aria-label="Primary"><button id="nav-home" class="active">Home</button><button id="nav-guide">Channels</button><button id="nav-radio">Radio</button><button id="nav-favorites">Favorites</button></nav>
      <div class="topbar-actions"><a class="github-link" href="https://github.com/jobinebanezer18/openwave-tv" target="_blank" rel="noopener noreferrer">GitHub ${glyph('arrow', 15)}</a><nav class="platform-downloads" aria-label="Get OpenWave for your device" ${WEB_MODE ? '' : 'hidden'}><a href="/downloads/#mac" aria-label="Download for Mac" title="Mac">${platformGlyph('mac')}</a><a href="/downloads/#windows" aria-label="Download for Windows" title="Windows">${platformGlyph('windows')}</a><a href="/downloads/#android" aria-label="Download for Android" title="Android">${platformGlyph('android')}</a><a href="/downloads/#ios" aria-label="Install on iPhone" title="iPhone">${platformGlyph('ios')}</a></nav><button id="updates-button" class="updates-button" type="button" ${nativeShell ? '' : 'hidden'}>Updates</button><button id="quit-button" class="quit-button" type="button" ${WEB_MODE ? 'hidden' : ''}>Quit app</button><button id="mobile-radio" class="mobile-radio">Radio</button><button id="ios-install-button" class="ios-install-button" type="button" hidden>Install</button><button id="preferences-button" class="preferences-button" aria-label="Preferences" title="Preferences">${glyph('sliders', 18)}</button><button id="header-guide" class="topbar-guide">Watch now <span>↗</span></button></div>
    </header>
    <div id="offline-banner" class="offline-banner" role="status" hidden>The guide is saved, but live channels need an internet connection.</div>
    <aside id="ios-install-card" class="ios-install-card" aria-label="Install OpenWave on iPhone" hidden><button id="ios-install-close" class="ios-install-close" type="button" aria-label="Dismiss install instructions">×</button><span class="ios-install-kicker">ON YOUR HOME SCREEN</span><strong>One tap to live TV.</strong><p id="ios-install-instructions">In Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown.</p><button id="ios-install-done" class="ios-install-done" type="button">Got it</button></aside>
    <div id="web-update-banner" class="web-update-banner" role="status" aria-live="polite" hidden><span>New OpenWave version ready</span><button id="web-update-now" type="button">Refresh</button><button id="web-update-later" type="button" aria-label="Dismiss update reminder">×</button></div>
    <main class="layout" id="top" data-tv-layout>
      <div class="stage-column">
        <div class="stage-heading"><div><h1>THE WORLD IS LIVE.<br><span>JUST TUNE IN.</span></h1></div><span id="stage-count" class="stage-count">Connecting to the guide…</span></div>
        <section class="player-shell" id="player-shell" aria-label="Live player" tabindex="-1">
          <video id="video" controls playsinline preload="none"></video>
          <button id="exit-player-fullscreen" class="exit-player-fullscreen" type="button" hidden>Exit fullscreen ×</button>
          <div id="player-cover" class="player-cover">
            <svg class="signal-graphic" viewBox="0 0 1200 680" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="M-90 460C190 60 430 720 710 310S1120 10 1310 430"/><path d="M-90 510C190 110 430 770 710 360S1120 60 1310 480"/><path d="M-90 560C190 160 430 820 710 410S1120 110 1310 530"/><path d="M-90 610C190 210 430 870 710 460S1120 160 1310 580"/></svg>
            <div class="cover-content"><h2>ALL THE WORLD.<br><em>ONE SCREEN.</em></h2><p>Find a channel. The live feed starts here.</p><button id="cover-browse" class="cover-cta">Explore live TV ${glyph('arrow', 19)}</button></div>
            <div class="cover-footer"><span>OPENWAVE · LIVE SIGNAL</span><time id="local-clock"></time></div>
          </div>
          <div id="tune-overlay" class="tune-overlay" hidden>
            <div class="tune-mark">${glyph('signal', 28)}</div>
            <span class="tune-label">TUNING IN</span>
            <h2 id="tune-name"></h2>
            <p id="tune-status">Finding a live feed…</p>
            <div class="tune-progress"><span></span></div>
            <button id="tap-to-play" class="tap-to-play" hidden>Play channel ${glyph('play', 16)}</button>
          </div>
          <div class="player-live"><span class="broadcast-dot"></span> LIVE</div>
        </section>
        <div class="now-panel">
          <div class="now-identity"><span class="now-label">NOW PLAYING</span><h2 id="now-title">Pick your first channel</h2><p id="now-meta">The guide is ready when you are.</p></div>
          <div class="now-actions"><button id="favorite-button" class="stage-icon-button" aria-label="Add to favorites" title="Add to favorites" hidden>${glyph('heart', 21)}</button><button id="fullscreen-button" class="stage-icon-button" aria-label="Enter fullscreen" title="Enter fullscreen" hidden>${glyph('expand', 21)}</button></div>
        </div>
        <div id="player-error" class="player-error" role="alert" hidden><span id="error-text"></span><div class="player-error-actions"><button id="alternative-button" hidden></button><button id="retry-button">Retry ${glyph('refresh', 16)}</button></div></div>
        <section class="rail-section" aria-label="Suggested channels"><div class="rail-heading"><div><h2 id="rail-title">Start watching</h2><p id="rail-subtitle">Good places to begin.</p></div><span class="rail-hint">PICK A SIGNAL →</span></div><div id="recent-rail" class="recent-rail"></div></section>
      </div>
      <aside class="guide" id="guide" aria-label="Channel guide">
        <div class="guide-heading"><div><h2 id="guide-title">Explore live</h2><p id="result-summary" aria-live="polite">Loading channels…</p></div><button id="favorites-filter" class="favorites-filter" aria-pressed="false" title="Show saved channels">${glyph('heart', 17)}<span>My channels</span><span class="favorite-count"></span></button></div>
        <form id="search-form" class="search-box"><label class="sr-only" for="search-input">Search channels</label>${glyph('search', 19)}<input id="search-input" type="search" placeholder="Find a channel, mood, or place" autocomplete="off"><button type="submit" aria-label="Smart search using on-device MiniLM" title="Smart search using on-device MiniLM"><span class="ai-star">✦</span> Smart</button></form>
        <p class="ai-hint" id="ai-hint">Smart search uses MiniLM on this device. First use downloads the model.</p>
        <div id="guide-modes" class="guide-modes" role="group" aria-label="Guide view" ${WEB_MODE ? '' : 'hidden'}><button id="watch-mode" type="button" class="selected" aria-pressed="true">Watch</button><button id="directory-mode" type="button" aria-pressed="false">All channels <span id="directory-total"></span></button></div>
        <div class="quick-categories" id="quick-categories" role="group" aria-label="Quick category filters"></div>
        <div class="filter-area"><button id="filter-toggle" class="filter-toggle" aria-expanded="false" aria-controls="advanced-filters">${glyph('sliders', 17)}<span>Refine channels</span><span id="filter-count" class="filter-count"></span>${glyph('chevron', 15)}</button>
          <div id="advanced-filters" class="advanced-filters" hidden><div class="filters"><div><span class="filter-label">Country</span><button id="country-trigger" class="filter-choice" aria-haspopup="dialog" aria-controls="filter-picker" aria-expanded="false">Everywhere ${glyph('chevron', 15)}</button></div><div><span class="filter-label">Language</span><button id="language-trigger" class="filter-choice" aria-haspopup="dialog" aria-controls="filter-picker" aria-expanded="false">Any language ${glyph('chevron', 15)}</button></div></div><div class="category-field"><span class="filter-label">Browse category</span><button id="category-trigger" class="filter-choice" aria-haspopup="dialog" aria-controls="filter-picker" aria-expanded="false">All categories ${glyph('chevron', 15)}</button></div></div></div>
        <div class="private-tools" role="group" aria-label="Private playlist">
          <button id="private-view" class="private-view" type="button" hidden>Your playlist</button>
          <button id="private-import" class="private-import" type="button">${glyph('upload', 16)} <span>Import M3U</span></button>
          <button id="private-clear" class="private-clear" type="button" hidden>Remove</button>
          <input id="private-file" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl" hidden aria-label="Choose private M3U playlist">
        </div>
        <p id="private-status" class="private-status" role="status" aria-live="polite">Your file stays in this tab.</p>
        <div class="list-heading"><span id="list-label">CHANNELS</span><span id="list-count">—</span></div>
        <div class="channel-list" id="channel-list"></div>
        <div id="channel-pager" class="channel-pager" aria-label="Channel pages" hidden><button id="page-prev" type="button">← Previous</button><span id="page-status" role="status" aria-live="polite"></span><button id="page-next" type="button">Next →</button></div>
        <button id="show-more" class="show-more" hidden>Show more channels ${glyph('chevron', 16)}</button>
        <div id="filter-picker" class="filter-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" hidden><div class="picker-heading"><button id="picker-back" class="picker-back" aria-label="Back to filters">←</button><h3 id="picker-title">Choose</h3></div><label class="picker-search">${glyph('search', 19)}<span class="sr-only">Search options</span><input id="picker-search-input" type="search" placeholder="Search" autocomplete="off" aria-controls="picker-list"></label><div id="picker-list" class="picker-list" role="group" aria-label="Filter options"></div></div>
      </aside>
    </main>
    <nav class="mobile-tabs" aria-label="App navigation"><button type="button" data-nav-target="nav-home" aria-pressed="true">${glyph('tv', 19)}<span>Live</span></button><button type="button" data-nav-target="nav-guide" aria-pressed="false">${glyph('search', 19)}<span>Channels</span></button><button type="button" data-nav-target="nav-radio" aria-pressed="false">${glyph('signal', 19)}<span>Radio</span></button><button type="button" data-nav-target="nav-favorites" aria-pressed="false">${glyph('heart', 19)}<span>Saved</span></button></nav>
  </div>`;

const els = {
  video: document.querySelector('#video'), shell: document.querySelector('#player-shell'), cover: document.querySelector('#player-cover'), tune: document.querySelector('#tune-overlay'),
  tuneName: document.querySelector('#tune-name'), tuneStatus: document.querySelector('#tune-status'), tap: document.querySelector('#tap-to-play'),
  list: document.querySelector('#channel-list'), pager: document.querySelector('#channel-pager'), pagePrev: document.querySelector('#page-prev'), pageNext: document.querySelector('#page-next'), pageStatus: document.querySelector('#page-status'), rail: document.querySelector('#recent-rail'), railTitle: document.querySelector('#rail-title'), railSubtitle: document.querySelector('#rail-subtitle'),
  result: document.querySelector('#result-summary'), count: document.querySelector('#list-count'), stageCount: document.querySelector('#stage-count'),
  search: document.querySelector('#search-input'), quick: document.querySelector('#quick-categories'),
  countryTrigger: document.querySelector('#country-trigger'), languageTrigger: document.querySelector('#language-trigger'), categoryTrigger: document.querySelector('#category-trigger'), more: document.querySelector('#show-more'),
  ai: document.querySelector('#ai-hint'), error: document.querySelector('#player-error'), errorText: document.querySelector('#error-text'),
  title: document.querySelector('#now-title'), meta: document.querySelector('#now-meta'), favorite: document.querySelector('#favorite-button'),
  fullscreen: document.querySelector('#fullscreen-button'), favoritesFilter: document.querySelector('#favorites-filter'), clock: document.querySelector('#local-clock'),
  filterToggle: document.querySelector('#filter-toggle'), advanced: document.querySelector('#advanced-filters'), filterCount: document.querySelector('#filter-count'),
  picker: document.querySelector('#filter-picker'), pickerTitle: document.querySelector('#picker-title'), pickerSearch: document.querySelector('#picker-search-input'), pickerList: document.querySelector('#picker-list'), stageCount: document.querySelector('#stage-count')
};
const privateEls = {
  tools: document.querySelector('.private-tools'),
  view: document.querySelector('#private-view'),
  import: document.querySelector('#private-import'),
  file: document.querySelector('#private-file'),
  clear: document.querySelector('#private-clear'),
  status: document.querySelector('#private-status'),
  label: document.querySelector('#list-label'),
  title: document.querySelector('#guide-title'),
  smart: document.querySelector('#search-form button[type="submit"]')
};
const alternativeButton = document.querySelector('#alternative-button');
if (WEB_MODE) {
  const offlineBanner = document.querySelector('#offline-banner');
  const updateOfflineBanner = () => { offlineBanner.hidden = navigator.onLine; };
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();
  const updateBanner = document.querySelector('#web-update-banner');
  registerPwa({ onUpdate: () => { updateBanner.hidden = false; } });
  document.querySelector('#web-update-now').addEventListener('click', () => window.location.reload());
  document.querySelector('#web-update-later').addEventListener('click', () => { updateBanner.hidden = true; });
  if (IOS_DEVICE && !WEB_STANDALONE) {
    const installButton = document.querySelector('#ios-install-button');
    const installCard = document.querySelector('#ios-install-card');
    const installInstructions = document.querySelector('#ios-install-instructions');
    const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    if (!safari) installInstructions.textContent = 'Open tv.vibeworks.in in Safari. Tap Share, then Add to Home Screen.';
    installButton.hidden = false;
    installButton.addEventListener('click', () => { installCard.hidden = false; });
    const dismissInstall = () => {
      installCard.hidden = true;
      try { localStorage.setItem('openwave-ios-install-dismissed', '1'); } catch {}
    };
    document.querySelector('#ios-install-close').addEventListener('click', dismissInstall);
    document.querySelector('#ios-install-done').addEventListener('click', dismissInstall);
    try { installCard.hidden = localStorage.getItem('openwave-ios-install-dismissed') === '1'; }
    catch { installCard.hidden = false; }
  }
  privateEls.smart.hidden = true;
  els.ai.textContent = 'Search channels by name, language, place, or category.';
  document.querySelector('.stage-heading h1').innerHTML = 'THE WORLD IS LIVE.<br><span>JUST TUNE IN.</span>';
  document.querySelector('.cover-content h2').innerHTML = 'ONE WORLD.<br><em>ONE SCREEN.</em>';
  document.querySelector('.cover-content p').textContent = 'Choose a country, then pick a channel to try its direct stream.';
}
const radioMode = mountRadioMode();
function onboardingOptions() {
  return WEB_MODE ? {
    includeEverywhere: false,
    countryLanguages: code => {
      const codes = new Set(webCatalogIndex?.countries.find(country => country.code === code)?.languages || []);
      return (webCatalogIndex?.languages || []).filter(language => codes.has(language.code));
    }
  } : {};
}
const onboarding = createOnboarding(preferences => {
  state.preferences = preferences;
  state.directoryView = false;
  if (!WEB_MODE) state.country = preferences.country || 'all';
  state.language = preferences.language || 'all';
  state.category = 'all';
  state.search = '';
  els.search.value = '';
  state.aiCategory = null;
  state.favoritesOnly = false;
  setPrivateView(false);
  els.favoritesFilter.classList.remove('active');
  els.favoritesFilter.setAttribute('aria-pressed', 'false');
  setFiltersOpen(false);
  radioMode.hide();
  setNavActive('nav-home');
  radioMode.applyPreferences(preferences);
  updateGuideMode();
  if (WEB_MODE) activateWebCountry(preferences.country || 'IN');
  else { filterChannels(true); renderRail(); }
  if (window.matchMedia('(max-width: 860px)').matches) document.querySelector('#guide').scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' });
});

function countryName(code) { return state.countries.find(c => c.code === code)?.name || code || 'Worldwide'; }
function languageName(code) { return state.languages.find(l => l.code === code)?.name || webCatalogIndex?.languages?.find(l => l.code === code)?.name || code; }
function channelMeta(ch) { return ch.private ? 'Private playlist · This tab only' : `${countryName(ch.country)} · ${(ch.languages || []).map(languageName).slice(0, 2).join(', ') || titleCase(ch.categories[0] || 'TV')}`; }
function findChannel(id) { return id.startsWith('private:') ? state.privateChannels.find(ch => ch.id === id) : state.channels.find(ch => ch.id === id) || state.directory.find(ch => ch.id === id) || state.sportsCatalog?.channels.find(ch => ch.id === id) || state.favoriteChannels.find(ch => ch.id === id); }
function isUnavailable(ch) { return Date.now() - (state.unavailable[ch.id] || 0) < 30 * 60 * 1000; }
function failedBrowserCheck(ch) { return WEB_MODE && ch.browser_check === 'failed' && !state.recovered.has(ch.id); }
function rememberUnavailable(ch) {
  if (ch.private) return;
  state.unavailable[ch.id] = Date.now();
  localStorage.setItem('openwave-unavailable', JSON.stringify(state.unavailable));
  filterChannels(); renderRail();
}
function clearUnavailable(ch) {
  if (ch.private) return;
  if (failedBrowserCheck(ch)) { state.recovered.add(ch.id); filterChannels(); renderRail(); }
  if (!state.unavailable[ch.id]) return;
  delete state.unavailable[ch.id];
  localStorage.setItem('openwave-unavailable', JSON.stringify(state.unavailable));
  filterChannels(); renderRail();
}
function suggestAlternative(ch) {
  if (ch.private) return state.privateChannels.find(candidate => candidate.id !== ch.id);
  return state.channels.filter(candidate => candidate.id !== ch.id && !isUnavailable(candidate) && !failedBrowserCheck(candidate) && candidate.country === ch.country && candidate.categories.some(category => ch.categories.includes(category)))
    .sort((a, b) => (Number(b.languages?.some(language => ch.languages?.includes(language))) - Number(a.languages?.some(language => ch.languages?.includes(language)))) || (b.health_score || 0) - (a.health_score || 0))[0];
}

function renderClock() {
  els.clock.textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
renderClock(); setInterval(renderClock, 60_000);

function renderCategories() {
  const categoryPool = WEB_MODE && state.directoryView ? [...state.channels, ...state.directory] : state.channels;
  const visibleCategories = WEB_MODE ? quickCategories.filter(c => c === 'all' || categoryPool.some(ch => ch.categories.includes(c))) : quickCategories;
  els.quick.innerHTML = visibleCategories.map(c => `<button class="quick-chip ${state.category === c ? 'selected' : ''}" data-category="${c}" aria-pressed="${state.category === c}">${titleCase(c)}</button>`).join('');
  els.countryTrigger.innerHTML = `${escapeHTML(state.sportsWorldwide ? state.sportsCountry === 'all' ? 'Worldwide' : countryName(state.sportsCountry) : state.country === 'all' ? 'Everywhere' : countryName(state.country))} ${glyph('chevron', 15)}`;
  els.languageTrigger.innerHTML = `${escapeHTML(state.language === 'all' ? 'Any language' : languageName(state.language))} ${glyph('chevron', 15)}`;
  els.categoryTrigger.innerHTML = `${escapeHTML(state.category === 'all' ? 'All categories' : titleCase(state.category))} ${glyph('chevron', 15)}`;
}

function channelMarkup(ch, index) {
  const selected = state.selected?.id === ch.id;
  if (ch.private) return `<div class="channel-row ${selected ? 'playing' : ''}"><button class="row-main" data-id="${escapeHTML(ch.id)}" aria-label="Play ${escapeHTML(ch.name)}" ${selected ? 'aria-current="true"' : ''}><span class="row-index">${String(index + 1).padStart(2, '0')}</span><span class="channel-logo private-logo">${glyph('tv', 20)}</span><span class="channel-info"><strong>${escapeHTML(ch.name)}</strong><small>Private playlist · This tab only</small></span><span class="row-arrow">${glyph('arrow', 17)}</span></button></div>`;
  if (ch.directoryOnly || (WEB_MODE && !ch.url)) {
    const saved = state.favorites.has(ch.id);
    return `<div class="channel-row directory-only"><span class="row-index">${String(index + 1).padStart(2, '0')}</span><span class="channel-logo"><span>${escapeHTML(ch.name.slice(0, 2).toUpperCase())}</span></span><span class="channel-info"><strong>${escapeHTML(ch.name)}</strong><small>${escapeHTML(channelMeta(ch))} · ${ch.provider ? `${ch.provider} viewing page` : 'No direct stream'}</small></span>${ch.website ? `<a class="official-link" href="${escapeHTML(ch.website)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(ch.name)} ${ch.provider ? 'on Sun NXT' : 'official site'}">${ch.provider ? 'Sun NXT' : 'Official site'} ↗</a>` : ''}<button class="row-save ${saved ? 'saved' : ''}" data-save-id="${escapeHTML(ch.id)}" aria-label="${saved ? 'Remove' : 'Save'} ${escapeHTML(ch.name)} ${saved ? 'from' : 'to'} My channels" aria-pressed="${saved}" title="${saved ? 'Remove from' : 'Save to'} My channels">${glyph('heart', 17)}</button></div>`;
  }
  const favorite = state.favorites.has(ch.id);
  const unavailable = isUnavailable(ch) || failedBrowserCheck(ch);
  return `<div class="channel-row ${selected ? 'playing' : ''} ${unavailable ? 'unavailable' : ''}"><button class="row-main" data-id="${escapeHTML(ch.id)}" aria-label="${unavailable ? 'Retry' : 'Play'} ${escapeHTML(ch.name)}" ${selected ? 'aria-current="true"' : ''}>
    <span class="row-index">${String(index + 1).padStart(2, '0')}</span>
    <span class="channel-logo">${ch.logo ? `<img src="${escapeHTML(ch.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${escapeHTML(ch.name.slice(0, 2).toUpperCase())}</span>`}</span>
    <span class="channel-info"><strong>${escapeHTML(ch.name)}</strong><small>${escapeHTML(failedBrowserCheck(ch) ? 'Recent signal check failed · Tap to retry' : unavailable ? 'Unavailable just now · Tap to retry' : channelMeta(ch))}</small></span><span class="row-arrow">${glyph('arrow', 17)}</span>
  </button><button class="row-save ${favorite ? 'saved' : ''}" data-save-id="${escapeHTML(ch.id)}" aria-label="${favorite ? 'Remove' : 'Save'} ${escapeHTML(ch.name)} ${favorite ? 'from' : 'to'} My channels" aria-pressed="${favorite}" title="${favorite ? 'Remove from' : 'Save to'} My channels">${glyph('heart', 17)}</button></div>`;
}

let shown = 60;
let nativePage = 0;
let nativePageSize = 4;
let nativeFilterKey = '';
function renderList(withMotion = false) {
  const pageCount = Math.max(1, Math.ceil(state.results.length / nativePageSize));
  if (NATIVE_MODE) nativePage = Math.min(nativePage, pageCount - 1);
  const first = NATIVE_MODE ? nativePage * nativePageSize : 0;
  const displayed = state.results.slice(first, NATIVE_MODE ? first + nativePageSize : shown);
  const directoryAvailable = WEB_MODE && !state.directoryView && !state.search && !state.favoritesOnly && state.channels.length === 0 && state.directory.length > 0;
  els.list.innerHTML = displayed.length ? displayed.map((channel, index) => channelMarkup(channel, first + index)).join('') : `<div class="empty-list">${glyph(state.favoritesOnly ? 'heart' : 'search', 25)}<strong>${state.favoritesOnly ? 'Your shortlist starts here' : directoryAvailable ? 'No direct stream indexed' : 'No channels here yet'}</strong><p>${state.favoritesOnly ? 'Tap a heart beside any channel to save it here.' : directoryAvailable ? 'Open All channels to browse this country’s directory.' : 'Try a broader search or clear a filter.'}</p></div>`;
  const count = state.results.length.toLocaleString();
  const channelWord = state.results.length === 1 ? 'channel' : 'channels';
  els.count.textContent = count;
  const directCount = state.results.filter(channel => Boolean(channel.url)).length;
  const includesDirectory = WEB_MODE && !state.favoritesOnly && (state.directoryView || Boolean(state.search.trim()) || state.language !== 'all' || state.category === 'sports');
  els.result.textContent = state.privateOnly ? `${count} ${channelWord} from your file` : state.favoritesOnly ? `${count} saved ${channelWord}` : state.sportsWorldwide ? `${count} sports channels worldwide · ${directCount.toLocaleString()} with stream links` : includesDirectory ? `${count} ${channelWord} found · ${directCount.toLocaleString()} with stream links` : WEB_MODE && !state.search && state.category === 'all' && state.language === 'all' ? `${count} to try · ${state.channels.length.toLocaleString()} stream links indexed in ${countryName(state.country)}` : WEB_MODE ? `${count} matching streams · playback varies` : state.results.some(channel => channel.directoryOnly) ? `${count} ${channelWord} found · ${state.results.filter(channel => !channel.directoryOnly).length.toLocaleString()} to try here` : `${count} ${channelWord} ready to explore`;
  els.more.hidden = NATIVE_MODE || state.results.length <= shown;
  els.pager.hidden = !NATIVE_MODE;
  if (NATIVE_MODE) {
    els.pagePrev.disabled = nativePage === 0;
    els.pageNext.disabled = nativePage >= pageCount - 1;
    els.pageStatus.textContent = state.results.length ? `${first + 1}–${first + displayed.length} of ${count}` : '0 channels';
  }
  document.querySelector('.favorite-count').textContent = state.favorites.size || '';
  if (withMotion && !reduceMotion.matches) {
    const rows = [...els.list.querySelectorAll('.channel-row')].slice(0, 9);
    if (rows.length) animate(rows, { opacity: [0.6, 1], transform: ['translateY(9px)', 'translateY(0)'] }, { duration: 0.34, delay: stagger(0.025), ease: [0.16, 1, 0.3, 1] });
  }
}

function renderRail() {
  const favorites = [...state.favorites].map(id => findChannel(id)).filter(channel => channel && !channel.directoryOnly && (channel.url || !WEB_MODE));
  const recent = state.recent.map(id => state.channels.find(ch => ch.id === id)).filter(Boolean).slice(0, 5);
  const picks = ['BBC News', 'France 24', 'ABC News Live', 'Euronews English', 'Bloomberg TV']
    .map(name => state.channels.find(ch => ch.name === name)).filter(Boolean);
  const preferences = state.preferences;
  const tailored = preferences?.completed ? state.channels.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch) &&
    (preferences.country === 'all' || ch.country === preferences.country) &&
    (preferences.language === 'all' || ch.languages?.includes(preferences.language)) &&
    (!preferences.interests?.length || ch.categories.some(category => preferences.interests.includes(category)))
  ).sort((a, b) => (b.health_score || 0) - (a.health_score || 0)).slice(0, 5) : [];
  const channels = favorites.length ? [...favorites.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch)), ...tailored.filter(ch => !favorites.some(f => f.id === ch.id))].slice(0, 5) : tailored.length ? tailored : recent.length ? [...recent.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch)), ...picks.filter(ch => !recent.some(r => r.id === ch.id) && !isUnavailable(ch) && !failedBrowserCheck(ch))].slice(0, 5) : (picks.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch)).length ? picks.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch)) : state.channels.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch)).slice(0, 5));
  els.railTitle.textContent = favorites.length ? 'My channels' : tailored.length ? 'For you' : recent.length ? 'Recently tuned' : 'Start watching';
  els.railSubtitle.textContent = favorites.length ? 'The stations you keep close.' : tailored.length ? `Live picks for ${countryName(preferences.country)}.` : recent.length ? 'Jump back in or switch stations.' : 'Good places to begin.';
  els.rail.innerHTML = channels.map((ch, i) => `<button class="rail-card ${state.selected?.id === ch.id ? 'active' : ''}" data-id="${escapeHTML(ch.id)}" aria-label="Play ${escapeHTML(ch.name)}">
    <span class="rail-card-numeral">${String(i + 1).padStart(2, '0')}</span><span class="rail-card-sigil">${escapeHTML(ch.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase())}</span>
    <span class="rail-card-bottom"><span class="rail-card-logo">${ch.logo ? `<img src="${escapeHTML(ch.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : escapeHTML(ch.name.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHTML(ch.name)}</strong><small>${escapeHTML(countryName(ch.country))}</small></span>${glyph('arrow', 18)}</span>
  </button>`).join('');
}

function filterChannels(withMotion = false) {
  if (NATIVE_MODE) {
    const filterKey = [state.privateOnly, state.privateChannels.length, state.favoritesOnly, state.country, state.language, state.category, state.search, state.aiCategory].join('|');
    if (filterKey !== nativeFilterKey) { nativePage = 0; nativeFilterKey = filterKey; }
  }
  if (WEB_MODE) {
    els.quick.hidden = state.privateOnly || state.favoritesOnly;
    document.querySelector('.filter-area').hidden = state.privateOnly || state.favoritesOnly;
    document.querySelector('#guide-modes').hidden = state.privateOnly || state.favoritesOnly;
  }
  if (state.privateOnly) {
    const query = state.search.trim().toLocaleLowerCase();
    state.results = state.privateChannels.filter(ch => !query || ch.name.toLocaleLowerCase().includes(query));
    renderList(withMotion);
    els.stageCount.innerHTML = `<strong>${state.results.length.toLocaleString()}</strong><small>PRIVATE CHANNELS</small>`;
    return;
  }
  const discoverDirectory = !state.favoritesOnly && state.directory.length > 0 && (WEB_MODE && state.directoryView || Boolean(state.search.trim()) || state.language !== 'all' || state.category === 'sports');
  let pool = WEB_MODE && state.favoritesOnly ? state.favoriteChannels : state.favoritesOnly ? [...state.channels, ...state.directory] : state.sportsWorldwide ? [...state.sportsCatalog.channels, ...state.sportsCatalog.directory] : discoverDirectory ? [...state.channels, ...state.directory] : state.channels;
  if (state.favoritesOnly) pool = pool.filter(ch => state.favorites.has(ch.id));
  else if (!state.search.trim() && !state.directoryView) pool = pool.filter(ch => !isUnavailable(ch) && !failedBrowserCheck(ch));
  if (state.sportsWorldwide && state.sportsCountry !== 'all') pool = pool.filter(ch => ch.country === state.sportsCountry);
  else if (!state.sportsWorldwide && !(WEB_MODE && state.favoritesOnly) && state.country !== 'all') pool = pool.filter(ch => ch.country === state.country);
  if (!(WEB_MODE && state.favoritesOnly) && state.language !== 'all') pool = pool.filter(ch => ch.languages?.includes(state.language));
  if (state.category !== 'all') pool = pool.filter(ch => ch.categories.includes(state.category));
  state.results = rankChannels(pool, state.search, state.countries, state.sportsWorldwide ? webCatalogIndex.languages : state.languages, state.aiCategory);
  state.results.sort((a, b) => Number(isUnavailable(a) || failedBrowserCheck(a)) - Number(isUnavailable(b) || failedBrowserCheck(b)));
  if (WEB_MODE && state.directoryView && !state.search.trim()) state.results.sort((a, b) => a.name.localeCompare(b.name));
  if (WEB_MODE && !state.favoritesOnly && !state.search.trim() && state.category === 'all' && state.preferences?.interests?.length) {
    const preferred = new Set(state.preferences.interests);
    state.results.sort((a, b) => Number(b.categories.some(category => preferred.has(category))) - Number(a.categories.some(category => preferred.has(category))));
  }
  if (state.sportsWorldwide && !state.search.trim()) {
    const priorityLanguages = new Set(['tam', 'hin', 'mal', 'kan', 'eng']);
    state.results.sort((a, b) => Number(Boolean(b.url)) - Number(Boolean(a.url)) || Number(b.country === 'IN') - Number(a.country === 'IN') || Number(b.languages?.some(code => priorityLanguages.has(code))) - Number(a.languages?.some(code => priorityLanguages.has(code))) || a.name.localeCompare(b.name));
  }
  if (state.country === 'IN' && state.language === 'tam' && !state.search.trim() && state.category === 'all' && !state.sportsWorldwide) {
    state.results.sort((a, b) => Number(b.id === 'SunTV.in') - Number(a.id === 'SunTV.in'));
  }
  if (state.search && !state.results.length && state.aiCategory) {
    const parsed = parseQuery(state.search, state.countries, state.languages);
    state.results = pool.filter(ch => (!parsed.countryCode || ch.country === parsed.countryCode) && (!parsed.languageCode || ch.languages?.includes(parsed.languageCode)) && ch.categories.includes(state.aiCategory));
  }
  renderCategories(); renderList(withMotion);
  els.stageCount.innerHTML = `<strong>${state.results.length.toLocaleString()}</strong><small>${state.sportsWorldwide ? 'WORLD SPORTS' : state.favoritesOnly ? 'SAVED CHANNELS' : WEB_MODE && (state.directoryView || discoverDirectory) ? 'CHANNELS FOUND' : WEB_MODE ? 'CHANNELS TO TRY' : 'CHANNELS TO EXPLORE'}</small>`;
  const activeFilters = [state.sportsWorldwide ? state.sportsCountry !== 'all' : state.country !== 'all', state.language !== 'all', state.category !== 'all'].filter(Boolean).length;
  els.filterCount.textContent = activeFilters ? String(activeFilters) : '';
}

function clearError() { els.error.hidden = true; }
function showError(message, failedChannel = null) {
  clearTimeout(state.tuneTimer);
  if (failedChannel) rememberUnavailable(failedChannel);
  els.errorText.textContent = message;
  els.error.hidden = false;
  const alternative = failedChannel ? suggestAlternative(failedChannel) : null;
  alternativeButton.hidden = !alternative;
  alternativeButton.textContent = alternative ? `Try ${alternative.name} ↗` : '';
  alternativeButton.dataset.id = alternative?.id || '';
  els.tuneStatus.textContent = 'NO SIGNAL';
  els.tune.classList.add('failed');
  els.tap.hidden = true;
  if (!reduceMotion.matches) animate(els.error, { opacity: [0, 1], transform: ['translateY(-8px)', 'translateY(0)'] }, { duration: 0.3, ease: [0.16, 1, 0.3, 1] });
}
function handlePlayRejection(error, ch) {
  if (error?.name === 'NotAllowedError') {
    clearTimeout(state.tuneTimer);
    els.tap.hidden = false;
    els.tuneStatus.textContent = 'Press play to start this channel';
    return;
  }
  if (error?.name === 'AbortError') {
    showError('Playback was interrupted. Retry or choose another channel.');
    return;
  }
  showError(`This feed for ${ch.name} could not start.`, ch);
}

function startTune(ch, attempt) {
  clearTimeout(state.tuneTimer);
  const serial = state.playSerial;
  state.tuneTimer = setTimeout(() => {
    if (state.playSerial === serial && !els.shell.classList.contains('is-playing')) showError(WEB_MODE ? `No video arrived from ${ch.name}. The stream may be offline or block direct browser playback.` : `No video arrived from ${ch.name}.`, ch);
  }, ch.private ? 25000 : 15000);
  state.tuneAnimation?.stop?.();
  els.tune.hidden = false;
  els.tune.classList.remove('failed');
  els.tuneName.textContent = ch.name;
  els.tuneStatus.textContent = attempt ? `Trying another feed · ${attempt + 1}` : 'Finding a live feed…';
  els.tap.hidden = true;
  els.tune.style.opacity = '1';
  if (!reduceMotion.matches) state.tuneAnimation = animate(els.tune, { opacity: [0, 1], transform: ['translateX(-18px)', 'translateX(0)'] }, { duration: 0.42, ease: [0.16, 1, 0.3, 1] });
}

function finishTune() {
  clearTimeout(state.tuneTimer);
  if (els.tune.hidden) return;
  const serial = state.playSerial;
  if (reduceMotion.matches) { els.tune.hidden = true; return; }
  state.tuneAnimation?.stop?.();
  const animation = animate(els.tune, { opacity: [1, 0], transform: ['translateX(0)', 'translateX(18px)'] }, { duration: 0.3, ease: [0.55, 0, 1, 0.45] });
  animation.finished.then(() => { if (state.playSerial === serial) els.tune.hidden = true; }).catch(() => {});
  animate(els.video, { opacity: [0.45, 1] }, { duration: 0.45, ease: 'easeOut' });
}

function rememberChannel(id) {
  if (id.startsWith('private:')) return;
  state.recent = [id, ...state.recent.filter(item => item !== id)].slice(0, 12);
  localStorage.setItem('openwave-recent', JSON.stringify(state.recent));
  renderRail();
}

async function playChannel(id, attempt = 0, preferredLanguage = null) {
  const ch = findChannel(id);
  if (!ch) return;
  const serial = ++state.playSerial;
  if (preferredLanguage === null) preferredLanguage = state.language !== 'all' ? state.language : (parseQuery(state.search, state.countries, state.languages).languageCode || '');
  state.selected = ch;
  if (ch.private) state.sourceCount = 1;
  state.sourceAttempt = attempt;
  clearError(); startTune(ch, attempt);
  els.shell.classList.remove('is-playing');
  els.cover.hidden = true;
  els.video.classList.add('visible');
  els.title.textContent = ch.name;
  els.meta.textContent = attempt ? `Trying another feed · ${attempt + 1}` : channelMeta(ch);
  els.favorite.hidden = Boolean(ch.private); els.fullscreen.hidden = false;
  els.favorite.classList.toggle('is-favorite', state.favorites.has(id));
  els.favorite.setAttribute('aria-label', state.favorites.has(id) ? 'Remove from favorites' : 'Add to favorites');
  renderList(); rememberChannel(id);
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  els.video.pause(); els.video.removeAttribute('src'); els.video.load();
  try {
    let url, sources, sourceIndex;
    if (WEB_MODE) {
      const directURLs = webStreamURLs(ch);
      if (!directURLs.length) throw new Error('No HTTPS stream is available for direct browser playback.');
      sources = directURLs.length;
      sourceIndex = Math.min(attempt, sources - 1);
      url = directURLs[sourceIndex];
    } else {
      const response = ch.private
        ? await fetch('/api/private-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ch.url }) })
        : await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, attempt, language: preferredLanguage }) });
      if (!response.ok) throw new Error(response.status === 503 ? 'No working feed is available for this channel right now.' : ch.private ? 'This private stream could not be opened. Check its HLS URL.' : 'This channel could not be opened.');
      ({ url, sources, sourceIndex } = await response.json());
    }
    if (state.playSerial !== serial) return;
    state.sourceCount = sources;
    state.sourceAttempt = sourceIndex;
    els.tuneStatus.textContent = `Live feed found · ${sourceIndex + 1} of ${sources}`;
    const tryNext = () => {
      if (state.playSerial !== serial) return;
      if (sourceIndex + 1 < sources) playChannel(id, sourceIndex + 1, preferredLanguage);
      else showError(WEB_MODE ? `${ch.name} is not playing in this browser. The stream may be offline or its host may block direct playback.` : `No working feed for ${ch.name} right now.`, ch);
    };
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 15, liveSyncDurationCount: 3 });
      state.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(els.video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (state.playSerial !== serial) return;
        els.meta.textContent = `${channelMeta(ch)} · Feed ${sourceIndex + 1} of ${sources}`;
        els.video.play().catch(error => { if (state.playSerial === serial) handlePlayRejection(error, ch); });
      });
      let handled = false;
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && !handled) { handled = true; tryNext(); } });
    } else if (els.video.canPlayType('application/vnd.apple.mpegurl')) {
      els.video.src = url;
      els.video.play().catch(error => { if (state.playSerial === serial) handlePlayRejection(error, ch); });
    } else showError('This browser cannot play HLS video. Try current Chrome, Edge, Firefox, or Safari.');
  } catch (error) { if (state.playSerial === serial) showError(error.message || 'The channel could not be opened.', ch.private ? ch : WEB_MODE || responseFailureIsUnavailable(error) ? ch : null); }
}

function responseFailureIsUnavailable(error) { return error?.message === 'No working feed is available for this channel right now.'; }

els.video.addEventListener('playing', () => { clearError(); finishTune(); els.shell.classList.add('is-playing'); if (state.selected) clearUnavailable(state.selected); });
els.video.addEventListener('error', () => {
  if (!state.selected || state.hls) return;
  if (state.sourceAttempt + 1 < state.sourceCount) playChannel(state.selected.id, state.sourceAttempt + 1);
  else showError(WEB_MODE ? `${state.selected.name} cannot play here. Its host may block direct browser playback, or the stream may be offline.` : `No working feed for ${state.selected.name} right now.`, state.selected);
});
els.tap.addEventListener('click', () => els.video.play().catch(error => { if (state.selected) handlePlayRejection(error, state.selected); }));
alternativeButton.addEventListener('click', () => { if (alternativeButton.dataset.id) playChannel(alternativeButton.dataset.id); });

function jumpToGuide() {
  radioMode.hide();
  document.querySelector('#guide').scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' });
  els.search.focus({ preventScroll: true });
}
function setPrivateView(on) {
  state.privateOnly = on && state.privateChannels.length > 0;
  state.favoritesOnly = false;
  state.search = '';
  state.aiCategory = null;
  els.search.value = '';
  els.search.placeholder = state.privateOnly ? 'Find in your playlist' : 'Find a channel, mood, or place';
  els.quick.hidden = state.privateOnly;
  document.querySelector('.filter-area').hidden = state.privateOnly;
  privateEls.smart.hidden = WEB_MODE || state.privateOnly;
  els.ai.hidden = state.privateOnly;
  els.favoritesFilter.hidden = state.privateOnly;
  privateEls.title.textContent = state.privateOnly ? 'Your playlist' : 'Explore live';
  privateEls.view.hidden = !state.privateChannels.length;
  privateEls.clear.hidden = !state.privateChannels.length;
  privateEls.view.classList.toggle('active', state.privateOnly);
  privateEls.view.textContent = state.privateOnly ? 'Public guide' : `Your playlist · ${state.privateChannels.length}`;
  privateEls.import.querySelector('span').textContent = state.privateChannels.length ? 'Replace file' : 'Import M3U';
  privateEls.label.textContent = state.privateOnly ? 'YOUR CHANNELS' : 'CHANNELS';
  els.favoritesFilter.classList.remove('active');
  els.favoritesFilter.setAttribute('aria-pressed', 'false');
  setFiltersOpen(false);
  filterChannels(true);
}
function stopPrivatePlayback() {
  if (!state.selected?.private) return;
  ++state.playSerial;
  clearTimeout(state.tuneTimer);
  state.hls?.destroy();
  state.hls = null;
  els.video.pause();
  els.video.removeAttribute('src');
  els.video.load();
  els.video.classList.remove('visible');
  els.shell.classList.remove('is-playing');
  els.cover.hidden = false;
  els.tune.hidden = true;
  els.favorite.hidden = true;
  els.fullscreen.hidden = true;
  els.title.textContent = 'Pick your first channel';
  els.meta.textContent = 'The guide is ready when you are.';
  state.selected = null;
  clearError();
}
privateEls.import.addEventListener('click', () => privateEls.file.click());
privateEls.file.addEventListener('change', async () => {
  const file = privateEls.file.files?.[0];
  privateEls.file.value = '';
  if (!file) return;
  if (file.size > PRIVATE_PLAYLIST_MAX_BYTES) {
    privateEls.status.textContent = 'Choose an M3U file smaller than 1 MB.';
    return;
  }
  try {
    const { channels, skipped } = parsePrivatePlaylist(await file.text());
    const webChannels = WEB_MODE ? channels.filter(ch => webStreamURLs(ch).length) : channels;
    if (WEB_MODE && !webChannels.length) {
      privateEls.status.textContent = 'This web version needs HTTPS .m3u8 links. HTTP and other stream types cannot play here.';
      return;
    }
    stopPrivatePlayback();
    state.privateChannels = webChannels.map(ch => ({ ...ch, private: true }));
    const skippedTotal = skipped + channels.length - webChannels.length;
    privateEls.status.textContent = `${webChannels.length} channel${webChannels.length === 1 ? '' : 's'} loaded${skippedTotal ? ` · ${skippedTotal} unsupported stream${skippedTotal === 1 ? '' : 's'} skipped` : ''}. ${WEB_MODE ? 'HTTPS HLS playback depends on the stream host allowing browser access. ' : ''}Session only; reimport after reload.`;
    setPrivateView(true);
    jumpToGuide();
  } catch (error) {
    privateEls.status.textContent = error.message || 'Could not read this playlist. Choose an M3U file.';
  }
});
privateEls.view.addEventListener('click', () => {
  setPrivateView(!state.privateOnly);
  setNavActive('nav-guide');
});
privateEls.clear.addEventListener('click', () => {
  stopPrivatePlayback();
  state.privateChannels = [];
  privateEls.status.textContent = 'Private playlist removed from this tab.';
  setPrivateView(false);
  privateEls.import.focus();
});
function jumpToPlayer() {
  if (WEB_MODE) setNavActive('nav-home');
  els.shell.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'center' });
  els.shell.focus({ preventScroll: true });
}
document.querySelector('#cover-browse').addEventListener('click', () => { setNavActive('nav-guide'); jumpToGuide(); });
document.querySelector('#header-guide').addEventListener('click', () => { setNavActive('nav-guide'); jumpToGuide(); });
function setNavActive(id) {
  document.querySelectorAll('.top-nav button').forEach(button => button.classList.toggle('active', button.id === id));
  document.querySelectorAll('.mobile-tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.navTarget === id)));
}
document.querySelector('.mobile-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-nav-target]');
  if (button) document.getElementById(button.dataset.navTarget)?.click();
});
document.querySelector('#nav-home').addEventListener('click', () => { radioMode.hide(); setNavActive('nav-home'); window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'instant' : 'smooth' }); });
document.querySelector('#nav-guide').addEventListener('click', () => { setPrivateView(false); setNavActive('nav-guide'); jumpToGuide(); });
document.querySelector('#nav-favorites').addEventListener('click', () => { setPrivateView(false); state.favoritesOnly = true; if (WEB_MODE) { state.search = ''; els.search.value = ''; state.category = 'all'; state.directoryView = false; state.sportsWorldwide = false; updateGuideMode(); } els.favoritesFilter.classList.add('active'); els.favoritesFilter.setAttribute('aria-pressed', 'true'); setNavActive('nav-favorites'); filterChannels(true); if (WEB_MODE) loadFavoriteChannels(); jumpToGuide(); });
function showRadio() { els.video.pause(); setNavActive('nav-radio'); radioMode.show(); }
document.querySelector('#nav-radio').addEventListener('click', showRadio);
document.querySelector('#mobile-radio').addEventListener('click', showRadio);
document.querySelector('#quit-button').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/quit', { method: 'POST', headers: { 'X-OpenWave-Action': 'quit' } });
    if (!response.ok) throw new Error('Quit request failed');
    els.video.pause();
    els.result.textContent = 'OpenWave TV has closed. You can close this browser tab.';
  } catch { els.result.textContent = 'Could not close OpenWave TV. Try again.'; }
});
document.querySelector('#preferences-button').addEventListener('click', () => { if (state.countries.length) onboarding.show(state.countries, state.languages, state.preferences, onboardingOptions()); });
document.querySelector('#updates-button').addEventListener('click', () => {
  window.webkit?.messageHandlers?.openwaveUpdates?.postMessage('settings');
});
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); radioMode.hide(); setNavActive('nav-home'); window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'instant' : 'smooth' }); });
els.list.addEventListener('click', event => {
  const save = event.target.closest('[data-save-id]');
  if (save) { toggleFavorite(save.dataset.saveId, save); return; }
  const row = event.target.closest('[data-id]'); if (row) { jumpToPlayer(); playChannel(row.dataset.id); }
});
els.rail.addEventListener('click', event => { const card = event.target.closest('[data-id]'); if (card) { jumpToPlayer(); playChannel(card.dataset.id); } });
els.list.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...els.list.querySelectorAll('.row-main')];
  const index = rows.indexOf(document.activeElement);
  if (NATIVE_MODE && event.key === 'ArrowDown' && index === rows.length - 1 && !els.pageNext.disabled) {
    nativePage++; renderList(); els.list.querySelector('.row-main')?.focus(); event.preventDefault(); return;
  }
  if (NATIVE_MODE && event.key === 'ArrowUp' && index === 0 && !els.pagePrev.disabled) {
    nativePage--; renderList(); [...els.list.querySelectorAll('.row-main')].at(-1)?.focus(); event.preventDefault(); return;
  }
  rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  event.preventDefault();
});
async function activateWorldSports() {
  state.category = 'sports'; state.language = 'all'; state.sportsCountry = 'all'; state.directoryView = false;
  state.search = ''; state.aiCategory = null; els.search.value = ''; shown = 60;
  updateGuideMode();
  filterChannels(true);
  try {
    const sports = await webCatalog.sports();
    if (state.category !== 'sports' || state.privateOnly || state.favoritesOnly) return;
    state.sportsCatalog = sports;
    state.sportsWorldwide = true;
    filterChannels(true);
  } catch { els.result.textContent = 'Worldwide sports could not load. Showing India sports.'; }
}
els.quick.addEventListener('click', event => {
  const button = event.target.closest('[data-category]'); if (!button) return;
  if (WEB_MODE && button.dataset.category === 'sports') { activateWorldSports(); return; }
  if (!WEB_MODE && button.dataset.category === 'sports') {
    state.nativeSportsReturn ||= { country: state.country, language: state.language };
    state.country = 'all'; state.language = 'all';
  } else if (!WEB_MODE && state.nativeSportsReturn) {
    ({ country: state.country, language: state.language } = state.nativeSportsReturn);
    state.nativeSportsReturn = null;
  }
  state.sportsWorldwide = false;
  state.category = button.dataset.category;
  shown = 60; filterChannels(true);
});
function updateGuideMode() {
  if (!WEB_MODE) return;
  for (const [id, selected] of [['watch-mode', !state.directoryView], ['directory-mode', state.directoryView]]) {
    const button = document.querySelector(`#${id}`);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  document.querySelector('#directory-total').textContent = webCatalogIndex?.countries.find(country => country.code === state.country)?.directory_count?.toLocaleString() || '';
}
function setDirectoryView(on) {
  if (!WEB_MODE || (state.directoryView === on && !state.sportsWorldwide)) return;
  state.directoryView = on;
  state.sportsWorldwide = false;
  state.favoritesOnly = false;
  state.search = '';
  state.category = 'all';
  state.aiCategory = null;
  els.search.value = '';
  els.favoritesFilter.classList.remove('active');
  els.favoritesFilter.setAttribute('aria-pressed', 'false');
  shown = 60;
  updateGuideMode();
  filterChannels(true);
}
document.querySelector('#watch-mode').addEventListener('click', () => setDirectoryView(false));
document.querySelector('#directory-mode').addEventListener('click', () => setDirectoryView(true));
function setFiltersOpen(open) {
  els.advanced.hidden = !open;
  els.filterToggle.setAttribute('aria-expanded', String(open));
  els.filterToggle.classList.toggle('open', open);
  if (open && !reduceMotion.matches) animate(els.advanced, { opacity: [0, 1], transform: ['translateY(-8px)', 'translateY(0)'] }, { duration: 0.25, ease: [0.16, 1, 0.3, 1] });
}
els.filterToggle.addEventListener('click', () => setFiltersOpen(els.advanced.hidden));
document.addEventListener('click', event => { if (!els.advanced.hidden && !activePicker && !event.target.closest('.filter-area') && !event.target.closest('#filter-picker')) setFiltersOpen(false); });
let activePicker = null;
let pickerInertNodes = [];
const pickerTriggers = { country: els.countryTrigger, language: els.languageTrigger, category: els.categoryTrigger };
function setPickerBackgroundInert(inert) {
  if (!inert) { for (const [node, wasInert] of pickerInertNodes) node.inert = wasInert; pickerInertNodes = []; return; }
  for (let current = els.picker; current.parentElement && current !== document.body; current = current.parentElement) {
    for (const sibling of current.parentElement.children) {
      if (sibling !== current && sibling instanceof HTMLElement) {
        pickerInertNodes.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    }
  }
}
function pickerOptions() {
  if (activePicker === 'country') return [...(state.sportsWorldwide || !WEB_MODE ? [{ value: 'all', label: state.sportsWorldwide ? 'Worldwide sports' : 'Everywhere' }] : []), ...state.countries.map(c => ({ value: c.code, label: WEB_MODE && !state.sportsWorldwide ? `${c.name} · ${c.count ? `${c.count.toLocaleString()} stream links` : `${c.directory_count.toLocaleString()} in directory`}` : c.name }))];
  if (activePicker === 'language') return [{ value: 'all', label: 'Any language' }, ...(state.sportsWorldwide ? webCatalogIndex.languages : state.languages).map(l => ({ value: l.code, label: l.name }))];
  const categoryPool = WEB_MODE && state.directoryView ? [...state.channels, ...state.directory] : state.channels;
  return (WEB_MODE ? categories.filter(c => c === 'all' || categoryPool.some(ch => ch.categories.includes(c))) : categories).map(c => ({ value: c, label: c === 'all' ? 'All categories' : titleCase(c) }));
}
function renderPickerOptions() {
  const query = els.pickerSearch.value.trim().toLowerCase();
  const items = pickerOptions().filter(item => item.label.toLowerCase().includes(query));
  const selectedValue = state.sportsWorldwide && activePicker === 'country' ? state.sportsCountry : state[activePicker];
  els.pickerList.innerHTML = items.length ? items.map((item, index) => `<button class="picker-option ${selectedValue === item.value ? 'selected' : ''}" aria-pressed="${selectedValue === item.value}" tabindex="${index === 0 ? 0 : -1}" data-pick-value="${escapeHTML(item.value)}"><span>${escapeHTML(item.label)}</span><span class="picker-check" aria-hidden="true">${selectedValue === item.value ? '✓' : ''}</span></button>`).join('') : '<p class="picker-empty">No matching options</p>';
  els.pickerList.scrollTop = 0;
}
function openPicker(kind) {
  activePicker = kind;
  pickerTriggers[kind].setAttribute('aria-expanded', 'true');
  els.pickerTitle.textContent = kind === 'country' ? 'Choose country' : kind === 'language' ? 'Choose language' : 'Choose category';
  els.pickerList.setAttribute('aria-label', kind === 'country' ? 'Country options' : kind === 'language' ? 'Language options' : 'Category options');
  els.pickerSearch.setAttribute('aria-label', kind === 'country' ? 'Search countries' : kind === 'language' ? 'Search languages' : 'Search categories');
  els.pickerSearch.placeholder = kind === 'country' ? 'Search countries' : kind === 'language' ? 'Search languages' : 'Search categories';
  els.pickerSearch.value = '';
  els.picker.hidden = false;
  renderPickerOptions();
  setPickerBackgroundInert(true);
  els.pickerSearch.focus();
  if (!reduceMotion.matches) animate(els.picker, { opacity: [0, 1], transform: ['translateX(14px)', 'translateX(0)'] }, { duration: 0.26, ease: [0.16, 1, 0.3, 1] });
}
function closePicker(focusTrigger = true) {
  const trigger = pickerTriggers[activePicker];
  trigger?.setAttribute('aria-expanded', 'false');
  els.picker.hidden = true;
  setPickerBackgroundInert(false);
  activePicker = null;
  if (focusTrigger) trigger?.focus();
}
Object.entries(pickerTriggers).forEach(([kind, button]) => button.addEventListener('click', () => openPicker(kind)));
document.querySelector('#picker-back').addEventListener('click', () => closePicker());
els.picker.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closePicker(); event.preventDefault(); event.stopPropagation(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...els.picker.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(node => node.tabIndex >= 0 && node.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
  else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
});
document.addEventListener('focusin', event => { if (activePicker && !els.picker.contains(event.target)) els.pickerSearch.focus(); });
els.pickerSearch.addEventListener('input', renderPickerOptions);
els.pickerSearch.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { els.pickerList.querySelector('.picker-option')?.focus(); event.preventDefault(); }
  if (event.key === 'Enter') { els.pickerList.querySelector('.picker-option')?.click(); event.preventDefault(); }
});
els.pickerList.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const options = [...els.pickerList.querySelectorAll('.picker-option')];
  const index = options.indexOf(document.activeElement);
  const next = options[Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
  if (next) { document.activeElement.tabIndex = -1; next.tabIndex = 0; next.focus(); }
  event.preventDefault();
});
els.pickerList.addEventListener('click', event => {
  const option = event.target.closest('[data-pick-value]'); if (!option || !activePicker) return;
  const kind = activePicker;
  const value = option.dataset.pickValue;
  closePicker(false);
  setFiltersOpen(false);
  els.filterToggle.focus();
  if (WEB_MODE && kind === 'country' && state.sportsWorldwide) { state.sportsCountry = value; shown = 60; filterChannels(true); return; }
  if (WEB_MODE && kind === 'country') { activateWebCountry(value); return; }
  if (WEB_MODE && kind === 'category' && value === 'sports') { activateWorldSports(); return; }
  if (WEB_MODE && kind === 'category') state.sportsWorldwide = false;
  if (!WEB_MODE && kind === 'category' && value === 'sports') {
    state.nativeSportsReturn ||= { country: state.country, language: state.language };
    state.country = 'all'; state.language = 'all';
  } else if (!WEB_MODE && kind === 'category' && state.nativeSportsReturn) {
    ({ country: state.country, language: state.language } = state.nativeSportsReturn);
    state.nativeSportsReturn = null;
  } else if (!WEB_MODE && (kind === 'country' || kind === 'language')) state.nativeSportsReturn = null;
  state[kind] = value;
  shown = 60;
  filterChannels(true);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (activePicker) closePicker();
  else if (!els.advanced.hidden) { setFiltersOpen(false); els.filterToggle.focus(); }
});
els.more.addEventListener('click', () => { shown += 60; renderList(true); });
els.pagePrev.addEventListener('click', () => { if (nativePage > 0) { nativePage--; renderList(); els.pagePrev.focus(); } });
els.pageNext.addEventListener('click', () => { if (!els.pageNext.disabled) { nativePage++; renderList(); els.pageNext.focus(); } });
if (!WEB_MODE) new ResizeObserver(() => {
  if (!NATIVE_MODE) return;
  const size = Math.max(1, Math.floor(els.list.clientHeight / 56));
  if (size !== nativePageSize) { nativePageSize = size; renderList(); }
}).observe(els.list);
desktopViewport.addEventListener('change', () => {
  if (WEB_MODE || nativeShell) return;
  NATIVE_MODE = desktopViewport.matches;
  document.documentElement.classList.toggle('openwave-native', NATIVE_MODE);
  nativePage = 0;
  renderList();
  radioMode.refreshLayout();
});
els.search.addEventListener('input', event => {
  state.search = event.target.value; state.aiCategory = null; state.searchSerial++; shown = 60;
  els.ai.textContent = WEB_MODE ? 'Search channels by name, language, place, or category.' : 'Smart search uses MiniLM on this device. First use downloads the model.';
  clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => filterChannels(true), 90);
});
document.querySelector('#search-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.privateOnly) { filterChannels(true); return; }
  const query = state.search.trim(); if (!query) { els.search.focus(); return; }
  clearTimeout(state.filterTimer);
  if (WEB_MODE) { state.aiCategory = null; filterChannels(true); return; }
  const serial = ++state.searchSerial;
  const parsed = parseQuery(query, state.countries, state.languages);
  if (parsed.category || ((parsed.countryCode || parsed.languageCode) && parsed.terms.length === 0) || query.split(/\s+/).length < 2) {
    state.aiCategory = null; filterChannels(true);
    els.ai.textContent = parsed.category || parsed.countryCode || parsed.languageCode ? 'Matched your channel, place, or language terms.' : 'Try a phrase such as “relaxing nature shows” for AI search.';
    return;
  }
  els.ai.textContent = 'MiniLM is understanding your search on this device…';
  try {
    const category = await inferCategory(query);
    if (serial !== state.searchSerial) return;
    state.aiCategory = category; filterChannels(true);
    els.ai.textContent = category ? `Matched ${category}. Results stay on this device.` : 'Try a broader phrase or a channel name.';
  } catch { if (serial === state.searchSerial) els.ai.textContent = 'Smart search unavailable. Name, country, and category search still work.'; }
});
els.favoritesFilter.addEventListener('click', () => {
  if (state.privateOnly) setPrivateView(false);
  state.favoritesOnly = !state.favoritesOnly;
  if (WEB_MODE && state.favoritesOnly) { state.search = ''; els.search.value = ''; state.category = 'all'; state.directoryView = false; state.sportsWorldwide = false; updateGuideMode(); }
  els.favoritesFilter.classList.toggle('active', state.favoritesOnly);
  els.favoritesFilter.setAttribute('aria-pressed', String(state.favoritesOnly));
  setNavActive(state.favoritesOnly ? 'nav-favorites' : 'nav-guide');
  filterChannels(true);
  if (WEB_MODE && state.favoritesOnly) loadFavoriteChannels();
});
async function loadFavoriteChannels() {
  const ids = [...state.favorites];
  const codes = [...new Set(ids.map(id => state.favoriteCountries[id] || (id.startsWith('in-') ? 'IN' : state.country)))]
    .filter(code => webCatalogIndex?.countries.some(country => country.code === code));
  const results = await Promise.allSettled(codes.map(code => webCatalog.country(code)));
  const channels = results.flatMap(result => result.status === 'fulfilled' ? [...result.value.channels, ...result.value.directory] : []);
  state.favoriteChannels = channels.filter(channel => state.favorites.has(channel.id));
  if (state.favoritesOnly) filterChannels(true);
  renderRail();
}
function toggleFavorite(id, sourceButton = null) {
  if (id.startsWith('private:')) return;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    delete state.favoriteCountries[id];
    state.favoriteChannels = state.favoriteChannels.filter(channel => channel.id !== id);
  } else {
    state.favorites.add(id);
    const channel = findChannel(id);
    state.favoriteCountries[id] = channel?.country || state.country;
    if (channel && !state.favoriteChannels.some(item => item.id === id)) state.favoriteChannels.push(channel);
  }
  localStorage.setItem('openwave-favorites', JSON.stringify([...state.favorites]));
  if (WEB_MODE) localStorage.setItem('openwave-favorite-countries', JSON.stringify(state.favoriteCountries));
  if (state.selected?.id === id) {
    els.favorite.classList.toggle('is-favorite', state.favorites.has(id));
    els.favorite.setAttribute('aria-label', state.favorites.has(id) ? 'Remove from favorites' : 'Add to favorites');
  }
  if (!reduceMotion.matches && sourceButton) animate(sourceButton, { transform: ['scale(0.78)', 'scale(1)'] }, { duration: 0.35, type: 'spring', bounce: 0.2 });
  const scrollTop = els.list.scrollTop;
  filterChannels();
  els.list.scrollTop = scrollTop;
  renderRail();
}
els.favorite.addEventListener('click', () => { if (state.selected) toggleFavorite(state.selected.id, els.favorite); });
const exitFullscreenButton = document.querySelector('#exit-player-fullscreen');
function syncFullscreenButton(active) {
  exitFullscreenButton.hidden = !active;
  els.fullscreen.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  els.fullscreen.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
}
async function togglePlayerFullscreen() {
  if (NATIVE_MODE && window.webkit?.messageHandlers?.openwaveFullscreen) {
    window.webkit.messageHandlers.openwaveFullscreen.postMessage('toggle');
    return;
  }
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (document.documentElement.classList.contains('browser-theater')) {
    document.documentElement.classList.remove('browser-theater'); syncFullscreenButton(false); return;
  }
  try {
    if (!els.shell.requestFullscreen) throw new Error('Fullscreen unavailable');
    await els.shell.requestFullscreen();
  } catch {
    document.documentElement.classList.add('browser-theater');
    syncFullscreenButton(true);
  }
}
els.fullscreen.addEventListener('click', togglePlayerFullscreen);
exitFullscreenButton.addEventListener('click', togglePlayerFullscreen);
document.addEventListener('fullscreenchange', () => syncFullscreenButton(Boolean(document.fullscreenElement)));
window.addEventListener('openwave-native-fullscreenchange', () => syncFullscreenButton(document.documentElement.classList.contains('native-theater')));
document.querySelector('#retry-button').addEventListener('click', () => { if (state.selected) playChannel(state.selected.id); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.documentElement.classList.contains('browser-theater')) {
    document.documentElement.classList.remove('browser-theater'); syncFullscreenButton(false); event.preventDefault(); return;
  }
  if (event.target.closest('input, select, button, textarea')) return;
  if (event.key === '/') { event.preventDefault(); jumpToGuide(); }
});

async function activateWebCountry(code, { loading = true } = {}) {
  const ticket = ++webCountryLoad;
  const country = webCatalogIndex?.countries.find(item => item.code === code);
  if (!country) return;
  state.sportsWorldwide = false;
  if (loading) {
    els.result.textContent = `Loading ${country.name} channels…`;
    els.list.innerHTML = `<div class="empty-list"><strong>Finding ${escapeHTML(country.name)} channels</strong><p>Loading this country's guide.</p></div>`;
    els.more.hidden = true;
  }
  try {
    const catalog = await webCatalog.country(code);
    if (ticket !== webCountryLoad) return;
    state.channels = catalog.channels.filter(channel => webStreamURLs(channel).length);
    state.directory = catalog.directory;
    state.country = code;
    const countryLanguages = new Set(country.languages || []);
    state.languages = (webCatalogIndex.languages || []).filter(language => countryLanguages.has(language.code));
    if (state.language !== 'all' && !countryLanguages.has(state.language)) state.language = 'all';
    state.category = 'all';
    state.search = '';
    els.search.value = '';
    state.aiCategory = null;
    state.favoritesOnly = false;
    els.favoritesFilter.classList.remove('active');
    els.favoritesFilter.setAttribute('aria-pressed', 'false');
    shown = 60;
    document.querySelector('.cover-content p').textContent = `${country.name} channels are indexed here. Pick one to try its direct stream.`;
    if (state.preferences?.completed && state.preferences.country !== code) {
      state.preferences = { ...state.preferences, country: code, language: state.language };
      localStorage.setItem('openwave-preferences', JSON.stringify(state.preferences));
      radioMode.applyPreferences(state.preferences);
    }
    updateGuideMode(); renderRail(); filterChannels(true);
  } catch {
    if (ticket !== webCountryLoad) return;
    els.result.textContent = `${country.name} guide could not load`;
    els.list.innerHTML = `<div class="empty-list">${glyph('refresh', 24)}<strong>Guide unavailable</strong><p>Check your connection, then choose ${escapeHTML(country.name)} again.</p></div>`;
  }
}

async function loadGuide() {
  try {
    if (WEB_MODE) {
      webCatalogIndex = await webCatalog.index();
      state.countries = webCatalogIndex.countries;
      state.preferences = readStore('openwave-preferences', null);
      const wanted = state.preferences?.completed && state.countries.some(country => country.code === state.preferences.country) ? state.preferences.country : 'IN';
      state.language = state.preferences?.completed ? state.preferences.language || 'all' : 'all';
      await activateWebCountry(wanted, { loading: false });
      if (state.preferences?.completed) radioMode.applyPreferences(state.preferences);
      if (!state.preferences?.completed) onboarding.show(state.countries, state.languages, null, onboardingOptions());
      return;
    }
    const response = await fetch('/api/channels');
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    state.channels = data.channels;
    try {
      const india = await webCatalog.country('IN');
      const directIds = new Set(state.channels.map(channel => channel.id));
      state.directory = india.directory.filter(channel => !directIds.has(channel.id)).map(channel => ({ ...channel, directoryOnly: true }));
    } catch { state.directory = []; }
    state.countries = data.countries.sort((a, b) => a.name.localeCompare(b.name));
    state.languages = data.languages || [];
    state.preferences = readStore('openwave-preferences', null);
    if (state.preferences?.completed) {
      state.country = state.preferences.country || 'all';
      state.language = state.preferences.language || 'all';
      radioMode.applyPreferences(state.preferences);
    }
    renderRail(); filterChannels(true);
    if (!state.preferences?.completed) onboarding.show(state.countries, state.languages, null, onboardingOptions());
  } catch {
    els.result.textContent = 'The guide could not load';
    els.stageCount.textContent = 'Guide unavailable';
    els.list.innerHTML = `<div class="empty-list">${glyph('refresh', 24)}<strong>Guide unavailable</strong><p>Check your internet connection, then reload this page.</p></div>`;
  }
}
renderCategories(); loadGuide();
if (!reduceMotion.matches) {
  animate('.topbar', { opacity: [0, 1] }, { duration: 0.5, ease: 'easeOut' });
  animate('.stage-heading h1, .player-shell, .guide', { opacity: [0.75, 1], transform: ['translateY(12px)', 'translateY(0)'] }, { duration: 0.65, delay: stagger(0.08), ease: [0.16, 1, 0.3, 1] });
}
