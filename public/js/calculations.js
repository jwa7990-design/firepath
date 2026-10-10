/* ============================================================
   FirePath — Shared Calculation Engine
   /js/calculations.js
   ============================================================ */

/* ── Monthly rate ──────────────────────────────────────────
   The monthly rate that compounds to annualRate over a year.
   (annualRate / 12 compounds to more: 7%/12 → 7.23% a year.)
──────────────────────────────────────────────────────────── */
function monthlyRate(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/* ── Time to goal ──────────────────────────────────────────
   Returns years to reach a savings goal.
   Returns null if mSaving <= 0, goal unreachable in 100 years, or any
   input isn't a finite number.
──────────────────────────────────────────────────────────── */
function yearsToGoal(goal, current, mSaving, rate) {
  // A missing or broken input (NaN, Infinity) has no honest answer: never "Already there!".
  if (![goal, current, mSaving, rate].every(Number.isFinite)) return null;
  if (current >= goal) return 0;
  // Nothing going in and nothing to grow: it never gets there. (With a balance and a
  // positive return it can still get there on growth alone, so keep going.)
  if (mSaving <= 0 && (current <= 0 || rate <= 0)) return null;
  const r = monthlyRate(rate);
  let bal = current, months = 0;
  while (bal < goal && months < 1200) {
    bal = bal * (1 + r) + mSaving;
    months++;
  }
  return months < 1200 ? months / 12 : null;
}

/* ── Time to goal (capped) ─────────────────────────────────
   Same as above but always returns a number (never null).
   Returns 9999 if unreachable — useful for comparisons.
──────────────────────────────────────────────────────────── */
function yearsToGoalCapped(goal, current, mSaving, rate) {
  if (![goal, current, mSaving, rate].every(Number.isFinite)) return 9999;
  if (current >= goal) return 0;
  if (mSaving <= 0 && (current <= 0 || rate <= 0)) return 9999;
  const r = monthlyRate(rate);
  let bal = current, months = 0;
  while (bal < goal && months < 1200) {
    bal = bal * (1 + r) + mSaving;
    months++;
  }
  return months < 1200 ? months / 12 : 9999;
}

/* ── Format years ──────────────────────────────────────────
   Converts a decimal year value to a readable string.
   e.g. 12.5 → "12yr 6mo"
──────────────────────────────────────────────────────────── */
function fmt(y) {
  if (y === null) return '100+ yrs';
  if (typeof y !== 'number' || !Number.isFinite(y)) return '—';   // NaN, Infinity, undefined: never "NaNyr NaNmo"
  if (y === 0) return 'Already there!';
  const months = Math.round(y * 12);           // round once, so 12.97 years is "13 yrs", never "12yr 12mo"
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  if (yr === 0) return mo + ' months';
  if (mo === 0) return yr + ' yr' + (yr !== 1 ? 's' : '');
  return yr + 'yr ' + mo + 'mo';
}

/* ── Format money ──────────────────────────────────────────
   Converts a number to a readable dollar string.
   e.g. 1500000 → "$1.5M", 45000 → "$45K", 500 → "$500"
──────────────────────────────────────────────────────────── */
function fmtM(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';   // NaN and ±Infinity too, never "$InfinityM"
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 999500) return sign + '$' + (a / 1000000).toFixed(1) + 'M';   // 999,600 → $1.0M, not $1000K
  if (a >= 1000) return sign + '$' + Math.round(a / 1000) + 'K';
  return sign + '$' + Math.round(a);
}

/* ── Format exact dollars ──────────────────────────────────
   For amounts where the exact figure matters (tax, shortfalls).
   e.g. 20520 → "$20,520", -1234 → "-$1,234", 1500000 → "$1.5M"
   Pass { compact: false } to show millions in full too.
──────────────────────────────────────────────────────────── */
function fmtDollars(n, opts) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1000000 && !(opts && opts.compact === false)) return sign + '$' + (a / 1000000).toFixed(1) + 'M';
  return sign + '$' + Math.round(a).toLocaleString('en-AU');
}

/* ── Convert to monthly ────────────────────────────────────
   Converts a per-cycle amount to monthly based on pay cycle.
   Requires selectedCycle to be set in the calling page.
──────────────────────────────────────────────────────────── */
function toMonthly(n, cycle) {
  const c = cycle || (typeof selectedCycle !== 'undefined' ? selectedCycle : 'monthly');
  if (c === 'weekly') return n * 52 / 12;
  if (c === 'fortnightly') return n * 26 / 12;
  return n;
}

/* ── Compound growth ───────────────────────────────────────
   Returns the future value of a lump sum after N years
   at a given annual rate.
──────────────────────────────────────────────────────────── */
function compoundGrowth(principal, annualRate, years) {
  return principal * Math.pow(1 + annualRate, years);
}

/* ── Compound with contributions ───────────────────────────
   Returns the future value of regular contributions
   plus an initial lump sum, compounded monthly.
──────────────────────────────────────────────────────────── */
function compoundWithContributions(principal, monthlyContrib, annualRate, years) {
  const r = monthlyRate(annualRate);
  const months = Math.round(years * 12);
  let bal = principal;
  for (let m = 0; m < months; m++) {
    bal = bal * (1 + r) + monthlyContrib;
  }
  return bal;
}

/* ── Super at 60 ──────────────────────────────────────────
   One person's super at 60: today's balance plus employer super (SG,
   capped at the concessional cap) and any extra net contribution, after
   15% contributions tax, growing at FP_ASSUMPTIONS.superReturn (7% less
   typical fund fees, less about 7% tax on earnings ≈ 5.9%), compounded monthly.
   Same rules as FirePathEngine.freedomPlan. Needs js/tax-engine.js for the
   cap (falls back to $32,500).
──────────────────────────────────────────────────────────── */
function projectSuperTo60(balance, age, annualGross, extraNetMonthly) {
  const years = Math.max(0, 60 - age), r = monthlyRate(FP_ASSUMPTIONS.superReturn);
  const cap = typeof TAX_CONFIG !== 'undefined' && TAX_CONFIG.concessionalCap > 0 ? TAX_CONFIG.concessionalCap : 32500;
  const sgMonthly = Math.min(Math.max(0, annualGross || 0) * FP_ASSUMPTIONS.sgRate, cap) / 12;
  const inMonthly = sgMonthly * 0.85 + (extraNetMonthly || 0);
  let bal = balance || 0;
  for (let m = 0; m < Math.round(years * 12); m++) bal = bal * (1 + r) + inMonthly;
  return { balance: bal, sgMonthly, years };
}

/* ── FIRE number ───────────────────────────────────────────
   Returns the portfolio size needed to sustain
   annual spending indefinitely (25x rule / 4% SWR).
──────────────────────────────────────────────────────────── */
function fireNumber(annualSpending) {
  return annualSpending * 25;
}

/* ── Safe withdrawal amount ────────────────────────────────
   Returns the annual amount that can be safely withdrawn
   from a portfolio (4% rule).
──────────────────────────────────────────────────────────── */
function safeWithdrawal(portfolio, rate) {
  return portfolio * (rate || 0.04);
}

/* ── Live assumptions from RBA/ATO ─────────────────────────
   Fetches live data from the Worker and stores globally.
   Falls back to hardcoded values if fetch fails.
──────────────────────────────────────────────────────────── */
/* Two kinds of figures:
   • Today's rates (live from the RBA via the Worker): cash rate, CPI, what a bonus
     savings account pays, and the average variable mortgage rate. Used for anything
     about money's return *now* — cash savings, offset accounts.
   • Long-run planning figures (fixed): 7% real return, 2.5% inflation (the middle of
     the RBA's 2–3% target), used for projections over decades, where today's
     inflation would mislead.
   Real returns use the exact form (1 + nominal) / (1 + inflation) − 1, and may be
   negative — cash really can lose ground to inflation. All returns are before tax,
   the same basis as the 7%. */
const FP_ASSUMPTIONS = {
  cashRate: 4.60,          // RBA cash rate target, %
  cpi: 3.9,                // CPI, year-ended %, latest quarter
  savingsRate: 4.80,       // banks' bonus savings accounts, %
  mortgageRate: 6.2,       // outstanding owner-occupier variable loans, %
  sgRate: 12 / 100,
  preservationAge: 60,
  investReturn: 0.07,      // long-run real return on growth assets
  // Super's after-tax return. Set by financial-engine.js (SUPER_RETURN: 7% less typical
  // fund fees, less about 7% tax on earnings), which overwrites this when it loads; this
  // copy is for pages without it. tests/freedom.test.cjs keeps the two equal.
  superReturn: (0.07 - 0.0065) - ((0.03 + 0.012 * 0.75 * 0.3 / 0.7) * 0.15 - 0.012 * 0.75 * 0.3 / 0.7 + (0.07 - 0.0065 - 0.03) * 0.10),
  longRunInflation: 0.025, // for converting long projections into future dollars
  bankRealReturn: 0,       // derived below
  offsetRealReturn: 0,     // derived below
  mixRealReturn: 0,        // derived below
  asAt: {},
  source: 'fallback'
};

function realRate(nominalPct, inflationPct) {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

// Recompute the "today" returns from the current rates.
function deriveAssumptions() {
  const a = FP_ASSUMPTIONS;
  a.bankRealReturn = realRate(a.savingsRate, a.cpi);
  a.offsetRealReturn = realRate(a.mortgageRate, a.cpi);   // an offset saves mortgage interest, tax-free
  // "A mix" of savings: an even blend of cash, offset and invested money.
  a.mixRealReturn = (a.bankRealReturn + a.offsetRealReturn + a.investReturn) / 3;
}
deriveAssumptions();

async function loadAssumptions() {
  try {
    const res = await fetch(`${WORKER_URL}/assumptions`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    for (const k of ['cashRate', 'cpi', 'savingsRate', 'mortgageRate']) {
      if (typeof data[k] === 'number' && isFinite(data[k])) FP_ASSUMPTIONS[k] = data[k];
    }
    if (data.sgRate) FP_ASSUMPTIONS.sgRate = data.sgRate / 100;
    if (data.preservationAge) FP_ASSUMPTIONS.preservationAge = data.preservationAge;
    if (data.asAt) FP_ASSUMPTIONS.asAt = data.asAt;
    FP_ASSUMPTIONS.source = data.source || 'rba';
  } catch (e) {
    console.log('Assumptions fetch failed, using built-in figures:', e.message);
  }
  deriveAssumptions();
}

