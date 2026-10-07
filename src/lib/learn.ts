/**
 * Learning Lab articles. Each article lives in src/content/learn/<slug>.html as a
 * leading `<!--meta {...} -->` comment (title, description, badge, heading, call to
 * action) followed by the article's body HTML, exactly as written.
 */
export interface ArticleLink { href: string; label: string; secondary?: boolean; }
export interface ArticleMeta {
  title: string; description: string; keywords?: string | null; badge: string; heading: string;
  sub?: string | null;
  cta?: { heading?: string | null; text?: string | null; links: ArticleLink[] };
  seeAlso?: ArticleLink[];
  /** Who it's for — articles that only suit some people. Checked by FirePathMoves.articleFits
   *  (public/js/moves.js) so an article is never recommended to someone it doesn't fit.
   *  ages [min, max] · housing ['renting'|'mortgage'|'owner'] · partner · kids · minGross · maxGross · maxSuper */
  for?: { ages?: [number, number]; housing?: string[]; partner?: boolean; kids?: boolean; minGross?: number; maxGross?: number; maxSuper?: number };
}
export interface Article extends ArticleMeta {
  slug: string; body: string; readMins: number; sections: { id: string; title: string }[];
}

const files = import.meta.glob('../content/learn/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const slugify = (s: string) => s.toLowerCase().replace(/&[a-z#0-9]+;/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

function parse(path: string, raw: string): Article {
  const slug = path.split('/').pop()!.replace(/\.html$/, '');
  const m = raw.match(/^<!--meta ([\s\S]*?) -->\n?/);
  if (!m) throw new Error(`${slug}: missing <!--meta --> header`);
  const meta = JSON.parse(m[1]) as ArticleMeta;
  let html = raw.slice(m[0].length);
  // Give each section heading an id (for the contents list) and mark it for the
  // contents tracker. The article text itself is untouched.
  const sections: { id: string; title: string }[] = [];
  const used = new Set<string>();
  html = html.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (_all, attrs = '', inner) => {
    let id = slugify(inner) || 'section';
    while (used.has(id)) id += '-2';
    used.add(id);
    sections.push({ id, title: plain(inner) });
    return `<h2${attrs} id="${id}" data-doc-section>${inner}</h2>`;
  });
  const words = plain(html).split(' ').length;
  return { ...meta, slug, body: html, readMins: Math.max(2, Math.round(words / 230)), sections };
}

export const ARTICLES: Article[] = Object.entries(files)
  .map(([p, raw]) => parse(p, raw))
  .sort((a, b) => a.slug.localeCompare(b.slug));

// Three related articles: same track first, then the wider group (e.g. all "Tax & Strategy"),
// then Foundation — always in a stable order.
export function relatedTo(a: Article, n = 3): Article[] {
  const group = a.badge.split(' · ')[0];
  const pools = [
    ARTICLES.filter(x => x.badge === a.badge),
    ARTICLES.filter(x => x.badge.split(' · ')[0] === group),
    ARTICLES.filter(x => x.badge === 'Foundation'),
    ARTICLES,
  ];
  const out: Article[] = [];
  for (const pool of pools) {
    const i = pool.findIndex(x => x.slug === a.slug);
    const ordered = i >= 0 ? [...pool.slice(i + 1), ...pool.slice(0, i)] : pool;   // the ones after this, wrapping
    for (const x of ordered) if (x.slug !== a.slug && !out.includes(x) && out.length < n) out.push(x);
  }
  return out;
}

/**
 * How the hub (/learn/) groups articles. Any article not listed in a theme is placed
 * by its track badge, so a new article always appears somewhere.
 */
export interface Shelf { id: string; title: string; intro: string; icon: string; themes?: { title: string; slugs: string[] }[]; badges?: string[]; }
export const FIRST_READS = ['what-is-fire-australia', 'how-compound-interest-works', 'two-phase-freedom-timeline'];
export const SHELVES: Shelf[] = [
  { id: 'start', title: 'Start here', icon: 'flame', intro: 'The ideas everything else builds on: what FIRE is, how compounding works, and how much is enough.', badges: ['Foundation'] },
  { id: 'questions', title: 'Real questions', icon: 'chat', intro: 'Honest answers to the things people wonder about money. No judgement, real numbers.', themes: [
    { title: 'Where you stand', slugs: ['am-i-behind-financially', 'savings-by-age', 'am-i-on-track-retirement', 'how-much-is-enough', 'why-do-i-feel-behind', 'no-savings-in-your-30s'] },
    { title: 'Time and freedom', slugs: ['how-long-do-i-have-to-work', 'what-is-coast-fire', 'can-i-work-less', 'retire-early-average-income'] },
    { title: 'Money and mindset', slugs: ['money-anxiety', 'everyone-else-figured-out', 'bad-with-money-or-underpaid'] },
    { title: 'Home and renting', slugs: ['rent-or-buy', 'renting-cheaper-than-owning', 'renting-forever-retirement', 'house-delays-fi', 'what-if-sold-house', 'retire-early-bought-house-late'] },
    { title: 'What if…', slugs: ['pay-rise-retirement-impact', 'pay-cut-happier-job', 'redundancy-would-i-be-okay', 'extra-50-a-week-impact', 'too-late-to-invest-at-40'] },
    { title: 'Your life stage', slugs: ['kids-and-retirement-timeline', 'retire-early-single-parent'] },
  ], badges: ['Real Questions', 'Freedom Timeline'] },
  { id: 'toolkit', title: 'The FIRE toolkit', icon: 'bars', intro: 'Index funds, ETFs, the 4% rule and the tax basics. The core of investing for independence.', badges: ['FIRE Standard'] },
  { id: 'growth', title: 'Growth investing', icon: 'spark', intro: 'Shares, property, dividends and the emotional side of watching markets move.', badges: ['Growth Focused'] },
  { id: 'steady', title: 'Playing it steady', icon: 'shield', intro: 'Savings accounts, bonds, balanced funds and spreading your risk sensibly.', badges: ['Steady & Safe'] },
  { id: 'super-tax', title: 'Super and tax', icon: 'scale', intro: 'Salary sacrifice, catch-up contributions, Division 293, the CGT discount and more. The Australian rules that change your date.', badges: ['Super', 'Tax & Strategy · Superannuation', 'Tax & Strategy · Investing', 'Tax & Strategy · Property'] },
];

/** Articles for each shelf (and theme), in reading order. Every article lands exactly once. */
export function shelve() {
  const bySlug = new Map(ARTICLES.map(a => [a.slug, a]));
  const placed = new Set<string>();
  const shelves = SHELVES.map(s => {
    const themes = (s.themes || []).map(t => ({ title: t.title, articles: t.slugs.map(x => bySlug.get(x)).filter((a): a is Article => !!a) }));
    themes.forEach(t => t.articles.forEach(a => placed.add(a.slug)));
    return { ...s, themes, articles: [] as Article[] };
  });
  for (const a of ARTICLES) {
    if (placed.has(a.slug)) continue;
    const shelf = shelves.find(s => s.badges?.includes(a.badge)) || shelves[0];
    if (shelf.themes.length) { (shelf.themes.find(t => t.title === 'More') || (shelf.themes.push({ title: 'More', articles: [] }), shelf.themes[shelf.themes.length - 1])).articles.push(a); }
    else shelf.articles.push(a);
    placed.add(a.slug);
  }
  return shelves.map(s => ({ ...s, count: s.articles.length + s.themes.reduce((n, t) => n + t.articles.length, 0) }));
}
