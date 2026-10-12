import { animate } from 'motion';

const interests = [
  ['news', 'News'], ['sports', 'Sports'], ['movies', 'Movies'], ['music', 'Music'],
  ['kids', 'Kids'], ['documentary', 'Documentaries'], ['entertainment', 'Entertainment'],
  ['education', 'Learning'], ['business', 'Business'], ['culture', 'Culture'],
  ['general', 'Local TV'], ['religious', 'Faith']
];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);

export function createOnboarding(onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" tabindex="-1">
      <div class="onboarding-art"><div class="onboarding-grid"></div><span class="onboarding-brand">OPENWAVE</span><strong>TV THAT<br>FEELS LIKE<br>YOURS.</strong><span class="onboarding-art-footer">A WORLD OF LIVE CHANNELS</span></div>
      <div class="onboarding-form"><div class="onboarding-top"><span id="onboarding-step-label">01 / 02</span><button id="onboarding-close" aria-label="Close preferences" hidden>Close ×</button></div>
        <section id="onboarding-place"><h2 id="onboarding-title">Make it local.</h2><p>Choose where you watch and the language you prefer. You can change these later.</p>
          <div class="onboarding-field"><label for="onboarding-country">Country</label><input id="onboarding-country" type="search" autocomplete="off" placeholder="Search countries" required aria-describedby="onboarding-help"><div id="onboarding-country-list" class="onboarding-options" hidden></div></div>
          <div class="onboarding-field"><label for="onboarding-language">Primary language</label><input id="onboarding-language" type="search" autocomplete="off" placeholder="Search languages" required aria-describedby="onboarding-help"><div id="onboarding-language-list" class="onboarding-options" hidden></div></div>
          <p id="onboarding-help" class="onboarding-help">Choose both to continue.</p><button id="onboarding-next" class="onboarding-primary" disabled>Continue <span>→</span></button>
        </section>
        <section id="onboarding-interests" hidden><h2 id="onboarding-interests-title">What feels like you?</h2><p>Pick a few interests. We’ll use them to shape your first row of channels.</p><div id="onboarding-chips" class="onboarding-chips"></div>
          <div class="onboarding-bottom"><button id="onboarding-back" class="onboarding-secondary">← Back</button><button id="onboarding-finish" class="onboarding-primary">Start watching <span>→</span></button></div>
        </section>
        <p class="onboarding-privacy">Your preferences are saved in this browser.</p>
      </div>
    </div>`;
  document.querySelector('.app-shell').append(overlay);
  const el = {
    stepLabel: overlay.querySelector('#onboarding-step-label'), place: overlay.querySelector('#onboarding-place'), interests: overlay.querySelector('#onboarding-interests'),
    country: overlay.querySelector('#onboarding-country'), countryList: overlay.querySelector('#onboarding-country-list'),
    language: overlay.querySelector('#onboarding-language'), languageList: overlay.querySelector('#onboarding-language-list'),
    chips: overlay.querySelector('#onboarding-chips')
  };
  let countries = [], languages = [], draft = { country: null, language: null, interests: new Set() };
  let step = 1;
  let skipInterests = false;
  let interestOptions = interests;
  let returnFocus = null;
  let canClose = false;
  let includeEverywhere = true;
  let countryLanguages = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function chooseList(kind, value) {
    draft[kind] = value;
    if (kind === 'country' && value && countryLanguages) {
      languages = countryLanguages(value);
      if (draft.language && draft.language !== 'all' && !languages.some(item => item.code === draft.language)) {
        draft.language = null;
        el.language.value = '';
      }
    }
    const option = (kind === 'country' ? [...(includeEverywhere ? [{code:'all',name:'Everywhere'}] : []), ...countries] : [{code:'all',name:'Any language'}, ...languages]).find(item => item.code === value);
    el[kind].value = option?.name || '';
    el[`${kind}List`].hidden = true;
    updateContinue();
  }
  function updateContinue() {
    overlay.querySelector('#onboarding-next').disabled = !draft.country || !draft.language;
    overlay.querySelector('#onboarding-help').textContent = draft.country && draft.language ? (skipInterests ? 'Your channels are ready.' : 'Your channels are ready to personalize.') : 'Choose both to continue.';
  }
  function renderOptions(kind) {
    const input = el[kind], list = el[`${kind}List`];
    const source = kind === 'country' ? [...(includeEverywhere ? [{code:'all',name:'Everywhere'}] : []), ...countries] : [{code:'all',name:'Any language'}, ...languages];
    const query = input.value.trim().toLowerCase();
    const matches = source.filter(item => item.name.toLowerCase().includes(query)).slice(0, 9);
    list.innerHTML = matches.map(item => `<button type="button" data-onboarding-${kind}="${escapeHTML(item.code)}">${escapeHTML(item.name)}</button>`).join('') || '<span class="onboarding-no-options">No match</span>';
    list.hidden = false;
  }
  function renderChips() {
    el.chips.innerHTML = interestOptions.map(([id, label]) => `<button type="button" class="${draft.interests.has(id) ? 'selected' : ''}" data-onboarding-interest="${id}" aria-pressed="${draft.interests.has(id)}">${label}</button>`).join('');
  }
  function showStep(number) {
    step = number;
    overlay.querySelector('.onboarding-card').setAttribute('aria-labelledby', number === 1 ? 'onboarding-title' : 'onboarding-interests-title');
    el.place.hidden = number !== 1;
    el.interests.hidden = number !== 2;
    el.stepLabel.textContent = number === 1 ? (skipInterests ? '01 / 01' : '01 / 02') : '02 / 02';
    if (number === 2) renderChips();
    if (!reduceMotion.matches) animate(number === 1 ? el.place : el.interests, { opacity: [0.4, 1], transform: ['translateY(12px)', 'translateY(0)'] }, { duration: .3, ease: [.16, 1, .3, 1] });
  }
  function close() {
    if (!canClose) return;
    overlay.hidden = true;
    document.body.classList.remove('onboarding-open');
    returnFocus?.focus();
  }
  function finish() {
    if (!draft.country || !draft.language) return;
    const preferences = { completed:true, country:draft.country, language:draft.language, interests:[...draft.interests] };
    localStorage.setItem('openwave-preferences', JSON.stringify(preferences));
    overlay.hidden = true;
    document.body.classList.remove('onboarding-open');
    onComplete(preferences);
    returnFocus?.focus();
  }
  function show(countryOptions, languageOptions, current, options = {}) {
    returnFocus = document.activeElement;
    canClose = Boolean(current?.completed);
    includeEverywhere = options.includeEverywhere !== false;
    countryLanguages = typeof options.countryLanguages === 'function' ? options.countryLanguages : null;
    interestOptions = Array.isArray(options.availableInterests) ? interests.filter(([id]) => options.availableInterests.includes(id)) : interests;
    skipInterests = options.skipInterests ?? (interestOptions.length <= 1);
    countries = countryOptions;
    languages = languageOptions;
    draft = { country: current?.country || null, language: current?.language || null, interests: new Set(skipInterests ? [] : (current?.interests || []).filter(id => interestOptions.some(([option]) => option === id))) };
    overlay.querySelector('#onboarding-next').innerHTML = `${skipInterests ? 'Start watching' : 'Continue'} <span>→</span>`;
    chooseList('country', draft.country);
    chooseList('language', draft.language);
    el.country.value = draft.country ? el.country.value : '';
    el.language.value = draft.language ? el.language.value : '';
    overlay.querySelector('#onboarding-close').hidden = !canClose;
    showStep(1);
    overlay.hidden = false;
    document.body.classList.add('onboarding-open');
    overlay.querySelector('.onboarding-card').focus();
    if (!reduceMotion.matches) animate(overlay.querySelector('.onboarding-card'), { opacity:[0,1], transform:['translateY(18px) scale(.98)','translateY(0) scale(1)'] }, { duration:.4, ease:[.16,1,.3,1] });
  }

  for (const kind of ['country','language']) {
    el[kind].addEventListener('input', () => { draft[kind] = null; updateContinue(); renderOptions(kind); });
    el[kind].addEventListener('focus', () => { el[kind].select(); renderOptions(kind); });
    el[kind].addEventListener('keydown', event => {
      if (event.key === 'Enter') { el[`${kind}List`].querySelector('button')?.click(); event.preventDefault(); }
      if (event.key === 'Escape' && !el[`${kind}List`].hidden) { el[`${kind}List`].hidden = true; event.preventDefault(); event.stopPropagation(); }
    });
    el[`${kind}List`].addEventListener('click', event => { const button = event.target.closest(`[data-onboarding-${kind}]`); if (button) chooseList(kind, button.dataset[`onboarding${kind[0].toUpperCase()+kind.slice(1)}`]); });
  }
  overlay.querySelector('#onboarding-next').addEventListener('click', () => { if (!draft.country || !draft.language) return; el.countryList.hidden = true; el.languageList.hidden = true; if (skipInterests) finish(); else showStep(2); });
  overlay.querySelector('#onboarding-back').addEventListener('click', () => showStep(1));
  overlay.querySelector('#onboarding-finish').addEventListener('click', () => finish());
  overlay.querySelector('#onboarding-close').addEventListener('click', close);
  el.chips.addEventListener('click', event => { const button = event.target.closest('[data-onboarding-interest]'); if (!button) return; const id = button.dataset.onboardingInterest; if (draft.interests.has(id)) draft.interests.delete(id); else draft.interests.add(id); renderChips(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!el.countryList.hidden) el.countryList.hidden = true;
      else if (!el.languageList.hidden) el.languageList.hidden = true;
      else close();
      event.preventDefault();
    }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not([disabled]):not([hidden]), input:not([hidden])')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay.querySelector('.onboarding-card'))) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
    }
  });
  return { show };
}
