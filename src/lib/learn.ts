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
