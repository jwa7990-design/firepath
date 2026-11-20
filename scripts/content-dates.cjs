#!/usr/bin/env node
/**
 * When each public page was first published and last changed, from git history, written to
 * src/data/content-dates.json for the sitemap (<lastmod>) and the articles' schema and
 * "Updated" line. Runs before every build. Where git history isn't there (a shallow clone,
 * or no git at all), the committed file is kept as it is, so a build never loses the dates.
 *
 *   node scripts/content-dates.cjs
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src/data/content-dates.json');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') throw new Error('shallow');
} catch (e) {
  console.log('content-dates: no full git history here, keeping the committed dates');
  process.exit(0);
}

// Sitemap path → the file it's built from. "Start where you are" and the shelf pages are
// built from shared files, so they get no date rather than a misleading one.
const sources = {
  '/': 'src/pages/index.astro',
  '/learn/': 'src/pages/learn/index.astro',
  '/retirement-age-calculator': 'src/pages/retirement-age-calculator.astro',
};
for (const p of ['features', 'pricing', 'faq', 'assumptions', 'privacy', 'terms']) sources[`/${p}`] = `src/pages/${p}.astro`;
for (const p of ['firepath', 'hearmeout', 'withdrawal', 'freedom-gap', 'compound']) sources[`/${p}`] = `public/${p}.html`;
for (const f of fs.readdirSync(path.join(ROOT, 'src/content/learn'))) {
  if (f.endsWith('.html')) sources[`/learn/${f.replace(/\.html$/, '')}`] = `src/content/learn/${f}`;
}

const dates = {};
for (const [url, file] of Object.entries(sources)) {
  if (!fs.existsSync(path.join(ROOT, file))) continue;
  // --follow keeps the history across moves (articles moved from public/learn/ into src/content/).
  const log = git(['log', '--follow', '--format=%cs', '--', file]).split('\n').filter(Boolean);
  if (!log.length) continue;
  // Articles and the home page lived in public/ before the Astro move: count their first day there.
  const old = url.startsWith('/learn/') && url !== '/learn/' ? `public${url}.html` : url === '/' ? 'public/index.html' : `public${url}.html`;
  const before = old !== file ? git(['log', '--format=%cs', '--', old]).split('\n').filter(Boolean) : [];
  const first = [...log, ...before].sort()[0];
  dates[url] = { published: first, modified: log[0] };
}

const sorted = Object.fromEntries(Object.keys(dates).sort().map(k => [k, dates[k]]));
const json = JSON.stringify(sorted, null, 2) + '\n';
if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== json) fs.writeFileSync(OUT, json);
console.log(`content-dates: ${Object.keys(sorted).length} pages dated`);
