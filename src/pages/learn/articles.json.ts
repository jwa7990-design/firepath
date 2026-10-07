/**
 * /learn/articles.json — the article list for pages that recommend reading in the
 * browser (FirePathMoves.articleFits filters it by situation). Built at deploy time.
 */
import { ARTICLES } from '../../lib/learn';

export function GET() {
  const list = ARTICLES.map(a => ({
    slug: a.slug, heading: a.heading, description: a.description, badge: a.badge,
    readMins: a.readMins, for: a.for || null,
  }));
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } });
}
