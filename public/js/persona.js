/**
 * FirePath — Persona Engine
 * ==========================
 * The single home for the knowledge persona (beginner / building / fire): what each
 * one is called, the words each one sees, which one this person picked, and the
 * picker UI for choosing. Any page can read it, change it, or adapt to it.
 *
 * Previously the persona cards, the copy tables and the save logic each lived inside
 * firepath.html and firepath_pro.html separately (and had already drifted), and other
 * pages read the persona from three different places. This is now the one source.
 *
 * Load it in <head>, before the page's own scripts, so the page never paints in the
 * wrong persona:
 *   <script src="js/persona.js"></script>
 *
 * ── Adapting a page without writing JS ──
 *   <div data-persona-show="beginner">Only beginners see this</div>
 *   <div data-persona-show="building fire">Hidden from beginners</div>
 *   <div data-persona-hide="fire">Everyone except fire sees this</div>
 *   <span data-term="freedomNumberLabel">Freedom number</span>        ← word from PERSONAS[x].copy
 *   <p data-copy-beginner="Plain version" data-copy-fire="Terse version">Default version</p>
 *   <div data-persona-picker></div>                                   ← renders the cards inline
 *   <button data-persona-open>Change how FirePath talks to me</button> ← opens the picker modal
 *   <span data-persona-name></span>                                   ← "Building towards it"
 *   <div class="fp-why" data-persona-show="beginner">…</div>          ← "Why this matters" box
 *   <div class="fp-consider" data-persona-show="beginner">…</div>     ← "Have you considered…" box
 *   <div class="fp-tldr" data-persona-show="fire">…</div>             ← one-line summary for experts
 *   <div data-tool-list><a data-tool="withdrawal">…</a></div>         ← see TOOLS below
 *   CSS: html[data-persona="fire"] .whatever { ... }
 *
 * ── Writing for each persona ──
 *   beginner  plain words, no abbreviations; say why a number matters; ask "have you
 *             considered…" to surface things they might not know to think about.
 *   building  the real terms, each explained once; focus on the levers that move the date.
 *   fire      FIRE shorthand (FI, SWR, CCs, SoRR), short and dense, no hand-holding.
 *
 * ── From JS ──
 *   FirePathPersona.get()            → 'beginner' | 'building' | 'fire'
 *   FirePathPersona.copy('coastTerm')→ the word for the current persona
 *   FirePathPersona.set('fire')      → saves locally + to users.persona, re-applies the page
 *   FirePathPersona.onChange(fn)     → fn(newId) whenever it changes (any source)
 *
 * Source of truth: users.persona in the DB, mirrored to localStorage 'fp_persona' so
 * pages can apply it instantly. fp_profiles.persona is legacy — read only as a fallback.
 */

window.FirePathPersona = (function () {

  const STORAGE_KEY = 'fp_persona';
  const DEFAULT_ID = 'building';
  const CHANGE_EVENT = 'fp:persona-change';
  const API_URL = 'https://firepath-api.jwa7990.workers.dev';

  const ORDER = ['beginner', 'building', 'fire'];

  const PERSONAS = {
    beginner: {
      id: 'beginner',
      name: 'Just getting started',
      desc: "I've heard about financial freedom but don't really know where to begin",
      icon: '<path d="M12 21v-8"/><path d="M12 13c-4.5 0-7-3-7-7 4.5 0 7 3 7 7z"/><path d="M12 13c4.5 0 7-3 7-7-4.5 0-7 3-7 7z"/>',
      aiTone: 'warm, simple, human',
      copy: {
        // Results vocabulary
        coastTerm: 'ease off saving',
        freedomTerm: 'fully free',
        freedomAgeLabel: 'Freedom Age',
        freedomNumberLabel: 'Freedom number',
        freedomShort: 'freedom',
        // Onboarding form
        obEyebrow: 'Just getting started',
        obSub: "No judgement here. Just share what you know and we'll do the rest.",
        incomeLabel: 'Money coming in (after tax)',
        savingsLabel: 'Current savings & investments',
        savingsRateLabel: 'How much do you put aside each cycle?',
        contextHint: "e.g. I'm saving for a house, I have kids, my income varies",
        // Glossary — the same idea in each persona's words
        fireTerm: 'financial independence',
        swrTerm: 'safe withdrawal rate',
        concessionalTerm: 'before-tax super contributions',
        preservationTerm: 'the age you can access super',
        indexFundTerm: 'a fund that buys a bit of everything',
        // Welcome page
        levelPromise: "Plain English, no jargon. We'll explain why each number matters and point out things worth thinking about."
      }
    },
    building: {
      id: 'building',
      name: 'Building towards it',
      desc: "I know the basics and I'm working on a plan — I just want to see the numbers clearly",
      icon: '<path d="M4 17l5-5 4 4 7-8"/><path d="M16 8h4v4"/>',
      aiTone: 'clear, motivating, practical',
      copy: {
        coastTerm: 'Coast FIRE',
        freedomTerm: 'Freedom',
        freedomAgeLabel: 'Freedom Age',
        freedomNumberLabel: 'Freedom number',
        freedomShort: 'freedom',
        obEyebrow: 'Building your plan',
        obSub: 'Enter your numbers and add any context. The AI picks up on what matters most.',
        incomeLabel: 'Take-home income',
        savingsLabel: 'Current savings & investments',
        savingsRateLabel: 'How much do you put aside each cycle?',
        contextHint: 'e.g. irregular income, planning to buy a house, self-employed',
        fireTerm: 'FIRE',
        swrTerm: 'safe withdrawal rate (SWR)',
        concessionalTerm: 'concessional (before-tax) contributions',
        preservationTerm: 'preservation age',
        indexFundTerm: 'index fund',
        levelPromise: "Clear numbers with the key terms explained once. We'll flag the changes most likely to move your date."
      }
    },
    fire: {
      id: 'fire',
      name: 'Deep into FIRE',
      desc: 'I know my SWR, my FI number, and I want the full picture — no hand-holding',
      icon: '<path d="M12 22c4.5 0 7-2.8 7-6.8 0-2.8-1.4-4.8-2.8-6.5 0 1.8-.9 2.8-1.8 2.8.4-2.8-.9-4.8-2.7-7.3-.9 2.8-3.6 4.6-3.6 9 0 .9.2 1.8.5 2.7-1-.6-1.7-1.6-1.9-3-1.1 1.8-1.4 3.6-1.4 4.8 0 4 3.2 6.8 7.2 6.8z"/>',
      aiTone: 'direct, analytical, peer-level',
      copy: {
        coastTerm: 'Coast FIRE',
        freedomTerm: 'FI/RE',
        freedomAgeLabel: 'FI Age',
        freedomNumberLabel: 'FI number',
        freedomShort: 'FI',
        obEyebrow: 'Running your numbers',
        obSub: 'The full picture: portfolio, goals, timeline, the lot.',
        incomeLabel: 'Net income',
        savingsLabel: 'Current portfolio value',
        savingsRateLabel: 'Amount saved per cycle',
        contextHint: 'e.g. planning to coast-FIRE, partner income, RE timeline',
        fireTerm: 'FIRE',
        swrTerm: 'SWR',
        concessionalTerm: 'CCs',
        preservationTerm: 'preservation age',
        indexFundTerm: 'index ETF',
        levelPromise: 'Straight to the numbers — FI number, SWR, super bridge, sequence risk. No hand-holding.'
      }
    }
  };

  // Knowledge level per persona — a tool above someone's level isn't hidden, it gets
  // a primer link beside it ("new to this? read X first") so they can step up.
  const LEVEL = { beginner: 1, building: 2, fire: 3 };

  // Where each persona lands after the welcome page or signing in. `guest` is for
  // people without an account (the free calculator is the only guest-facing tool).
  const START_PAGES = {
    beginner: { signedIn: 'learn.html', guest: 'firepath.html' },
    building: { signedIn: 'journey.html', guest: 'firepath.html' },
    fire: { signedIn: 'strategy.html', guest: 'firepath.html' }
  };

  // Every tool that appears as a card somewhere. Mark the card up with
  // data-tool="<key>" (and data-tool-title / data-tool-desc on its text) and its
  // wording follows the persona; wrap a group in data-tool-list and the cards reorder
  // by TOOL_ORDER, with a primer link added under any tool above the person's level.
  const TOOLS = {
    'full-analysis': {
      url: 'firepath_pro.html', level: 1,
      primer: { title: 'What is FIRE, and is it realistic?', url: 'learn/what-is-fire-australia.html' },
      copy: {
        beginner: { title: 'Your full plan', desc: 'Where you are today, and when work could become optional' },
        building: { title: 'Your full plan', desc: 'Your whole picture, including super' },
        fire: { title: 'Your full plan', desc: 'FI number, super bridge, Age Pension overlay' }
      }
    },
    'freedom-gap': {
      url: 'freedom-gap.html', level: 2,
      primer: { title: 'How much money is actually "enough"?', url: 'learn/how-much-is-enough.html' },
      copy: {
        beginner: { title: 'How far away am I?', desc: 'The gap between what you spend and what your savings could pay you' },
        building: { title: 'Freedom gap', desc: 'How much of your spending your savings already cover' },
        fire: { title: 'Freedom gap', desc: 'Portfolio income vs spend at 4% SWR, pension-adjusted' }
      }
    },
    'scenarios': {
      url: 'hearmeout.html', level: 1,
      primer: { title: 'What an extra $50 a week really changes', url: 'learn/extra-50-a-week-impact.html' },
      copy: {
        beginner: { title: 'What if…?', desc: 'Try a decision — like a pay rise or selling a car — and see what changes' },
        building: { title: 'What if…?', desc: 'Test real financial decisions before you make them' },
        fire: { title: 'What if…?', desc: 'Model lump sums, property sales, debt vs invest' }
      }
    },
    'tax-tools': {
      url: 'tax_pro.html', level: 2,
      primer: { title: 'How salary sacrifice actually works', url: 'learn/salary-sacrifice-explained.html' },
      copy: {
        beginner: { title: 'Paying less tax', desc: 'Simple, legal ways to keep more of what you earn' },
        building: { title: 'Tax Tools', desc: 'Legal ways to reduce tax' },
        fire: { title: 'Tax Tools', desc: 'Salary sacrifice, CC headroom, offset vs invest' }
      }
    },
    'withdrawal': {
      url: 'withdrawal.html', level: 3,
      primer: { title: 'The 4% rule, explained for Australians', url: 'learn/four-percent-rule-australia.html' },
      copy: {
        beginner: { title: 'Withdrawal planner', desc: 'See if your money will last once you stop working' },
        building: { title: 'Withdrawal planner', desc: 'See how long your money lasts, in good years and bad' },
        fire: { title: 'Withdrawal planner', desc: 'SWR stress tests, sequence risk, drawdown order' }
      }
    }
  };

  // Most relevant first. Tools not listed keep their original position at the end.
  const TOOL_ORDER = {
    beginner: ['full-analysis', 'freedom-gap', 'scenarios', 'tax-tools', 'withdrawal'],
    building: ['full-analysis', 'freedom-gap', 'tax-tools', 'scenarios', 'withdrawal'],
    fire: ['withdrawal', 'tax-tools', 'scenarios', 'freedom-gap', 'full-analysis']
  };

  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

  // ── Storage ── same localStorage → sessionStorage fallback as auth.js, repeated here
  // so this file has no load-order dependency on auth.js.
  function readStore(key) {
    try { const v = localStorage.getItem(key); if (v) return v; } catch (e) {}
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, value); return; } catch (e) {}
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }
  function authToken() {
    const t = readStore('fp_access_token');
    return (t && t !== 'undefined' && t !== 'null') ? t : null;
  }
  function authUserId() {
    const u = readStore('fp_user_id');
    return (u && u !== 'undefined' && u !== 'null') ? u : null;
  }

  // ── State ──
  function isValid(id) { return Object.prototype.hasOwnProperty.call(PERSONAS, id); }

  // True once this person has actually picked one — lets onboarding tell "chose
  // building" apart from "never asked, defaulted to building".
  function hasChosen() { return isValid(readStore(STORAGE_KEY)); }

  function get() {
    const stored = readStore(STORAGE_KEY);
    return isValid(stored) ? stored : DEFAULT_ID;
  }

  function config(id) { return PERSONAS[isValid(id) ? id : get()]; }

  function copy(key, id) { return config(id).copy[key]; }

  function level(id) { return LEVEL[isValid(id) ? id : get()]; }

  function startUrl(id) {
    const pages = START_PAGES[isValid(id) ? id : get()];
    return authToken() ? pages.signedIn : pages.guest;
  }

  // Tools above this person's level — they stay visible, with a primer beside them.
  function isStretch(toolKey, id) {
    const tool = TOOLS[toolKey];
    return !!tool && tool.level > level(id);
  }

  // options.sync === false skips the DB write — used when the value came FROM the DB.
  function set(id, options) {
    if (!isValid(id)) return false;
    const opts = options || {};
    const previous = hasChosen() ? get() : null;
    writeStore(STORAGE_KEY, id);
    apply();
    if (opts.sync !== false) saveToServer(id);
    if (previous !== id) {
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { persona: id, previous } }));
    }
    return true;
  }

  function onChange(fn) {
    document.addEventListener(CHANGE_EVENT, e => fn(e.detail.persona, e.detail.previous));
  }

  // ── Server sync ──
  // Uses the shared FirePathAuth.fetch (js/auth.js) when the page has it, so the
  // session is kept fresh and a lapsed one never sends anyone away ('none').
  // Pages without js/auth.js fall back to a plain request with the stored session.
  function apiFetch(url, options) {
    if (window.FirePathAuth && typeof window.FirePathAuth.fetch === 'function') {
      return window.FirePathAuth.fetch(url, options, { onExpired: 'none' });
    }
    const headers = Object.assign({}, options && options.headers, { 'Authorization': `Bearer ${authToken()}` });
    return fetch(url, Object.assign({}, options, { headers }));
  }

  async function saveToServer(id) {
    const token = authToken(), userId = authUserId();
    if (!token || !userId) return;
    try {
      await apiFetch(`${API_URL}/db/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: userId, email: readStore('fp_email') || '', persona: id })
      });
    } catch (e) {
      console.log('Persona save failed', e);
    }
  }

  // Pulls users.persona once per page load so a change made on another device shows
  // up here. Local value wins only when the DB has nothing yet (then it's pushed up).
  async function syncFromServer() {
    const token = authToken(), userId = authUserId();
    if (!token || !userId) return;
    try {
      const res = await apiFetch(`${API_URL}/db/users?id=eq.${encodeURIComponent(userId)}&select=persona`, {});
      if (!res.ok) return;
      const rows = await res.json();
      const remote = rows && rows[0] ? rows[0].persona : null;
      if (isValid(remote)) {
        if (remote !== readStore(STORAGE_KEY)) set(remote, { sync: false });
      } else if (hasChosen()) {
        saveToServer(get());
      }
    } catch (e) {
      console.log('Persona sync failed', e);
    }
  }

  // ── Applying to the page ──
  function apply(root) {
    const id = get();
    document.documentElement.setAttribute('data-persona', id);
    const scope = root || document;
    if (!scope.querySelectorAll) return;

    scope.querySelectorAll('[data-term]').forEach(el => {
      const value = copy(el.getAttribute('data-term'), id);
      if (value != null) el.textContent = value;
    });

    const variantSelector = ORDER.map(p => `[data-copy-${p}]`).join(',');
    scope.querySelectorAll(variantSelector).forEach(el => {
      if (!el.hasAttribute('data-copy-default')) el.setAttribute('data-copy-default', el.textContent);
      const variant = el.getAttribute(`data-copy-${id}`);
      el.textContent = variant != null ? variant : el.getAttribute('data-copy-default');
    });

    scope.querySelectorAll('[data-persona-name]').forEach(el => { el.textContent = config(id).name; });

    applyTools(scope, id);

    scope.querySelectorAll('.fp-persona-picker').forEach(list => {
      list.querySelectorAll('.ob-persona').forEach(card => {
        const on = card.dataset.persona === id && hasChosen();
        card.classList.toggle('selected', on);
        card.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  }

  // Tool cards: persona wording, relevance order, and a primer link under any tool
  // that's a step up. Primers are siblings, not children — the cards are <a> links.
  function applyTools(scope, id) {
    scope.querySelectorAll('[data-tool]').forEach(card => {
      const tool = TOOLS[card.getAttribute('data-tool')];
      if (!tool) return;
      const words = tool.copy[id];
      const title = card.querySelector('[data-tool-title]');
      const desc = card.querySelector('[data-tool-desc]');
      if (title) title.textContent = words.title;
      if (desc) desc.textContent = words.desc;
    });

    // Each card sits in a .fp-tool-slot so its primer stays directly beneath it, even
    // when the list is a multi-column grid.
    scope.querySelectorAll('[data-tool-list]').forEach(list => {
      list.querySelectorAll(':scope > [data-tool]').forEach(card => {
        const slot = document.createElement('div');
        slot.className = 'fp-tool-slot';
        list.insertBefore(slot, card);
        slot.appendChild(card);
      });
      list.querySelectorAll('.fp-bridge').forEach(b => b.remove());

      const order = TOOL_ORDER[id] || [];
      const rank = slot => {
        const i = order.indexOf(slot.firstElementChild.getAttribute('data-tool'));
        return i === -1 ? order.length : i;
      };
      Array.from(list.querySelectorAll(':scope > .fp-tool-slot')).sort((a, b) => rank(a) - rank(b)).forEach(slot => {
        list.appendChild(slot);
        const key = slot.firstElementChild.getAttribute('data-tool');
        if (!isStretch(key, id)) return;
        const primer = TOOLS[key].primer;
        const bridge = document.createElement('a');
        bridge.className = 'fp-bridge';
        bridge.href = primer.url;
        bridge.innerHTML = '<span class="fp-bridge-label">New to this?</span> <span class="fp-bridge-title"></span> <span aria-hidden="true">→</span>';
        bridge.querySelector('.fp-bridge-title').textContent = `Read "${primer.title}" first`;
        slot.appendChild(bridge);
      });
    });
  }

  // ── Picker UI ──
  // Emits the same .ob-persona markup the onboarding screens already style, so each
  // page keeps its own look; the fallback styles below only apply where a page has none.
  function renderPicker(container, options) {
    if (!container) return null;
    const opts = options || {};
    container.classList.add('ob-persona-list', 'fp-persona-picker');
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-label', 'How much do you know about money?');
    container.innerHTML = ORDER.map(id => {
      const p = PERSONAS[id];
      return `<div class="ob-persona" data-persona="${id}" role="radio" tabindex="0" aria-checked="false">
        <span class="ob-persona-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p.icon}</svg></span>
        <div class="ob-persona-info">
          <div class="ob-persona-name">${p.name}</div>
          <div class="ob-persona-desc">${p.desc}</div>
        </div>
        <div class="ob-persona-check" aria-hidden="true">${CHECK_SVG}</div>
      </div>`;
    }).join('');

    const choose = card => {
      const id = card.dataset.persona;
      set(id);
      if (typeof opts.onSelect === 'function') opts.onSelect(id, card);
    };
    container.querySelectorAll('.ob-persona').forEach(card => {
      card.addEventListener('click', () => choose(card));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(card); }
      });
    });
    apply(container.parentNode || document);
    return container;
  }

  let modalEl = null;
  function openPicker(options) {
    const opts = options || {};
    closePicker();
    modalEl = document.createElement('div');
    modalEl.className = 'fp-persona-modal';
    modalEl.innerHTML = `<div class="fp-persona-dialog" role="dialog" aria-modal="true" aria-labelledby="fpPersonaTitle">
        <button type="button" class="fp-persona-close" aria-label="Close">×</button>
        <h2 id="fpPersonaTitle">How much do you know about money?</h2>
        <p>We’ll explain things at the right level for you. You can change this any time.</p>
        <div class="fp-persona-modal-list"></div>
      </div>`;
    document.body.appendChild(modalEl);
    renderPicker(modalEl.querySelector('.fp-persona-modal-list'), {
      onSelect: id => {
        if (typeof opts.onSelect === 'function') opts.onSelect(id);
        setTimeout(closePicker, 280);
      }
    });
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closePicker(); });
    modalEl.querySelector('.fp-persona-close').addEventListener('click', closePicker);
    document.addEventListener('keydown', escToClose);
    const first = modalEl.querySelector('.ob-persona.selected') || modalEl.querySelector('.ob-persona');
    if (first) first.focus();
  }
  function closePicker() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.removeEventListener('keydown', escToClose);
  }
  function escToClose(e) { if (e.key === 'Escape') closePicker(); }

  // ── Styles ── visibility rules plus fallback card/modal styles. Card rules sit
  // inside :where() (zero specificity) so any page's own .ob-persona styles win.
  function injectStyles() {
    if (document.getElementById('fp-persona-styles')) return;
    const hide = ORDER.map(id =>
      `html[data-persona="${id}"] [data-persona-show]:not([data-persona-show~="${id}"]),` +
      `html[data-persona="${id}"] [data-persona-hide~="${id}"]`
    ).join(',\n');
    const style = document.createElement('style');
    style.id = 'fp-persona-styles';
    style.textContent = `
${hide} { display: none !important; }

:where(.fp-persona-picker) { display: flex; flex-direction: column; gap: 12px; }
:where(.fp-persona-picker .ob-persona) { display: flex; align-items: center; gap: 16px; padding: 18px 16px; background: var(--card-bg, #fff); border: 1.5px solid var(--border, #EDE3DA); border-radius: 16px; cursor: pointer; text-align: left; transition: border-color .2s, box-shadow .2s; }
:where(.fp-persona-picker .ob-persona:hover) { border-color: rgba(244,98,42,.4); }
:where(.fp-persona-picker .ob-persona:focus-visible) { outline: 2px solid var(--fire-orange, #F4622A); outline-offset: 2px; }
:where(.fp-persona-picker .ob-persona.selected) { border-color: var(--fire-orange, #F4622A); background: #FFF7F3; }
:where(.fp-persona-picker .ob-persona-icon) { flex-shrink: 0; display: flex; color: var(--icon-orange, var(--fire-orange, #E25D29)); }
:where(.fp-persona-picker .ob-persona-info) { flex: 1; min-width: 0; }
:where(.fp-persona-picker .ob-persona-name) { font-size: 15px; font-weight: 600; color: var(--warm-brown, #3D2B1F); margin-bottom: 3px; }
:where(.fp-persona-picker .ob-persona-desc) { font-size: 12px; color: var(--soft-grey, #9E8E85); line-height: 1.5; }
:where(.fp-persona-picker .ob-persona-check) { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--border, #EDE3DA); display: flex; align-items: center; justify-content: center; color: transparent; flex-shrink: 0; }
:where(.fp-persona-picker .ob-persona.selected .ob-persona-check) { background: var(--fire-orange, #F4622A); border-color: var(--fire-orange, #F4622A); color: #fff; }
.fp-persona-picker .ob-persona-icon { color: var(--icon-orange, var(--fire-orange, #E25D29)); }

.fp-persona-modal { position: fixed; inset: 0; z-index: 10000; background: rgba(42,30,21,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.fp-persona-dialog { position: relative; width: 100%; max-width: 480px; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--warm-cream, #FDF6EE); border-radius: 20px; padding: 28px 20px 20px; font-family: 'DM Sans', system-ui, sans-serif; box-shadow: 0 16px 56px rgba(61,43,31,.2); }
.fp-persona-dialog h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 700; line-height: 1.25; text-transform: none; letter-spacing: normal; color: var(--warm-brown, #3D2B1F); margin: 0 32px 6px 0; }
.fp-persona-dialog p { font-size: 13px; color: var(--soft-grey, #9E8E85); margin: 0 0 18px; line-height: 1.5; }
.fp-persona-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border: none; background: transparent; font-size: 24px; line-height: 1; color: var(--soft-grey, #9E8E85); cursor: pointer; border-radius: 8px; }
.fp-persona-close:hover { background: rgba(61,43,31,.06); }
[data-persona-open] { cursor: pointer; }

/* Beginner explainers and advanced summaries — pair with data-persona-show. */
.fp-why, .fp-consider, .fp-tldr { border-radius: 14px; padding: 14px 16px; margin: 12px 0; font-size: 13px; line-height: 1.6; color: var(--warm-brown, #3D2B1F); }
.fp-why::before, .fp-consider::before, .fp-tldr::before { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
.fp-why { background: #FFF7F3; border: 1px solid rgba(244,98,42,.18); }
.fp-why::before { content: 'Why this matters'; color: var(--fire-orange, #F4622A); }
.fp-consider { background: rgba(58,110,165,.07); border: 1px solid rgba(58,110,165,.16); }
.fp-consider::before { content: 'Have you considered…'; color: #3A6EA5; }
.fp-tldr { background: transparent; border: 1px dashed var(--border, #EDE3DA); padding: 10px 14px; font-size: 12px; }
.fp-tldr::before { content: 'TL;DR'; color: var(--soft-grey, #9E8E85); }

/* Primer link under a tool that's a step up for this persona. */
.fp-tool-slot { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fp-bridge { display: block; padding: 0 16px 4px; font-size: 12px; line-height: 1.5; color: var(--soft-grey, #9E8E85); text-decoration: none; }
.fp-bridge-label { font-weight: 600; color: var(--fire-orange, #F4622A); }
.fp-bridge:hover .fp-bridge-title { text-decoration: underline; }

/* "Your level" switch for nav rails and settings. */
.fp-level-switch { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 0; font: inherit; color: inherit; text-align: left; }
.fp-level-switch strong { font-weight: 600; }
`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Boot ── the attribute goes on <html> immediately (no wrong-persona flash);
  // text swaps, auto pickers and the server sync wait for the DOM.
  injectStyles();
  document.documentElement.setAttribute('data-persona', get());

  function boot() {
    document.querySelectorAll('[data-persona-picker]').forEach(el => renderPicker(el));
    document.addEventListener('click', e => {
      const trigger = e.target.closest && e.target.closest('[data-persona-open]');
      if (trigger) { e.preventDefault(); openPicker(); }
    });
    apply();
    syncFromServer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Another tab changed it — follow along.
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY && isValid(e.newValue)) {
      apply();
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { persona: e.newValue, previous: e.oldValue } }));
    }
  });

  return { ORDER, PERSONAS, DEFAULT_ID, TOOLS, get, set, hasChosen, config, copy, level, startUrl, isStretch, onChange, apply, renderPicker, openPicker, closePicker, syncFromServer };
})();
