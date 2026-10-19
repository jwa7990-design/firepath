/**
 * What Free and Pro include — the single source for the upgrade page, Pricing, the
 * homepage and the tool tour. Keep it true: Free = the calculators and the Learning Lab,
 * no account, you type your numbers in; Pro = an account that saves your numbers and fills
 * them in everywhere, plus super, tax estimates, Ask FirePath, AI explanations, the Your Path dashboard,
 * the Withdrawal planner to age 95 and saved reading.
 * Wording rule: FirePath is general information. Describe what the tools show, never "personal"
 * advice, "your plan" or tax "worked out" for someone (an adviser review, Oct 2026).
 */
export const FREE_FEATURES: string[] = [
  'Your freedom date, in about 2 minutes',
  'A range across 2,000 simulated market outcomes',
  'What moves it: saving more, spending less, investing vs the bank',
  'Work it out as a couple, with both incomes',
  'What if…? Sell the house, a lump sum, redundancy, downsizing, rent vs invest',
  'Withdrawal planner: see if your money could last 30 years',
  'Freedom gap: what part-time work and the Age Pension could add',
  'Compound interest: what regular saving grows into',
  'Plain-English guides in the Learning Lab',
];
export const FREE_NOTE = 'No account needed. You type your numbers into each tool.';

export const PRO_FEATURES: [string, string][] = [
  ['Your numbers, saved', 'Every tool fills in your own numbers for you. No retyping.'],
  ['AI explanations of your numbers', 'Plain-English explanations of what your figures show. General information, not a recommendation.'],
  ['Ask FirePath', 'Ask how your numbers work and what changes them. It explains the maths, with FirePath doing the sums, and won’t tell you what to do.'],
  ['Your full picture, with super', 'How your savings carry you to 60, then your super takes over. Includes your partner’s super.'],
  ['Tax estimates', 'Take-home pay, HELP, salary sacrifice and offset vs investing, estimated at current ATO rates. Not tax advice.'],
  ['Withdrawal planner, to age 95', 'How often your money lasts across simulated markets, with the Age Pension and a part-time slider.'],
  ['Your Path dashboard', 'Net worth and progress since your last check-in.'],
  ['Your reading, saved', 'Save articles, see what you’ve read, and get AI suggestions for related reading.'],
];
// Shown wherever Pro's AI and tax features are listed for sale (Upgrade, Pricing)
export const PRO_NOTE = "General information only, not financial or tax advice. FirePath doesn't consider your full situation and isn't a registered tax agent. A licensed financial adviser can help with advice for you.";
export const PRO_PRICE = { amount: '$6', per: 'a month (AUD)', trialDays: 7 };
export const TRIAL_FINE_PRINT = 'Card needed to start. You won’t be charged until day 8. Cancel before then and you pay nothing.';
