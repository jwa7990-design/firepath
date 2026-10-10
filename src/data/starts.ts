/**
 * "Start where you are" — one page per common situation, at /start/<slug>. Each page
 * gives the order that genuinely helps (the same order as js/moves.js), the free tools
 * for it, the articles to read and a few straight answers. Also used for the homepage
 * doors and the share images (scripts/og-images.cjs reads slug/door/title from here).
 */
export interface StartStep { title: string; body: string; href?: string; cta?: string; }
export interface StartPage {
  slug: string; door: string; title: string; icon: string;
  seoTitle: string; description: string; lead: string; doorLine: string;
  steps: StartStep[]; tools: { href: string; name: string; line: string }[];
  articles: string[]; faq: { q: string; a: string }[];
}

export const STARTS: StartPage[] = [
  { slug: 'just-starting', door: 'Just starting out', title: 'Where to begin with money', icon: 'flame',
    seoTitle: 'How to start saving and investing in Australia — a simple first plan | FirePath',
    description: 'New to saving and investing? A simple, plain-English first plan for Australians: know your numbers, build a small buffer, then let compounding work.',
    lead: 'You don’t need to know much to start. Here’s a simple order many people use, in plain English.',
    doorLine: 'A simple first plan, one step at a time.',
    steps: [
      { title: 'Knowing your numbers', body: 'What comes in, what goes out and what could be set aside. Two minutes in the free calculator gives a real date, not a vague “someday”.', href: '/firepath', cta: 'Find my freedom date' },
      { title: 'A small cash buffer', body: 'Many people keep about three months of spending in an easy-to-reach savings account, so a surprise bill doesn’t derail things.' },
      { title: 'Starting small, and automatic', body: 'A regular amount moved on payday, even $50 a week, builds the habit and gets compounding working early.', href: '/hearmeout', cta: 'See what $50 a week grows into' },
      { title: 'How compounding works', body: 'It’s money earning money, which then earns money too. Once it clicks, a lot of the rest makes sense.', href: '/learn/how-compound-interest-works', cta: 'How compounding works' },
    ],
    tools: [
      { href: '/firepath', name: 'Freedom calculator', line: 'Your freedom date and what moves it.' },
      { href: '/compound', name: 'Compound interest', line: 'Watch regular saving grow.' },
      { href: '/hearmeout', name: 'What if…?', line: 'Try “what if I saved more?”' },
    ],
    articles: ['good-savings-rate', 'difference-saving-investing', 'how-much-to-start-investing', 'start-investing-no-experience', 'what-is-an-index-fund', 'why-do-i-feel-behind'],
    faq: [
      { q: 'How much should I save to start?', a: 'Whatever you can keep doing. A common first goal is 10% of take-home pay, but a smaller amount kept up often beats a bigger one that stops. Many people lift it each time their pay goes up.' },
      { q: 'Should I save or invest first?', a: 'A common approach is a small buffer first (about three months of spending), then investing money that won’t be needed for five years or more. Savings protect against surprises; investing tends to grow money over time.' },
      { q: 'How much do I need to start investing?', a: 'Not much. Many Australian investing platforms let you start with a few hundred dollars or less. What matters more is investing regularly.' },
    ] },

  { slug: 'debt', door: 'I’ve got debt', title: 'Got debt?', icon: 'card',
    seoTitle: 'Should I pay off debt or invest? An Australian guide | FirePath',
    description: 'Credit cards, personal loans, buy now pay later, HECS and a mortgage are very different debts. Here’s how Australians often order them, and where investing fits in.',
    lead: 'Here are some techniques people use to work out which debt to reduce first. Not all debt is equal: card debt usually costs more than investing earns, so the order can make a big difference.',
    doorLine: 'Which debt first, and when to start investing.',
    steps: [
      { title: 'Seeing every debt and its rate', body: 'Credit cards, personal and car loans, buy now pay later, HECS/HELP and a mortgage. The interest rate is what usually decides the order.' },
      { title: 'Why high-interest debt usually comes first', body: 'Cards and personal loans often charge 15–20% a year or more. Each dollar paid off saves that much interest, guaranteed. No investment reliably earns that.', href: '/hearmeout?scenario=loan', cta: 'See it paid off' },
      { title: 'A small buffer alongside', body: 'A month or two of spending in cash can stop a surprise bill going straight back on the card.' },
      { title: 'Low-rate debt can sit alongside investing', body: 'HECS/HELP is indexed to inflation rather than charged interest, and mortgage rates are usually far below card rates. Many people invest while paying these down normally.' },
      { title: 'What the repayments can do next', body: 'Once the expensive debt is gone, the same repayment amount can go into savings and investments instead.', href: '/firepath', cta: 'Find my freedom date' },
    ],
    tools: [
      { href: '/hearmeout?scenario=loan', name: 'Loan payoff', line: 'How fast it goes, and what it costs.' },
      { href: '/firepath', name: 'Freedom calculator', line: 'Your date once the debt is gone.' },
    ],
    articles: ['debt-vs-invest', 'bad-with-money-or-underpaid', 'money-anxiety', 'why-do-i-feel-behind', 'everyone-else-figured-out'],
    faq: [
      { q: 'Should I pay off my credit card or invest?', a: 'On the maths, the card often comes out ahead. Credit card interest is often 15–20% a year or more, which is a guaranteed cost. Shares have historically returned less than that on average, with ups and downs.' },
      { q: 'Should I pay off HECS early?', a: 'For many people it isn’t the first priority. HECS/HELP isn’t charged interest. It’s indexed to inflation, and repayments come out of your pay automatically above the threshold. High-interest debt usually costs far more.' },
      { q: 'Pay off the mortgage or invest?', a: 'It depends on your mortgage rate and tax rate. An offset account saves your mortgage rate, tax-free and guaranteed; investing may earn more over time with more ups and downs.' },
    ] },

  { slug: 'renting', door: 'Renting or saving to buy', title: 'Rent or buy: either way can work', icon: 'scale',
    seoTitle: 'Rent or buy in Australia — what it means for early retirement | FirePath',
    description: 'Renting and investing the difference, or buying a home? What each means for when you could stop working in Australia, and how to plan either way.',
    lead: 'There’s no single right answer. What matters is that it fits your plan, and if you’ll still rent in retirement, that the rent is in your plan too.',
    doorLine: 'Rent and invest, or buy? Try both on your numbers.',
    steps: [
      { title: 'Both paths, on your numbers', body: 'Buying builds equity but costs stamp duty, interest and upkeep. Renting can leave more to invest, but only if the difference gets invested.', href: '/hearmeout?scenario=rentvest', cta: 'Compare rent vs buy' },
      { title: 'If you rent: investing the difference', body: 'The case for renting only works when the money you’re not spending on a mortgage gets invested, consistently.' },
      { title: 'If you buy: the deposit', body: 'The First Home Super Saver Scheme lets eligible first-home buyers save part of a deposit inside super’s lower tax.', href: '/learn/first-home-super-saver', cta: 'How the scheme works' },
      { title: 'Housing in retirement', body: 'Renters need their savings to cover rent for life, so the freedom number is higher. The Age Pension assets test also treats renters differently.', href: '/learn/renting-forever-retirement', cta: 'Renting in retirement' },
    ],
    tools: [
      { href: '/hearmeout?scenario=rentvest', name: 'Rent vs invest', line: 'Both paths, side by side.' },
      { href: '/firepath', name: 'Freedom calculator', line: 'Your date as a renter or owner.' },
    ],
    articles: ['rent-or-buy', 'renting-cheaper-than-owning', 'renting-forever-retirement', 'house-delays-fi', 'first-home-super-saver'],
    faq: [
      { q: 'Is renting a waste of money?', a: 'Not necessarily. Owning has its own costs — interest, rates, upkeep and stamp duty. Renting and investing the difference can come out ahead, but only if the difference is invested.' },
      { q: 'Can I retire early if I rent?', a: 'Yes, but your savings need to cover rent for life, so the freedom number is higher than an owner’s. Building that in from the start keeps the plan realistic.' },
      { q: 'Does buying a house delay financial independence?', a: 'It can: a big deposit and mortgage repayments slow investing for years. It can also lower your costs later. Your numbers decide which matters more.' },
    ] },

  { slug: 'building-wealth', door: 'Building wealth', title: 'What gets you there faster', icon: 'bars',
    seoTitle: 'How to reach financial independence faster in Australia | FirePath',
    description: 'Already saving and investing? What moves your freedom date most in Australia: savings rate, where your money sits, salary sacrifice, offset vs invest and Coast FIRE.',
    lead: 'Once the basics are in place, a few things do most of the work. FirePath shows which ones matter for you, and by how many years.',
    doorLine: 'The few things that move your date most.',
    steps: [
      { title: 'Your savings rate matters most', body: 'Saving more works twice: more invested now, and a smaller number to reach if you also spend less.', href: '/firepath', cta: 'See what moves your date' },
      { title: 'Is your money working?', body: 'Cash above your buffer barely keeps up with inflation. Low-cost diversified funds have historically grown far faster over the long run.', href: '/learn/what-is-an-index-fund', cta: 'Index funds explained' },
      { title: 'Super’s tax break, if it suits', body: 'On a 30%+ tax rate, salary sacrificing into super is taxed at 15% instead. It’s locked until 60, so many people balance it with money they can reach sooner.', href: '/learn/salary-sacrifice-explained', cta: 'Salary sacrifice explained' },
      { title: 'When easing off could be an option', body: 'Coast FIRE is the point where your savings would reach your number by retirement without adding more, so part-time work could cover your bills from here.', href: '/freedom-gap', cta: 'See your freedom gap' },
    ],
    tools: [
      { href: '/firepath', name: 'Freedom calculator', line: 'Every change, shown in years.' },
      { href: '/freedom-gap', name: 'Freedom gap', line: 'What part-time work could cover.' },
      { href: '/compound', name: 'Compound interest', line: 'What regular investing grows into.' },
    ],
    articles: ['what-is-an-index-fund', 'etfs-how-to-buy', 'salary-sacrifice-explained', 'super-vs-outside-investing', 'what-is-coast-fire', 'four-percent-rule-australia'],
    faq: [
      { q: 'What savings rate do I need to retire early?', a: 'There’s no single number, but the higher it is, the sooner you get there. Many people aiming for early retirement save 30–50% of take-home pay. FirePath shows what your own rate means in years.' },
      { q: 'Should I invest inside or outside super?', a: 'Both have a place. Super is taxed less but locked until 60; investing outside super can be reached any time. Stopping work before 60 means money outside super has to bridge the gap.' },
      { q: 'What is Coast FIRE?', a: 'The point where your existing savings would grow to your freedom number by retirement age without adding more, so you only need to cover today’s costs.' },
    ] },

  { slug: 'retirement', door: 'Nearly or already retired', title: 'Making your money last', icon: 'shield',
    seoTitle: 'Will my money last in retirement? An Australian guide | FirePath',
    description: 'Nearly retired or already there? How to check your money lasts in Australia: withdrawal rates, the years before you can get to your super at 60, the Age Pension at 67 and a bad market early on.',
    lead: 'Close to the finish line, the big question becomes “will it last?” Here’s how people check, honestly.',
    doorLine: 'Withdrawal rates, super at 60, the Age Pension.',
    steps: [
      { title: 'Testing how much you draw', body: 'Markets don’t return the average every year. The Withdrawal planner tests a withdrawal rate across thousands of possible market outcomes, including a bad run early on.', href: '/withdrawal', cta: 'Try the Withdrawal planner' },
      { title: 'Bridging the years before 60', body: 'Super is locked until preservation age (60). If you stop earlier, money outside super has to carry you until then.', href: '/learn/before-super-access', cta: 'Before you can access super' },
      { title: 'What the Age Pension could add from 67', body: 'Depending on your assets and income, the Age Pension may top up what your savings pay. It’s means-tested, so it changes as your balance does.', href: '/freedom-gap', cta: 'See what it adds' },
      { title: 'A cash buffer for bad years', body: 'Many retirees keep a year or two of spending in cash so they don’t have to sell investments during a downturn.', href: '/learn/volatility-emotional-side', cta: 'The emotional side of volatility' },
    ],
    tools: [
      { href: '/withdrawal', name: 'Withdrawal planner', line: 'The odds your money lasts.' },
      { href: '/freedom-gap', name: 'Freedom gap', line: 'Age Pension and part-time work.' },
      { href: '/retirement-age-calculator', name: 'Retirement age calculator', line: 'A quick estimate of when work could become optional.' },
    ],
    articles: ['four-percent-rule-australia', 'before-super-access', 'is-my-super-enough', 'when-can-i-actually-retire', 'super-balance-at-60', 'volatility-emotional-side'],
    faq: [
      { q: 'Does the 4% rule work in Australia?', a: 'It’s a useful starting point, not a guarantee. It came from US data over 30-year retirements; longer retirements, fees and a bad early run all matter. Testing your own rate across many possible market outcomes is more honest.' },
      { q: 'When can I access my super?', a: 'Generally from your preservation age (60 for anyone born after 30 June 1964) once you retire, or from 65 regardless.' },
      { q: 'Will I get the Age Pension?', a: 'It depends on your age (67+), assets and income. Homeowners and renters have different asset limits, and many people with savings still receive a part pension.' },
    ] },
];
