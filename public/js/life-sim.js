/**
 * FirePath — Life changes (What if…? → "Life changes" panel)
 * ===========================================================
 * The person sets up a change themselves (a career break, part-time for a while, or a
 * different job), and FirePath shows the date on the same plan as everywhere else
 * (FirePathEngine.freedomPlan). Up to three scenarios can be kept on this device and
 * compared with "keep going" on one timeline, in the order they were saved: never sorted,
 * ranked, highlighted or labelled best. General information, not a recommendation.
 *
 * The maths: FirePathEngine.freedomPlanWithChange walks the same plan as the headline month
 * by month (savings, super with its contributions, tax on pay worked out again), applying the
 * change only while it lasts. Spending and the freedom number stay the same.
 */
window.FirePathLife = (function () {
  const KEY = 'fp_life_scenarios';
  const MAX_SAVED = 3;
  const $ = id => document.getElementById(id);
  const num = (id, d) => { const el = $(id); const v = el ? parseFloat(el.value) : NaN; return Number.isFinite(v) ? v : d; };
  const money = n => '$' + Math.round(n).toLocaleString('en-AU');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let kind = 'break';

  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, MAX_SAVED) : []; } catch (e) { return []; } }
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED))); } catch (e) { /* storage unavailable */ } }

  // The person's numbers (monthly, today's dollars), from the panel's fields.
  function inputs() {
    return { age: num('lf-age', 0), th: num('lf-takehome', 0), sav: num('lf-save', 0), savings: num('lf-savings', 0),
      superBal: num('lf-super', 0), target: num('lf-fireNum', 0) };
  }
  // The rest of the plan (where savings sit, partner, rent, mortgage, employer super…) comes
  // from the same answers as the headline: the Pro saved plan, or else the free calculator's
  // numbers on this device (FirePathMoves.planInputsFor, as the other tools use). So "keep
  // going" here is the same date as on the results page.
  function fromDevice() {
    const M = window.FirePathMoves;
    const d = M && M.recall ? M.recall() : null;
    if (!d || !M.planInputsFor) return {};
    try { return M.planInputsFor(M.situationFromInputs(d)); } catch (e) { return {}; }
  }
  function savedPlan() {
    const E = window.FirePathEngine;
    if (typeof fpPlanProfile !== 'undefined' && fpPlanProfile && E && E.planInputsFromProfile) return E.planInputsFromProfile(fpPlanProfile);
    return fromDevice();
  }
  // Take-home in the panel is the household's; the change applies to your own pay.
  const partnerTh = saved => saved.partner && saved.partner.takeHomeMonthly > 0 ? saved.partner.takeHomeMonthly : 0;
  function basePlanInputs(b, saved) {
    saved = saved || savedPlan();
    return Object.assign({}, saved, { mortgage: saved.mortgage || null, retired: false },
      { age: b.age, savings: b.savings, monthlySavings: Math.max(0, b.sav), target: b.target, annualSpend: undefined,
        superBalance: b.superBal, takeHomeMonthly: Math.max(0, b.th - partnerTh(saved)), grossIncome: undefined });
  }
  // Usual gross pay from take-home, and take-home on a given gross (tax-engine.js), so pay
  // during leave or at fewer days has its tax worked out again rather than scaled.
  function grossOf(th) { try { return typeof estimateGrossFromNet === 'function' ? estimateGrossFromNet(th * 12) : th * 12 * 1.3; } catch (e) { return th * 12 * 1.3; } }
  function takeHomeOf(gross) {
    if (!(gross > 0)) return 0;
    try { const t = typeof calculateTax === 'function' ? calculateTax(gross) : null; if (t && t.takeHome >= 0) return t.takeHome / 12; } catch (e) { /* fall through */ }
    return gross / 12 * 0.77;
  }
  const yrs = y => `${y} year${y === 1 ? '' : 's'}`;

  // A scenario → { plan, note } or { error, note }. s: { kind, startYears, months, payPct, days, ongoing, newTh }
  // Walked month by month on the same plan as the headline (FirePathEngine.freedomPlanWithChange):
  // usual saving until the change, the change's saving and super while it lasts, then back to
  // usual (or the new normal, for a lasting change). Spending and the freedom number stay the same.
  function run(b, s) {
    const E = window.FirePathEngine;
    if (!E || !E.freedomPlanWithChange) return { error: 'The calculator didn’t load. Try refreshing the page.' };
    const saved = savedPlan(), pTh = partnerTh(saved), base = basePlanInputs(b, saved);
    const S = Math.round((s.startYears || 0) * 12);
    const own = Math.max(0, b.th - pTh), gross = grossOf(own), spend = Math.max(0, b.th - b.sav);
    const when = S ? `starting in ${yrs(s.startYears)}` : 'starting now';
    let change, note;
    if (s.kind === 'break') {
      const D = Math.max(1, Math.round(s.months || 0)), p = Math.min(1, Math.max(0, (s.payPct || 0) / 100));
      const thDuring = takeHomeOf(gross * p);
      change = { start: S, end: S + D, during: { monthlySavings: thDuring + pTh - spend, grossIncome: gross * p } };
      note = `A ${D}-month break, ${when}, ${p > 0 ? `on ${Math.round(p * 100)}% of usual pay` : 'unpaid'}: take-home about ${money(own - thDuring)} a month lower while it lasts, with spending unchanged.`;
    } else if (s.kind === 'parttime') {
      const days = Math.min(4.5, Math.max(1, s.days || 4)), gD = gross * days / 5, thD = takeHomeOf(gD);
      if (s.ongoing) {
        change = { start: S, end: null, after: { monthlySavings: Math.max(0, thD + pTh - spend), takeHomeMonthly: thD, grossIncome: gD } };
        note = `${days} days a week, ${when}, ongoing: take-home about ${money(own - thD)} a month lower.`
          + (thD + pTh < spend ? ' That’s less than you spend now, so this assumes spending comes down to match.' : '');
      } else {
        const D = Math.max(1, Math.round(s.months || 0));
        change = { start: S, end: S + D, during: { monthlySavings: thD + pTh - spend, grossIncome: gD } };
        note = `${days} days a week for ${D >= 12 && D % 12 === 0 ? yrs(D / 12) : `${D} months`}, ${when}: take-home about ${money(own - thD)} a month lower while it lasts.`;
      }
    } else {
      const newTh = Math.max(0, s.newTh || 0);
      change = { start: S, end: null, after: { monthlySavings: Math.max(0, newTh + pTh - spend), takeHomeMonthly: newTh, grossIncome: grossOf(newTh) } };
      note = `A job paying ${money(newTh)} a month take-home, ${when}, with spending unchanged.`
        + (newTh + pTh < spend ? ' That’s less than you spend now, so this assumes spending comes down to match.' : '');
    }
    let plan;
    try { plan = E.freedomPlanWithChange(base, change); } catch (e) { plan = null; }
    if (!plan || !plan.valid) return { error: 'Check the numbers above.', note };
    if (plan.short) return { error: `On these numbers, savings would run out about ${Math.max(1, plan.shortAt - S)} month${plan.shortAt - S === 1 ? '' : 's'} into the change.`, note };
    if (plan.changeMatters === false) note += ' On these numbers you’d reach your number before it starts, so the date doesn’t change.';
    return { plan, note };
  }

  const yearOf = p => p.alreadyFree ? 'Now' : String(p.freedomYear);
  function rowHtml(name, p, maxM, i, removable) {
    const far = !p || !p.reachable || p.months == null || p.years > 60;
    const pct = far ? 100 : Math.max(4, Math.min(100, p.months / maxM * 100));
    return `<li class="lf-row${i < 0 ? ' is-base' : ''}"><span class="lf-name">${esc(name)}</span>`
      + `<span class="lf-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`
      + `<span class="lf-when">${far ? '60+ yrs' : `${yearOf(p)} · age ${p.freedomAge}`}</span>`
      + (removable ? `<button type="button" class="lf-del" data-i="${i}" aria-label="Remove ${esc(name)}">Remove</button>` : '<span></span>') + '</li>';
  }

  function currentScenario() {
    return { kind, startYears: num('lf-start', 0), months: num('lf-months', 6), payPct: num('lf-pay', 0),
      days: num('lf-days', 4), ongoing: !!($('lf-ongoing') && $('lf-ongoing').checked), newTh: num('lf-newth', 0) };
  }

  function render() {
    const out = $('lf-out'); if (!out) return;
    ['break', 'parttime', 'job'].forEach(k => { const f = $('lf-f-' + k); if (f) f.hidden = k !== kind; });
    document.querySelectorAll('.lf-kind').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.kind === kind)));
    const lens = $('lf-months-row'); if (lens) lens.hidden = kind === 'job' || (kind === 'parttime' && $('lf-ongoing') && $('lf-ongoing').checked);
    $('lf-startVal').textContent = num('lf-start', 0) === 0 ? 'now' : `in ${num('lf-start', 0)} yr${num('lf-start', 0) === 1 ? '' : 's'}`;
    $('lf-monthsVal').textContent = `${num('lf-months', 6)} months`;
    $('lf-payVal').textContent = `${num('lf-pay', 0)}%`;
    $('lf-daysVal').textContent = `${num('lf-days', 4)} days`;
    const b = inputs();
    if (!(b.th > 0) || !(b.target > 0) || !(b.age > 0)) { out.innerHTML = '<p class="lf-empty">Fill in your numbers to see the timeline.</p>'; return; }
    const E = window.FirePathEngine;
    const basePlan = E && E.freedomPlan ? E.freedomPlan(basePlanInputs(b)) : null;
    const draft = run(b, currentScenario());
    // Same date as keeping going (and not because it starts after the date): say why.
    if (draft.plan && basePlan && basePlan.valid && draft.plan.months === basePlan.months && !/before it starts/.test(draft.note || ''))
      draft.note += draft.plan.freedomAge >= 60 ? ' Same date on these numbers, because your super from 60 sets it.' : ' The date doesn’t move on these numbers.';
    const saved = load().map(s => Object.assign({ res: run(b, s) }, s));
    const plans = [basePlan, draft.plan].concat(saved.map(s => s.res.plan)).filter(p => p && p.valid && p.months != null);
    const maxM = Math.max(12, ...plans.map(p => Math.min(p.months, 720)));
    let html = '<ol class="lf-rows">' + rowHtml('Keep going', basePlan && basePlan.valid ? basePlan : null, maxM, -1, false);
    saved.forEach((s, i) => { html += s.res.plan ? rowHtml(s.name, s.res.plan, maxM, i, true) : `<li class="lf-row"><span class="lf-name">${esc(s.name)}</span><span class="lf-when lf-wide">${esc(s.res.error)}</span><button type="button" class="lf-del" data-i="${i}" aria-label="Remove ${esc(s.name)}">Remove</button></li>`; });
    html += '</ol>';
    html += `<div class="lf-draft"><p class="hp-label">This change</p>`
      + (draft.plan ? `<p class="lf-draft-when"><strong>${yearOf(draft.plan)}</strong>${draft.plan.freedomAge != null ? ` · age ${draft.plan.freedomAge}` : ''}</p>` : `<p class="lf-draft-when lf-err">${esc(draft.error)}</p>`)
      + (draft.note ? `<p class="lf-note">${esc(draft.note)}</p>` : '') + '</div>';
    out.innerHTML = html;
    out.querySelectorAll('.lf-del').forEach(btn => btn.addEventListener('click', () => { const l = load(); l.splice(Number(btn.dataset.i), 1); store(l); render(); }));
    const saveBtn = $('lf-save-btn'), full = load().length >= MAX_SAVED;
    if (saveBtn) { saveBtn.textContent = full ? 'Three saved: remove one to add another' : 'Save to compare'; saveBtn.dataset.full = String(full); }
  }

  function save() {
    const l = load();
    if (l.length >= MAX_SAVED) return;
    const nameEl = $('lf-name');
    const fallback = kind === 'break' ? 'A break' : kind === 'parttime' ? 'Part-time' : 'A different job';
    const name = (nameEl && nameEl.value.trim().slice(0, 40)) || `${fallback} ${l.length + 1}`;
    l.push(Object.assign({ name }, currentScenario()));
    store(l);
    if (nameEl) nameEl.value = '';
    render();
  }
  function setKind(k) { kind = k; render(); }

  return { render, save, setKind };
})();
