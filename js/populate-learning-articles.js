/**
 * Populate learning_articles table from existing /learn/ HTML files.
 * ====================================================================
 * Run this ONCE (and again whenever you edit an article) to sync the
 * static file content into Supabase, so Learning Lab can serve it from
 * the database instead of fetching + regex-parsing live HTML.
 *
 * This talks to Supabase DIRECTLY using a service role key — NOT through
 * the client-facing Worker — because this is an admin/content task, not
 * something end users should be able to trigger.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=your_key node populate-learning-articles.js
 *
 * Get the service role key from: Supabase dashboard → Project Settings → API
 * NEVER put this key in client-side code or commit it to git.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://qwlkpfrpzpswvedtcclj.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEARN_DIR = path.join(__dirname, 'learn'); // adjust if your /learn/ folder lives elsewhere

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Aborting.');
  process.exit(1);
}

// slug -> { topicId, track }  — same mapping as STATIC_TOPIC_MAP in learning_lab.html, reversed
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

function parseArticle(slug, html) {
  const title = extractField(html, /<title>([^<]*?)\s*\|\s*FirePath<\/title>/);
  const metaDescription = extractField(html, /<meta name="description" content="([^"]*)"/);
  const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<div class="cta-box">/);
  const bodyHtml = bodyMatch ? bodyMatch[1].trim() : null;

  if (!title || !bodyHtml) {
    throw new Error(`Could not parse required fields from ${slug}.html — title: ${!!title}, body: ${!!bodyHtml}`);
  }
  return { title, metaDescription, bodyHtml };
}

async function upsertRow(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/learning_articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert failed for ${row.topic_id}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const slugs = Object.keys(SLUG_TO_TOPIC);
  console.log(`Populating ${slugs.length} articles into learning_articles...\n`);

  let success = 0;
  let failed = 0;

  for (const slug of slugs) {
    const filePath = path.join(LEARN_DIR, `${slug}.html`);
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const html = fs.readFileSync(filePath, 'utf-8');
      const { title, metaDescription, bodyHtml } = parseArticle(slug, html);
      const { topicId, track } = SLUG_TO_TOPIC[slug];

      await upsertRow({
        topic_id: topicId,
        slug,
        title,
        meta_description: metaDescription,
        track,
        body_html: bodyHtml,
        updated_at: new Date().toISOString(),
      });

      console.log(`  ✓ ${slug} -> topic_id: ${topicId}`);
      success++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${slug} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log('Fix the failures above and re-run — this script is safe to run multiple times (upserts by topic_id).');
  }
}

main();
