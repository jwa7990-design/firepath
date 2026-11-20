/**
 * The site footer exists twice: in the page HTML on the Astro pages (src/components/SiteFooter.astro,
 * so search engines see the links) and drawn by js/shell.js on the hand-written pages. They must
 * say the same thing: same links, same headings, and the legal line word for word.
 *
 *   node --test tests/footer.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const astro = fs.readFileSync(path.join(root, 'src/components/SiteFooter.astro'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'public/js/shell.js'), 'utf8');
const shellFooter = shell.slice(shell.indexOf('<footer class="site-footer">'), shell.indexOf('</footer>') + 9);
const astroFooter = astro.slice(astro.indexOf('<footer class="site-footer">'), astro.indexOf('</footer>') + 9);

// The same clean address shell.js's url() gives (no .html, index.html → the folder).
const clean = p => '/' + p.replace(/(^|\/)index\.html(?=$|[?#])/, '$1').replace(/\.html(?=$|[?#])/, '');
const links = (html, fromShell) => [...html.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)]
  .map(m => [fromShell ? clean(m[1].replace(/^\$\{url\('([^']*)'\)\}$/, '$1')) : m[1], m[2]]);
const headings = html => [...html.matchAll(/<h4>([^<]+)<\/h4>/g)].map(m => m[1]);
const legal = html => (html.match(/<div class="site-footer-legal">([\s\S]*?)<\/div>/) || [])[1].replace(/\$\{year\}|\{year\}/, 'YEAR');

test('both footers were found', () => {
  assert.ok(shellFooter.length > 100 && astroFooter.length > 100);
});
test('same headings, in the same order', () => {
  assert.deepStrictEqual(headings(astroFooter), headings(shellFooter));
});
test('same links and labels, in the same order', () => {
  assert.deepStrictEqual(links(astroFooter, false), links(shellFooter, true));
});
test('the legal line is word for word the same', () => {
  assert.strictEqual(legal(astroFooter), legal(shellFooter));
});
