/**
 * Populate the learning_articles table from the /learn/ article pages.
 * ====================================================================
 * Run once, and again whenever you edit an article, so Learning Lab serves
 * lessons from the database instead of fetching + parsing the public pages.
 * Safe to re-run: rows are upserted by topic_id.
 *
 * Which lessons get which article comes from STATIC_TOPIC_MAP in
 * learning_lab.html — the same list the page uses — so the two can't drift.
 *
 * Talks to Supabase directly with the service role key (an admin task, never
 * exposed to users). The key is read from the environment and never stored.
 *
 * Usage (from the repo root):
 *   node js/populate-learning-articles.js --dry-run            # check every article, upload nothing
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   node js/populate-learning-articles.js                       # upload
 *
 * Both values: Supabase dashboard → Project Settings → API.
 * NEVER put the service role key in client-side code or commit it to git.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEARN_DIR = path.join(ROOT, 'learn');
const DRY_RUN = process.argv.includes('--dry-run');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!DRY_RUN && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) || !SERVICE_ROLE_KEY)) {
  console.error('Set SUPABASE_URL (https://<project>.supabase.co) and SUPABASE_SERVICE_ROLE_KEY, or use --dry-run. Aborting.');
  process.exit(1);
}

// Works out what kind of key was supplied — without ever printing it — so a
// wrong key gets a clear message instead of 47 "Invalid API key" errors.
//   sb_secret_…      new-style secret key   → sent in the apikey header only
//   eyJ… (JWT)       legacy key              → role/project read from its claims
function describeKey(key, url) {
  if (key.startsWith('sb_secret_')) return { ok: true, kind: 'new-style secret key', headers: { apikey: key } };
  if (key.startsWith('sb_publishable_')) return { ok: false, why: 'That is the publishable key. Use the SECRET key (starts with sb_secret_) from Project Settings → API Keys.' };
  const parts = key.split('.');
  if (parts.length === 3) {
    let claims = {};
    try { claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch {}
    const projectRef = (url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/) || [])[1];
    if (claims.role === 'anon') return { ok: false, why: 'That is the anon (public) key. Use the service_role key, or the new secret key (sb_secret_…).' };
    if (claims.role !== 'service_role') return { ok: false, why: `That key's role is "${claims.role || 'unknown'}", not service_role.` };
    if (projectRef && claims.ref && claims.ref !== projectRef) return { ok: false, why: `That key belongs to a different Supabase project (${claims.ref}), not ${projectRef}.` };
    return { ok: true, kind: 'legacy service_role key', headers: { apikey: key, Authorization: `Bearer ${key}` } };
  }
  return { ok: false, why: `That doesn't look like a Supabase key (${key.length} characters). Check nothing extra was pasted.` };
}
const KEY = DRY_RUN ? null : describeKey(SERVICE_ROLE_KEY, SUPABASE_URL);
if (KEY && !KEY.ok) { console.error(`Key problem: ${KEY.why}`); process.exit(1); }
if (KEY) console.log(`Using a ${KEY.kind} for ${SUPABASE_URL}`);

// Track (foundation / life / …) per article, used only as a label in the table.
const SLUG_TO_TOPIC = {
  'what-is-fire-australia': { topicId: 'what-is-fire', track: 'foundation' },
  'how-compound-interest-works': { topicId: 'compounding', track: 'foundation' },
  'difference-saving-investing': { topicId: 'saving-vs-investing', track: 'foundation' },
  'two-phase-freedom-timeline': { topicId: 'two-phase', track: 'foundation' },
  'catch-up-contributions': { topicId: 'catch-up-contributions', track: 'tax' },
  'super-co-contribution': { topicId: 'super-co-contribution', track: 'tax' },
  'spouse-contribution-offset': { topicId: 'spouse-contribution-offset', track: 'tax' },
  'cgt-discount': { topicId: 'cgt-discount', track: 'tax' },
  'first-home-super-saver': { topicId: 'first-home-super-saver', track: 'tax' },
  'division-293': { topicId: 'division-293', track: 'tax' },
  'what-is-a-bond': { topicId: 'bonds', track: '5' },
  'high-interest-savings-vs-term-deposits': { topicId: 'hisa', track: '5' },
  'balanced-funds-explained': { topicId: 'balanced-funds', track: '5' },
  'what-diversification-means': { topicId: 'diversification', track: '5' },
  'why-inflation-is-your-enemy': { topicId: 'inflation', track: '5' },
  'what-is-an-index-fund': { topicId: 'index-funds', track: '7' },
  'etfs-how-to-buy': { topicId: 'etf-how', track: '7' },
  'compounding-with-your-numbers': { topicId: 'compounding-numbers', track: '7' },
  'dollar-cost-averaging': { topicId: 'dca', track: '7' },
  'australian-vs-global-shares': { topicId: 'aus-vs-global', track: '7' },
  'four-percent-rule-australia': { topicId: 'four-percent', track: '7' },
  'tax-and-investing-australia': { topicId: 'tax-basics', track: '7' },
  'individual-shares-how-they-work': { topicId: 'individual-shares', track: '10' },
  'property-investing-explained': { topicId: 'property', track: '10' },
  'dividends-vs-capital-growth': { topicId: 'dividends', track: '10' },
  'franking-credits-australia': { topicId: 'franking', track: '10' },
  'am-i-behind-financially': { topicId: 'am-i-behind-financially', track: 'life' },
  'savings-by-age': { topicId: 'savings-by-age', track: 'life' },
  'am-i-on-track-retirement': { topicId: 'am-i-on-track', track: 'life' },
  'how-long-do-i-have-to-work': { topicId: 'how-long-do-i-have-to-work', track: 'life' },
  'what-is-coast-fire': { topicId: 'what-is-coast-fire', track: 'life' },
  'can-i-work-less': { topicId: 'can-i-work-less', track: 'life' },
  'why-do-i-feel-behind': { topicId: 'why-do-i-feel-behind', track: 'life' },
  'no-savings-in-your-30s': { topicId: 'no-savings-in-30s', track: 'life' },
  'money-anxiety': { topicId: 'money-anxiety', track: 'life' },
  'too-late-to-invest-at-40': { topicId: 'too-late-at-40', track: 'life' },
  'retire-early-average-income': { topicId: 'retire-average-income', track: 'life' },
  'kids-and-retirement-timeline': { topicId: 'kids-and-retirement', track: 'life' },
  'rent-or-buy': { topicId: 'rent-or-buy', track: 'life' },
  'renting-forever-retirement': { topicId: 'renting-forever', track: 'life' },
  'pay-rise-retirement-impact': { topicId: 'pay-rise-impact', track: 'life' },
  'extra-50-a-week-impact': { topicId: 'extra-50-a-week', track: 'life' },
  'redundancy-would-i-be-okay': { topicId: 'redundancy-okay', track: 'life' },
};

function extractField(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

// topic_id -> article slug, read straight from learning_lab.html.
function loadTopicMap() {
  const page = fs.readFileSync(path.join(ROOT, 'learning_lab.html'), 'utf-8');
  const block = page.match(/const STATIC_TOPIC_MAP\s*=\s*\{([\s\S]*?)\};/);
  if (!block) throw new Error('STATIC_TOPIC_MAP not found in learning_lab.html');
  const map = {};
  for (const [, topic, slug] of block[1].matchAll(/'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g)) map[topic] = slug;
  return map;
}

// Inner HTML of the first <div class="article-body">, matching nested divs —
// works for every article layout (some end in .cta-box, newer ones in .cta-row).
function extractArticleBody(html) {
  const start = html.indexOf('<div class="article-body">');
  if (start === -1) return null;
  const open = start + '<div class="article-body">'.length;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = open;
  let depth = 1, m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index).trim();
  }
  return null;
}

function parseArticle(slug, html) {
  const title = extractField(html, /<title>([^<]*?)(?:\s*(?:\||—)\s*FirePath)?\s*<\/title>/);
  const metaDescription = extractField(html, /<meta name="description" content="([^"]*)"/);
  const bodyHtml = extractArticleBody(html);

  if (!title || !bodyHtml) {
    throw new Error(`Could not parse required fields from ${slug}.html — title: ${!!title}, body: ${!!bodyHtml}`);
  }
  return { title, metaDescription, bodyHtml };
}

async function upsertRow(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/learning_articles?on_conflict=topic_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...KEY.headers,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert failed for ${row.topic_id}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const topics = Object.entries(loadTopicMap());
  console.log(`${DRY_RUN ? 'Checking' : 'Populating'} ${topics.length} lessons${DRY_RUN ? ' (dry run — nothing uploaded)' : ' into learning_articles'}...\n`);
  let success = 0, failed = 0;

  for (const [topicId, slug] of topics) {
    const filePath = path.join(LEARN_DIR, `${slug}.html`);
    try {
      if (!fs.existsSync(filePath)) throw new Error(`File not found: learn/${slug}.html`);
      const { title, metaDescription, bodyHtml } = parseArticle(slug, fs.readFileSync(filePath, 'utf-8'));
      const row = {
        topic_id: topicId,
        slug,
        title,
        meta_description: metaDescription,
        track: SLUG_TO_TOPIC[slug] ? SLUG_TO_TOPIC[slug].track : null,
        body_html: bodyHtml,
        updated_at: new Date().toISOString(),
      };
      if (!DRY_RUN) await upsertRow(row);
      console.log(`  ✓ ${topicId.padEnd(26)} ← learn/${slug}.html  (${bodyHtml.length.toLocaleString()} chars)`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${topicId}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} ${DRY_RUN ? 'parsed' : 'upserted'}, ${failed} failed.`);
  if (failed > 0) {
    console.log('Fix the failures above and re-run — this script is safe to run multiple times (upserts by topic_id).');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
