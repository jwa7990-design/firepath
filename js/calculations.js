/* ============================================================
   FirePath — Shared Calculation Engine
   /js/calculations.js
   ============================================================ */

/* ── Time to goal ──────────────────────────────────────────
   Returns years to reach a savings goal.
   Returns null if mSaving <= 0 or goal unreachable in 100 years.
──────────────────────────────────────────────────────────── */
function yearsToGoal(goal, current, mSaving, rate) {
  if (mSaving <= 0) return null;
  if (current >= goal) return 0;
  const r = rate / 12;
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
  if (mSaving <= 0) return 9999;
  if (current >= goal) return 0;
  const r = rate / 12;
  let bal = current, months = 0;
  while (bal < goal && months < 1200) {
    bal = bal * (1 + r) + mSaving;
    months++;
  }
  return months / 12;
}

/* ── Format years ──────────────────────────────────────────
   Converts a decimal year value to a readable string.
   e.g. 12.5 → "12yr 6mo"
──────────────────────────────────────────────────────────── */
function fmt(y) {
  if (y === null) return '100+ yrs';
  if (y === 0) return 'Already there!';
  const yr = Math.floor(y);
  const mo = Math.round((y - yr) * 12);
  if (yr === 0) return mo + ' months';
  if (mo === 0) return yr + ' yr' + (yr !== 1 ? 's' : '');
  return yr + 'yr ' + mo + 'mo';
}

/* ── Format money ──────────────────────────────────────────
   Converts a number to a readable dollar string.
   e.g. 1500000 → "$1.5M", 45000 → "$45K", 500 → "$500"
──────────────────────────────────────────────────────────── */
function fmtM(n) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
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
  const r = annualRate / 12;
  const months = years * 12;
  let bal = principal;
  for (let m = 0; m < months; m++) {
    bal = bal * (1 + r) + monthlyContrib;
  }
  return bal;
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
