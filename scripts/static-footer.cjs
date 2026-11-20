#!/usr/bin/env node
/**
 * After the build: give the hand-written pages (public/*.html) the same site footer the Astro
 * pages have in their HTML (src/components/SiteFooter.astro), so search engines see its links
 * without running JavaScript. Taken from the built home page, so there is one source.
 *
 * - Site pages get the footer, unless they ask for none (data-footer="none").
 * - Public app pages (data-public="true") switch to the site layout for visitors, so they get it
 *   marked data-site-only: js/shell.js hides it when it draws the Pro app layout instead.
 * - js/shell.js skips drawing its own footer when one is already in the page.
 *
 *   node scripts/static-footer.cjs   (run by `npm run build`, after astro build)
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const home = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const m = home.match(/<footer class="site-footer"[\s\S]*?<\/footer>/);
if (!m) { console.error('static-footer: no footer in dist/index.html'); process.exit(1); }
const footer = m[0];

let added = 0;
for (const f of fs.readdirSync(DIST)) {
  if (!f.endsWith('.html')) continue;
  const file = path.join(DIST, f);
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('class="site-footer"')) continue;
  const bodyTag = (html.match(/<body[^>]*>/) || [''])[0];
  if (/data-footer="none"/.test(bodyTag)) continue;
  const shell = (bodyTag.match(/data-shell="([a-z]+)"/) || [])[1];
  let out;
  if (shell === 'site') out = footer;
  else if (shell === 'app' && /data-public="true"/.test(bodyTag)) out = footer.replace('<footer class="site-footer"', '<footer class="site-footer" data-site-only');
  else continue;
  const at = html.lastIndexOf('</body>');
  if (at < 0) continue;
  fs.writeFileSync(file, html.slice(0, at) + out + '\n' + html.slice(at));
  added++;
}
console.log(`static-footer: added to ${added} page(s)`);
