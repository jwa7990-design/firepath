/**
 * /sitemap.xml — built from the real pages on every deploy, so it can't go stale.
 * Lists public pages only: the site pages, every Learning Lab article, the "Start where
 * you are" pages and the free tools. Pro and account pages are left out (and marked
 * noindex on the pages themselves).
 */
import { ARTICLES, SHELVES } from '../lib/learn';
import { STARTS } from '../data/starts';
// When each page last changed (scripts/content-dates.cjs, from git, before every build).
import DATES from '../data/content-dates.json';

const SITE = 'https://www.firepath.pro';
const PAGES = ['/', '/features', '/pricing', '/faq', '/assumptions', '/privacy', '/terms', '/learn/'];
const FREE_TOOLS = ['/firepath', '/hearmeout', '/withdrawal', '/freedom-gap', '/compound'];

export function GET() {
  const urls = [
    ...PAGES.map(p => [p, p === '/' ? '1.0' : '0.8']),
    ...FREE_TOOLS.map(p => [p, p === '/firepath' ? '0.9' : '0.8']),
    ['/retirement-age-calculator', '0.9'],
    ...STARTS.map(s => [`/start/${s.slug}`, '0.8']),
    ...SHELVES.map(sh => [`/learn/shelf/${sh.id}`, '0.6']),
    ...ARTICLES.map(a => [`/learn/${a.slug}`, '0.7']),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, pr]) => {
  const mod = (DATES as Record<string, { modified: string }>)[p]?.modified;
  return `  <url><loc>${SITE}${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<priority>${pr}</priority></url>`;
}).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
