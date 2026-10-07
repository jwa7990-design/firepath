/**
 * What Free and Pro include — the single source for the upgrade page, Pricing, the
 * homepage and the tool tour. Keep it true: Free = the calculators and the Learning Lab,
 * no account, you type your numbers in; Pro = an account that saves your plan and fills
 * it in everywhere, plus super, tax, Ask FirePath, the AI read, the Your Path dashboard,
 * the Withdrawal planner to age 95 and saved reading.
 */
export const FREE_FEATURES: string[] = [
  'Your freedom date, in about 2 minutes',
  'A realistic range across 2,000 possible market outcomes',
  'What moves it: saving more, spending less, investing vs the bank',
  'Plan as a couple, with both incomes',
  'What if…? Sell the house, a lump sum, redundancy, downsizing, rent vs invest',
  'Withdrawal planner: see if your money lasts 30 years',
  'Freedom gap: what part-time work and the Age Pension could add',
  'Compound interest: what regular saving grows into',
  'Plain-English guides in the Learning Lab',
];
export const FREE_NOTE = 'No account needed. You type your numbers into each tool.';

export const PRO_FEATURES: [string, string][] = [
  ['Your plan, saved', 'Every tool fills in your own numbers for you. No retyping.'],
  ['A personal AI read on your plan', 'Based on your income, savings, super, debts and goals.'],
  ['Ask FirePath', 'Ask anything about your own plan. AI answers, with FirePath’s maths doing the sums.'],
  ['Your full plan, with super', 'How your savings carry you to 60, then your super takes over. Includes your partner’s super.'],
  ['Tax, worked out', 'Take-home pay, HELP, salary sacrifice and offset vs investing, at current ATO rates.'],
  ['Withdrawal planner, to age 95', 'The odds your money lasts, with the Age Pension and a part-time slider.'],
  ['Your Path dashboard', 'Net worth and progress since your last check-in.'],
  ['Your reading, saved', 'Save articles, see what you’ve read, and get AI ideas for what to read next.'],
];
export const PRO_PRICE = { amount: '$6', per: 'a month (AUD)', trialDays: 7 };
export const TRIAL_FINE_PRINT = 'Card needed to start. You won’t be charged until day 8. Cancel before then and you pay nothing.';
