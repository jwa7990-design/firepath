/**
 * FirePath — What next for you
 * =============================
 * A small card at the end of each free tool so a result is never a dead end.
 *
 *   FirePathNext.render(el, { exclude: '/withdrawal', situation })
 *
 * - With a known situation (a Pro member's saved plan passed in as opts.situation, or
 *   the free calculator's numbers saved on this device via FirePathMoves.recall()), it
 *   shows up to three of that person's best moves from js/moves.js — leaving out any
 *   whose tool is the page they're already on (opts.exclude).
 * - With nothing known, it shows three sensible general next steps for this tool and
 *   an invitation to run the free calculator for personal suggestions.
 *
 * Also, for the tools' device prefill (free visitors): FirePathNext.deviceProfile() —
 * the free calculator's saved numbers shaped like a saved plan — and
 * FirePathNext.showDeviceNote(noteEl) — the "Filled in from your free calculator
 * results on this device" note with a Clear link.
 *
 * Needs js/moves.js for personal moves; without it, the general steps still show.
 */
window.FirePathNext = (function () {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = () => window.FirePathMoves || null;

  const CSS = `
.fp-next { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 20px; margin: 16px 0 8px; text-align: left; }
.fp-next-kicker { font-size: 11.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ember-ink); margin-bottom: 4px; }
.fp-next-title { font-size: 18px; font-weight: 700; color: var(--ink); margin: 0 0 4px; }
.fp-next-sub { font-size: 13px; color: var(--ink-2); margin: 0 0 12px; line-height: 1.5; }
.fp-next-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.fp-next-item { padding: 12px 0; border-top: 1px solid var(--line); }
.fp-next-item-title { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.fp-next-impact { font-size: 13px; color: var(--ink-2); margin-top: 2px; line-height: 1.5; }
.fp-next-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; }
.fp-next-links a, .fp-next-here, .fp-next-cta, .fp-next-all { font-size: 13.5px; font-weight: 600; color: var(--ember-ink); text-decoration: none; }
.fp-next-links a:hover, .fp-next-here:hover, .fp-next-cta:hover, .fp-next-all:hover { text-decoration: underline; }
.fp-next-here { background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; }
.fp-next-pill { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--ember-ink); background: var(--ember-wash, rgba(244, 98, 42, 0.08)); vertical-align: 1px; }
.fp-next-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; padding-top: 12px; border-top: 1px solid var(--line); }
.fp-device-clear { background: none; border: 0; padding: 0; font: inherit; color: var(--ember-ink); text-decoration: underline; cursor: pointer; }
`;
  let cssDone = false;
  function injectCss() {
    if (cssDone || typeof document === 'undefined') return;
    cssDone = true;
    try {
      const s = document.createElement('style');
      s.textContent = CSS;
      (document.head || document.body).appendChild(s);
    } catch (e) {}
  }

  // General next steps per tool, for visitors we know nothing about.
  // Each: { title, text, tool?: {href,label}, article? }
  const CALC = { href: '/firepath', label: 'Run the free calculator' };
  const GENERAL = {
    '/withdrawal': [
      { title: 'See your freedom gap', text: 'How much of your life your investments already pay for — and what fills the rest.', tool: { href: '/freedom-gap', label: 'Open Freedom gap' } },
      { title: 'The 4% rule, in Australia', text: 'Where the rule comes from, and how super and the Age Pension change it here.', article: 'four-percent-rule-australia' },
      { title: 'Bridge the years before super', text: 'If you stop before 60, your savings outside super carry you until it unlocks.', article: 'before-super-access' },
    ],
    '/hearmeout': [
      { title: 'Watch compounding work', text: 'What a regular amount grows into — and the cost of waiting five years.', tool: { href: '/compound', label: 'Open Compounding' } },
      { title: 'Pay off debt or invest?', text: 'When clearing a loan beats investing, and when it doesn\'t.', article: 'debt-vs-invest' },
      { title: 'Stress-test your withdrawals', text: 'Check a portfolio survives a bad run of markets when you start drawing on it.', tool: { href: '/withdrawal', label: 'Run the stress test' } },
    ],
    '/compound': [
      { title: 'Living off what you\'ve built', text: 'How much a portfolio can pay you each year, and whether it lasts.', tool: { href: '/withdrawal', label: 'Open Withdrawal' } },
      { title: 'How compound interest works', text: 'Why time matters more than the amount — in plain English.', article: 'how-compound-interest-works' },
      { title: 'What an extra $50 a week does', text: 'A small change, worked through with real numbers.', article: 'extra-50-a-week-impact' },
    ],
    '/freedom-gap': [
      { title: 'Stress-test your withdrawals', text: 'Check your portfolio survives a bad run of markets in the first years.', tool: { href: '/withdrawal', label: 'Run the stress test' } },
      { title: 'Could you work less now?', text: 'Coast FIRE: when your savings can grow on their own and part-time work covers today.', article: 'what-is-coast-fire' },
      { title: 'Is your super enough?', text: 'What super and the Age Pension add once you reach 60 and 67.', article: 'is-my-super-enough' },
    ],
  };
  GENERAL.default = GENERAL['/withdrawal'];

  function linksHtml(tool, plan, article, here) {
    const out = [];
    if (here && tool && tool.href) out.push(`<button type="button" class="fp-next-here" data-href="${esc(tool.href)}">Try it here ↑</button>`);
    else if (tool && tool.href) out.push(`<a href="${esc(tool.href)}"${tool.label ? ` title="${esc(tool.label)}"` : ''}>Model it →</a>${plan === 'Pro' ? '<span class="fp-next-pill">Pro</span>' : ''}`);
    if (article) out.push(`<a href="/learn/${esc(article)}">Read →</a>`);
    return out.length ? `<div class="fp-next-links">${out.map(h => `<span>${h}</span>`).join('')}</div>` : '';
  }

  // The person's moves, best first, minus any for the tool they're already on.
  // With opts.here, moves for this page stay and open in place (opts.onHere) instead.
  function personalMoves(situation, exclude) {
    const m = M();
    if (!m || !situation) return [];
    let r;
    try { r = m.rank(situation, { limit: 4 }); } catch (e) { return []; }
    return (r.moves || []).filter(mv => !(exclude && mv.tool && mv.tool.href && mv.tool.href.indexOf(exclude) === 0)).slice(0, 3);
  }

  function render(el, opts) {
    if (!el) return;
    opts = opts || {};
    injectCss();
    let situation = opts.situation || null, source = situation ? 'plan' : null;
    if (!situation && M()) {
      const saved = M().recall();
      if (saved) { try { situation = M().situationFromInputs(saved); source = 'device'; } catch (e) { situation = null; } }
    }
    const here = opts.onHere ? opts.exclude : null;
    const moves = personalMoves(situation, here ? null : opts.exclude);
    const isHere = mv => !!(here && mv.tool && mv.tool.href && mv.tool.href.indexOf(here) === 0);
    let html;
    if (moves.length) {
      const sub = source === 'plan' ? 'Based on your saved plan.' : 'Based on your free calculator results on this device.';
      html = `<div class="fp-next-kicker">What next for you</div>
        <h2 class="fp-next-title">Your best next moves</h2>
        <p class="fp-next-sub">${esc(sub)}</p>
        <ul class="fp-next-list">${moves.map(mv => `<li class="fp-next-item" data-move="${esc(mv.id)}">
          <div class="fp-next-item-title">${esc(mv.title)}</div>
          ${mv.impact && mv.impact.text ? `<div class="fp-next-impact">${esc(mv.impact.text)}</div>` : ''}
          ${linksHtml(mv.tool, mv.plan, mv.article, isHere(mv))}</li>`).join('')}</ul>
        <div class="fp-next-foot"><a class="fp-next-all" href="/features">All tools →</a></div>`;
    } else {
      const steps = GENERAL[opts.exclude] || GENERAL.default;
      html = `<div class="fp-next-kicker">What next</div>
        <h2 class="fp-next-title">Where to go from here</h2>
        <ul class="fp-next-list">${steps.map(st => `<li class="fp-next-item">
          <div class="fp-next-item-title">${esc(st.title)}</div>
          <div class="fp-next-impact">${esc(st.text)}</div>
          ${linksHtml(st.tool, null, st.article)}</li>`).join('')}</ul>
        <div class="fp-next-foot"><a class="fp-next-cta" href="${esc(CALC.href)}">Get personal suggestions — run the free calculator (2 minutes) →</a><a class="fp-next-all" href="/features">All tools →</a></div>`;
    }
    el.innerHTML = `<section class="fp-next" aria-label="What next">${html}</section>`;
    el.querySelectorAll('.fp-next-here').forEach(b => { b.onclick = () => opts.onHere(b.getAttribute('data-href')); });
    el.style.display = '';
  }

  // The device-prefill note: plain text plus a Clear button that forgets the saved
  // numbers (the values already filled in stay put) and hides the note.
  function showDeviceNote(noteEl) {
    if (!noteEl) return;
    injectCss();
    noteEl.textContent = 'Filled in from your free calculator results on this device — change any number. ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fp-device-clear';
    btn.textContent = 'Clear';
    btn.onclick = () => { if (M()) M().forget(); noteEl.style.display = 'none'; };
    noteEl.appendChild(btn);
    noteEl.style.display = 'block';
  }

  // The free calculator's numbers saved on this device (FirePathMoves.recall()), reshaped
  // like a Pro member's fp_profiles row so each tool can reuse its saved-plan prefill
  // rules unchanged. Money is household; savings_monthly / take_home_income are monthly,
  // and partner_income is per pay_cycle (as on a profile). null when nothing is saved.
  function deviceProfile() {
    const m = M();
    const d = m ? m.recall() : null;
    if (!d) return null;
    const n = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
    const cycle = ['weekly', 'fortnightly', 'monthly'].includes(d.payCycle) ? d.payCycle : null;
    const perCycle = (monthly, c) => c === 'weekly' ? monthly * 12 / 52 : c === 'fortnightly' ? monthly * 12 / 26 : monthly;
    let freedom = n(d.freedomNumber);
    if (!(freedom > 0)) { try { freedom = m.situationFromInputs(d).freedomNumber; } catch (e) { freedom = null; } }
    const partnerMonthly = n(d.partnerTakeHomeMonthly);
    return {
      age: n(d.age), current_savings: n(d.currentSavings), super_balance: n(d.superBalance),
      partner_super: n(d.partnerSuper), partner_age: d.hasPartner ? n(d.partnerAge) : null,
      partner_income: d.hasPartner && partnerMonthly > 0 ? perCycle(partnerMonthly, cycle || 'monthly') : 0,
      take_home_income: n(d.takeHomeMonthly), savings_monthly: n(d.savingsMonthly), pay_cycle: cycle,
      debt_total: n(d.consumerDebt), housing_status: d.housing || null, mortgage_remaining: n(d.mortgageRemaining),
      freedom_number: freedom, retirement_spend_multiplier: n(d.retirementSpendMultiplier), savings_type: d.savingsType || null,
    };
  }

  return { render, showDeviceNote, deviceProfile, GENERAL };
})();
