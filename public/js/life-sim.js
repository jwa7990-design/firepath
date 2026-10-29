/**
 * FirePath — Life changes (What if…? → "Life changes" panel)
 * ===========================================================
 * The person sets up a change themselves (a career break, part-time for a while, or a
 * different job), and FirePath shows the date on the same plan as everywhere else
 * (FirePathEngine.freedomPlan). Up to three scenarios can be kept on this device and
 * compared with "keep going" on one timeline, in the order they were saved: never sorted,
 * ranked, highlighted or labelled best. General information, not a recommendation.
 *
 * How a change that starts later is counted (rough on purpose, and said so on the page):
 * its effect on savings and super, month by month, is moved to today at the plan's own
 * return, then the plan runs as usual. Spending and the freedom number stay the same.
 * A change that lasts (a new job, part-time ongoing) changes the monthly saving from then on.
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
  function basePlanInputs(b) {
    const E = window.FirePathEngine;
    const saved = typeof fpPlanProfile !== 'undefined' && fpPlanProfile && E && E.planInputsFromProfile ? E.planInputsFromProfile(fpPlanProfile) : {};
    return Object.assign({}, saved, { mortgage: saved.mortgage || null, retired: false },
      { age: b.age, savings: b.savings, monthlySavings: Math.max(0, b.sav), target: b.target, annualSpend: undefined,
        superBalance: b.superBal, takeHomeMonthly: b.th, grossIncome: undefined });
  }
  // Take-home at d days a week: gross scaled by days, tax worked out again (tax-engine.js).
  function takeHomeAtDays(th, days) {
    if (typeof estimateGrossFromNet === 'function' && typeof calculateTax === 'function') {
      try { const t = calculateTax(estimateGrossFromNet(th * 12) * days / 5); if (t && t.takeHome > 0) return t.takeHome / 12; } catch (e) { /* fall through */ }
    }
    return th * days / 5;
  }
  // Employer super a month (after the 15% contributions tax) on a given monthly take-home.
  function superMonthly(th) {
    const rate = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.sgRate > 0 ? FP_ASSUMPTIONS.sgRate : 0.12;
    if (!(th > 0) || typeof estimateGrossFromNet !== 'function') return 0;
    try { return estimateGrossFromNet(th * 12) * rate * 0.85 / 12; } catch (e) { return 0; }
  }
  // Today's value of $1 a month for `len` months, starting `start` months from now.
  function pv(mr, start, len) { let t = 0; for (let k = start; k < start + len; k++) t += 1 / Math.pow(1 + mr, k); return t; }

  // A scenario → { plan, note } or { error }. s: { kind, startYears, months, payPct, days, ongoing, newTh }
  function run(b, s) {
    const E = window.FirePathEngine;
    if (!E || !E.freedomPlan) return { error: 'The calculator didn’t load. Try refreshing the page.' };
    const base = basePlanInputs(b);
    const ref = E.freedomPlan(Object.assign({}, base, { safeRate: false }));
    if (!ref.valid) return { error: 'Check the numbers above.' };
    const r = Number.isFinite(ref.outsideReturn) ? ref.outsideReturn : 0.05;
    const mr = Math.pow(1 + r, 1 / 12) - 1;
    const S = Math.round((s.startYears || 0) * 12);
    let savings = b.savings, superBal = b.superBal, monthly = Math.max(0, b.sav), th = b.th, note = '';
    // Can savings carry it? What's built up by the start (no growth counted) against the gap
    // between spending and pay while the change lasts.
    const spend = Math.max(0, b.th - b.sav), savedByStart = b.savings + Math.max(0, b.sav) * S;
    let need = 0;
    if (s.kind === 'break') {
      const D = Math.max(1, Math.round(s.months || 0)), p = Math.min(1, Math.max(0, (s.payPct || 0) / 100));
      const lostPay = (1 - p) * b.th;   // spending carries on, so lost pay comes out of saving (or savings)
      need = Math.max(0, spend - p * b.th) * D;
      savings -= lostPay * pv(mr, S, D);
      superBal -= superMonthly(b.th) * (1 - p) * pv(mr, S, D);
      note = `A ${D}-month break ${S ? `in ${s.startYears} year${s.startYears === 1 ? '' : 's'}` : 'starting now'}${p > 0 ? ` on ${Math.round(p * 100)}% pay` : ', unpaid'}: about ${money(lostPay * D)} less pay over the break, with spending unchanged.`;
    } else if (s.kind === 'parttime') {
      const days = Math.min(4.5, Math.max(1, s.days || 4)), thD = takeHomeAtDays(b.th, days), drop = b.th - thD;
      const sgDrop = superMonthly(b.th) - superMonthly(thD);
      if (s.ongoing) {
        // From the start date on: less saved each month. Before it, the old saving still goes in.
        savings += drop * pv(mr, 0, S); superBal += sgDrop * pv(mr, 0, S);
        monthly = Math.max(0, b.sav - drop); th = thD;
        note = `${days} days a week${S ? `, starting in ${s.startYears} year${s.startYears === 1 ? '' : 's'}` : ' from now'}, ongoing: take-home about ${money(drop)} a month lower.`
          + (b.sav - drop < 0 ? ' That’s more than you save now, so this assumes spending comes down to match.' : '');
      } else {
        const D = Math.max(1, Math.round(s.months || 0));
        need = Math.max(0, spend - thD) * D;
        savings -= drop * pv(mr, S, D); superBal -= sgDrop * pv(mr, S, D);
        note = `${days} days a week for ${D >= 12 && D % 12 === 0 ? `${D / 12} year${D === 12 ? '' : 's'}` : `${D} months`}${S ? `, starting in ${s.startYears} year${s.startYears === 1 ? '' : 's'}` : ', starting now'}: take-home about ${money(drop)} a month lower while it lasts.`;
      }
    } else if (s.kind === 'job') {
      const newTh = Math.max(0, s.newTh || 0), delta = newTh - b.th;
      savings -= delta * pv(mr, 0, S);   // before the move, the old pay carries on
      superBal -= (superMonthly(newTh) - superMonthly(b.th)) * pv(mr, 0, S);
      monthly = Math.max(0, b.sav + delta); th = newTh;
      note = `A job paying ${money(newTh)} a month take-home${S ? `, starting in ${s.startYears} year${s.startYears === 1 ? '' : 's'}` : ', starting now'}, with spending unchanged.`
        + (b.sav + delta < 0 ? ' That’s less than you spend now, so this assumes spending comes down to match.' : '');
    }
    if (need > savedByStart) return { error: `On these numbers, the change needs about ${money(need)} from savings, more than you’d have by then.`, note };
    // A change later on can push today's equivalent below zero; that's fine here (it's only the
    // change moved to today's dollars), as long as savings can carry it when it happens.
    const plan = E.freedomPlan(Object.assign({}, base, { savings, superBalance: Math.max(0, superBal), monthlySavings: monthly, takeHomeMonthly: th }));
    return plan.valid ? { plan, note } : { error: 'Those numbers don’t add up. Try a smaller change.', note };
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
