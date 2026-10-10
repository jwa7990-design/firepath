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
  { slug: 'just-starting', door: 'Just starting out', title: 'New to money?', icon: 'flame',
    seoTitle: 'How to start saving and investing in Australia — a simple first plan | FirePath',
    description: 'New to saving and investing? A simple, plain-English first plan for Australians: know your numbers, build a small buffer, then let compounding work.',
    lead: 'You don’t need to know much to start. Here are some ways people approach it, in plain English.',
    doorLine: 'A simple first plan, one step at a time.',
    steps: [
      { title: 'What are your numbers?', body: 'What comes in, what goes out and what could be set aside. Two minutes in the free calculator gives a real date, not a vague “someday”.', href: '/firepath', cta: 'Find my freedom date' },
      { title: 'Is a small cash buffer worth having?', body: 'Some people keep about three months of spending in an easy-to-reach savings account, so a surprise bill doesn’t derail things. Others start smaller and build it over time.' },
      { title: 'Could a small, automatic amount work?', body: 'A regular amount moved on payday, even $50 a week, can build the habit and gives compounding longer to work.', href: '/hearmeout', cta: 'See what $50 a week grows into' },
      { title: 'How does compounding work?', body: 'It’s money earning money, which then earns money too. Once it clicks, a lot of the rest makes sense.', href: '/learn/how-compound-interest-works', cta: 'How compounding works' },
    ],
    tools: [
      { href: '/firepath', name: 'Freedom calculator', line: 'Your freedom date and what moves it.' },
      { href: '/compound', name: 'Compound interest', line: 'Watch regular saving grow.' },
      { href: '/hearmeout', name: 'What if…?', line: 'Try “what if I saved more?”' },
    ],
    articles: ['good-savings-rate', 'difference-saving-investing', 'how-much-to-start-investing', 'start-investing-no-experience', 'what-is-an-index-fund', 'why-do-i-feel-behind'],
    faq: [
      { q: 'How much should I save to start?', a: 'There’s no set amount. Some people aim for 10% of take-home pay. Others start smaller and lift it each time their pay goes up, because an amount they can keep up suits them better. It depends on your income, your costs and what you’re saving for.' },
      { q: 'Should I save or invest first?', a: 'Some people build a cash buffer first (often about three months of spending), so a surprise doesn’t force them to sell investments. Others start investing sooner alongside a smaller buffer, to give compounding more time. Investing tends to suit money that won’t be needed for five years or more, as values go up and down. It depends on how steady your income is, any debts and when you’ll need the money. A licensed financial adviser can help you weigh this up for your situation.' },
      { q: 'How much do I need to start investing?', a: 'Not much. Many Australian investing platforms let you start with a few hundred dollars or less. Fees weigh more heavily on small amounts, so many people compare them first.' },
    ] },

  { slug: 'debt', door: 'I’ve got debt', title: 'Got debt?', icon: 'card',
    seoTitle: 'Should I pay off debt or invest? An Australian guide | FirePath',
    description: 'Credit cards, personal loans, buy now pay later, HECS and a mortgage are very different debts. Here’s how Australians often order them, and where investing fits in.',
    lead: 'Here are some techniques people use to work out which debt to reduce first. Not all debt costs the same: a credit card’s rate is often higher than the long-run return assumed for shares, so the order can make a big difference.',
    doorLine: 'Which debt first, and when to start investing.',
    steps: [
      { title: 'What does each debt cost?', body: 'Credit cards, personal and car loans, buy now pay later, HECS/HELP and a mortgage. Many people start by listing each one with its interest rate.' },
      { title: 'Which of your debts costs the most?', body: 'Cards and personal loans often charge 15–20% a year or more. Each dollar paid off saves that much interest, guaranteed. Some people clear the highest rate first (the “avalanche”); others clear the smallest balance first for a quick win (the “snowball”).', href: '/hearmeout?scenario=loan', cta: 'See it paid off' },
      { title: 'Is a small cash buffer worth having alongside?', body: 'A month or two of spending in cash can stop a surprise bill going straight back on the card. Some people build it first; others build it while paying debt down.' },
      { title: 'Can low-rate debt sit alongside investing?', body: 'HECS/HELP is indexed to inflation rather than charged interest, and mortgage rates are usually far below card rates. Some people invest while paying these down normally; others prefer to clear them first for peace of mind.' },
      { title: 'What could the repayments do once a debt is gone?', body: 'Once a debt is paid off, the same repayment amount could go to the next debt, into savings or into investments.', href: '/firepath', cta: 'Find my freedom date' },
    ],
    tools: [
      { href: '/hearmeout?scenario=loan', name: 'Loan payoff', line: 'How fast it goes, and what it costs.' },
      { href: '/firepath', name: 'Freedom calculator', line: 'Your date once the debt is gone.' },
    ],
    articles: ['debt-vs-invest', 'bad-with-money-or-underpaid', 'money-anxiety', 'why-do-i-feel-behind', 'everyone-else-figured-out'],
    faq: [
      { q: 'Should I pay off my credit card or invest?', a: 'It depends on your rates and your situation. Credit card interest is often 15–20% a year or more, and paying it off saves that interest, guaranteed. Shares have historically returned less than that on average, with ups and downs. Some people clear the card first for that certainty; others keep a small amount invested alongside to build the habit. A licensed financial adviser can help you weigh this up for your situation.' },
      { q: 'Should I pay off HECS early?', a: 'People see it differently. HECS/HELP isn’t charged interest. It’s indexed to inflation, and repayments come out of your pay automatically above the threshold. Some people put spare money towards higher-interest debt or investing instead. Others like paying it off early so it’s gone, or because it can affect how much a bank will lend them. It depends on your other debts, your plans and how you feel about owing money.' },
      { q: 'Pay off the mortgage or invest?', a: 'It depends on your mortgage rate, tax rate, timeframe and comfort with risk. Money in an offset account saves your mortgage rate, tax-free and guaranteed. Investing may earn more over time, with more ups and downs. Some people like the certainty of the offset; others prefer the growth potential of investing. A licensed financial adviser can help you weigh this up for your situation.' },
    ] },

  { slug: 'renting', door: 'Renting or saving to buy', title: 'Rent or buy?', icon: 'scale',
    seoTitle: 'Rent or buy in Australia — what it means for early retirement | FirePath',
    description: 'Renting and investing the difference, or buying a home? What each means for when you could stop working in Australia, and how to plan either way.',
    lead: 'There’s no single right answer, and either way can work. Here are some ways people approach it, including what renting in retirement means for the plan.',
    doorLine: 'Rent and invest, or buy? Try both on your numbers.',
    steps: [
      { title: 'What do both paths look like on your numbers?', body: 'Buying builds equity but costs stamp duty, interest and upkeep. Renting can leave more to invest, but only if the difference gets invested.', href: '/hearmeout?scenario=rentvest', cta: 'Compare rent vs buy' },
      { title: 'If renting, would the difference get invested?', body: 'The numbers for renting rely on the money not spent on a mortgage being invested, consistently.' },
      { title: 'If buying, how could the deposit come together?', body: 'The First Home Super Saver Scheme lets eligible first-home buyers save part of a deposit inside super’s lower tax.', href: '/learn/first-home-super-saver', cta: 'How the scheme works' },
      { title: 'Where might you live in retirement?', body: 'Renters need their savings to cover rent for life, so the freedom number is higher. The Age Pension assets test also treats renters differently.', href: '/learn/renting-forever-retirement', cta: 'Renting in retirement' },
    ],
    tools: [
      { href: '/hearmeout?scenario=rentvest', name: 'Rent vs invest', line: 'Both paths, side by side.' },
      { href: '/firepath', name: 'Freedom calculator', line: 'Your date as a renter or owner.' },
    ],
    articles: ['rent-or-buy', 'renting-cheaper-than-owning', 'renting-forever-retirement', 'house-delays-fi', 'first-home-super-saver'],
    faq: [
      { q: 'Is renting a waste of money?', a: 'Not necessarily. Owning has its own costs: interest, rates, upkeep and stamp duty. Some people prefer renting for the flexibility and the chance to invest the difference, which can work out well if that difference is invested. Others prefer owning for security and lower housing costs later. It depends on prices where you live, your timeframe and how you feel about moving.' },
      { q: 'Can I retire early if I rent?', a: 'Many people do, but savings need to cover rent for life, so the freedom number is higher than an owner’s. Building that into the plan from the start keeps it realistic.' },
      { q: 'Does buying a house delay financial independence?', a: 'It can: a big deposit and mortgage repayments can slow investing for years. It can also lower your housing costs later. Which matters more depends on your numbers, local prices and goals. A licensed financial adviser can help you weigh this up for your situation.' },
    ] },

  { slug: 'building-wealth', door: 'Building wealth', title: 'Already saving?', icon: 'bars',
    seoTitle: 'How to reach financial independence faster in Australia | FirePath',
    description: 'Already saving and investing? What moves your freedom date most in Australia: savings rate, where your money sits, salary sacrifice, offset vs invest and Coast FIRE.',
    lead: 'Once the basics are in place, a few things tend to do most of the work. Here are some ways people approach it. FirePath shows how much each could move your date, in years.',
    doorLine: 'The few things that move your date most.',
    steps: [
      { title: 'How much does your savings rate matter?', body: 'Saving more works twice: more invested now, and a smaller number to reach if you also spend less.', href: '/firepath', cta: 'See what moves your date' },
      { title: 'Is your money working?', body: 'Cash above a buffer barely keeps up with inflation. Low-cost diversified funds have historically grown far faster over the long run, with more ups and downs along the way.', href: '/learn/what-is-an-index-fund', cta: 'Index funds explained' },
      { title: 'Could super’s tax break suit you?', body: 'On a 30%+ tax rate, salary sacrificing into super is taxed at 15% instead. It’s locked until 60, so some people balance it with money they can reach sooner.', href: '/learn/salary-sacrifice-explained', cta: 'Salary sacrifice explained' },
      { title: 'Could easing off be an option?', body: 'Coast FIRE is the point where your savings would reach your number by retirement without adding more, so part-time work could cover your bills from here.', href: '/freedom-gap', cta: 'See your freedom gap' },
    ],
    tools: [
      { href: '/firepath', name: 'Freedom calculator', line: 'Every change, shown in years.' },
      { href: '/freedom-gap', name: 'Freedom gap', line: 'What part-time work could cover.' },
      { href: '/compound', name: 'Compound interest', line: 'What regular investing grows into.' },
    ],
    articles: ['what-is-an-index-fund', 'etfs-how-to-buy', 'salary-sacrifice-explained', 'super-vs-outside-investing', 'what-is-coast-fire', 'four-percent-rule-australia'],
    faq: [
      { q: 'What savings rate do I need to retire early?', a: 'There’s no single number, but the higher it is, the sooner the date tends to come. Some people aiming for early retirement save 30–50% of take-home pay; others save less and aim for a later date or part-time work. FirePath shows what your own rate means in years.' },
      { q: 'Should I invest inside or outside super?', a: 'It depends on your age, tax rate and when you might stop work. Super is taxed less but locked until 60; investing outside super can be reached any time. Some people lean on super for the tax savings; others keep more outside for flexibility, as stopping work before 60 means money outside super has to bridge the gap. A licensed financial adviser can help you weigh this up for your situation.' },
      { q: 'What is Coast FIRE?', a: 'The point where your existing savings would grow to your freedom number by retirement age without adding more, so you’d only need to cover today’s costs.' },
    ] },

  { slug: 'retirement', door: 'Nearly or already retired', title: 'Will it last?', icon: 'shield',
    seoTitle: 'Will my money last in retirement? An Australian guide | FirePath',
    description: 'Nearly retired or already there? How to check your money lasts in Australia: withdrawal rates, the years before you can get to your super at 60, the Age Pension at 67 and a bad market early on.',
    lead: 'Close to the finish line, the big question becomes “will my money last?” Here are some ways people approach it, honestly.',
    doorLine: 'Withdrawal rates, super at 60, the Age Pension.',
    steps: [
      { title: 'How much could you draw each year?', body: 'Markets don’t return the average every year. The Withdrawal planner tests a withdrawal rate across thousands of possible market outcomes, including a bad run early on.', href: '/withdrawal', cta: 'Try the Withdrawal planner' },
      { title: 'How would you bridge the years before 60?', body: 'Super is locked until preservation age (60). If you stop earlier, money outside super has to carry you until then.', href: '/learn/before-super-access', cta: 'Before you can access super' },
      { title: 'What could the Age Pension add from 67?', body: 'Depending on your assets and income, the Age Pension may top up what your savings pay. It’s means-tested, so it changes as your balance does.', href: '/freedom-gap', cta: 'See what it adds' },
      { title: 'Is a cash buffer for bad years worth having?', body: 'Some retirees keep a year or two of spending in cash so they don’t have to sell investments during a downturn. Others keep less in cash so more stays invested.', href: '/learn/volatility-emotional-side', cta: 'The emotional side of volatility' },
    ],
    tools: [
      { href: '/withdrawal', name: 'Withdrawal planner', line: 'The odds your money lasts.' },
      { href: '/freedom-gap', name: 'Freedom gap', line: 'Age Pension and part-time work.' },
      { href: '/retirement-age-calculator', name: 'Retirement age calculator', line: 'A quick estimate of when work could become optional.' },
    ],
    articles: ['four-percent-rule-australia', 'before-super-access', 'is-my-super-enough', 'when-can-i-actually-retire', 'super-balance-at-60', 'volatility-emotional-side'],
    faq: [
      { q: 'Does the 4% rule work in Australia?', a: 'It’s a starting point many people use, not a guarantee. It came from US data over 30-year retirements; longer retirements, fees and a bad early run all matter. Some people use a lower rate for extra margin; others adjust their spending year to year. Testing a rate across many possible market outcomes shows the range. A licensed financial adviser can help you work out what suits your situation.' },
      { q: 'When can I access my super?', a: 'Generally from your preservation age (60 for anyone born after 30 June 1964) once you retire, or from 65 regardless.' },
      { q: 'Will I get the Age Pension?', a: 'It depends on your age (67+), assets and income. Homeowners and renters have different asset limits, and many people with savings still receive a part pension. Services Australia can give an estimate based on your circumstances.' },
    ] },
];
