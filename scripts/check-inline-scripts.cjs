#!/usr/bin/env node
/* Syntax-checks every inline <script> in public/*.html.
 *
 * Each inline script that isn't data (JSON, JSON-LD, templates) is compiled with
 * `new Function` — compiled, never run — so a stray bracket or quote is caught
 * before it reaches the live site. HTML comments are stripped first, so a
 * commented-out <script> (e.g. in firepath_pro.html) isn't mistaken for real code.
 *
 * Usage: node scripts/check-inline-scripts.cjs   (exits 1 if any script fails)
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_TYPES = /^(application\/(ld\+)?json|application\/importmap\+json|importmap|text\/template|text\/x-template|text\/html|text\/plain)$/i;
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;

const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.html')).sort();
let checked = 0;
const errors = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  // Blank out comments but keep their newlines, so line numbers stay right.
  const html = raw.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const body = m[2];
    if (/\bsrc\s*=/i.test(attrs)) continue;            // external file, not inline
    if (!body.trim()) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = typeMatch ? typeMatch[1] : '';
    if (DATA_TYPES.test(type)) continue;
    if (!JS_TYPES.test(type)) continue;                 // unknown type: browsers don't run it
    const line = html.slice(0, m.index).split('\n').length;
    checked++;
    if (type.toLowerCase() === 'module') {
      // `new Function` can't parse import/export; check the rest by dropping
      // top-level import/export keywords only.
      const stripped = body
        .replace(/^\s*import\s[^;]*;?/gm, '')
        .replace(/^\s*export\s+(default\s+)?/gm, '');
      try { new Function(stripped); } catch (e) { errors.push(`${file}:${line} (module) ${e.message}`); }
      continue;
    }
    try {
      new Function(body);
    } catch (e) {
      errors.push(`${file}:${line} ${e.name}: ${e.message}`);
    }
  }
}

if (errors.length) {
  console.error(`Inline script check: ${errors.length} problem(s) in ${checked} script(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`Inline script check: ${checked} inline script(s) in ${files.length} page(s), all fine.`);
