/**
 * What Free and Pro include — the single source for the upgrade page, Pricing, the
 * homepage and the tool tour. Keep it true: Free = every tool, no account, you type
 * your numbers in; Pro = an account that saves your plan and fills it in everywhere,
 * plus the AI, super, tax, the Journey dashboard and Learning Lab tracking.
 */
export const FREE_FEATURES: string[] = [
  'Your freedom date, in about 2 minutes',
  'A realistic range across 2,000 market futures',
  'What moves it: saving more, spending less, investing vs the bank',
  'Plan as a couple — combine both incomes',
  'Every "what if": sell the house, a lump sum, redundancy, downsizing, rent vs invest',
  'Will your money last? A 30-year stress test with market odds',
  'How part-time work and the Age Pension close the gap',
  'Plain-English guides in the Learning Lab',
];
export const FREE_NOTE = 'No account needed — you type your numbers into each tool.';

export const PRO_FEATURES: [string, string][] = [
  ['Your plan, saved', 'Every tool fills in your own numbers automatically — no retyping.'],
  ['An AI insight about you', 'Written around your income, savings, super, debts and goals.'],
  ['Ask FirePath', 'Ask anything about your own plan — answered by AI, with FirePath’s maths doing the sums.'],
  ['Your full plan, with super', 'Two timelines — what you can reach now and what unlocks at 60 — including your partner’s super.'],
  ['Tax, worked out', 'Take-home, HELP, salary sacrifice and offset vs investing, at current ATO rates.'],
  ['Will it last to 95?', 'The odds across market futures, with the Age Pension and a part-time slider.'],
  ['Your Journey dashboard', 'Net worth and progress since your last check-in.'],
  ['Learning Lab, tracked', 'Save articles, track what you’ve read, and get AI next steps.'],
];
export const PRO_PRICE = { amount: '$6', per: 'a month (AUD)', trialDays: 7 };
export const TRIAL_FINE_PRINT = 'Card needed to start. You won’t be charged until day 8 — cancel before then and you pay nothing.';
