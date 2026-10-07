/**
 * Share images and site icons — run after adding or retitling an article or start page:
 *   node scripts/og-images.cjs
 *
 * Writes (committed, served as-is from public/):
 *   public/og/default.png             site-wide share image (1200×630)
 *   public/og/learn/<slug>.png        one per Learning Lab article
 *   public/og/start/<slug>.png        one per "Start where you are" page
 *   public/icons/*.png, favicon.svg   browser, home-screen and Apple icons
 * Text is drawn as shapes from the brand fonts (scripts/og-fonts), so the images look
 * the same on any machine.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const font = f => opentype.loadSync(path.join(__dirname, 'og-fonts', f));
const F = {
  display: font('playfair-display-700-normal.woff'),
  displayItalic: font('playfair-display-700-italic.woff'),
  ui: font('dm-sans-500-normal.woff'),
  uiBold: font('dm-sans-600-normal.woff'),
};
const C = { bg: '#FDF6EE', ink: '#2B1D14', ink2: '#65544A', ink3: '#9A8A80', ember: '#F4622A', emberInk: '#C4480F', amber: '#F9A825', espresso: '#241910', line: '#EDE3DA' };
const FLAME = 'M12 22c4.5 0 7-2.8 7-6.8 0-2.8-1.4-4.8-2.8-6.5 0 1.8-.9 2.8-1.8 2.8.4-2.8-.9-4.8-2.7-7.3-.9 2.8-3.6 4.6-3.6 9 0 .9.2 1.8.5 2.7-1-.6-1.7-1.6-1.9-3-1.1 1.8-1.4 3.6-1.4 4.8 0 4 3.2 6.8 7.2 6.8z';

const text = (f, str, x, y, size, fill) => `<path d="${f.getPath(str, x, y, size).toPathData(2)}" fill="${fill}"/>`;
const width = (f, str, size) => f.getAdvanceWidth(str, size);

// Greedy word wrap into at most `maxLines`, shrinking the size until it fits.
function wrap(f, str, maxW, sizes, maxLines) {
  for (const size of sizes) {
    const words = str.split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (width(f, next, size) <= maxW) line = next; else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(l => width(f, l, size) <= maxW)) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(f, str, maxW, [size], 99).lines.slice(0, maxLines).map((l, i, a) => i === a.length - 1 ? l.replace(/\s*\S*$/, '…') : l) };
}

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g1" cx="1" cy="0" r="0.75"><stop offset="0" stop-color="${C.amber}" stop-opacity="0.32"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="0" cy="1" r="0.7"><stop offset="0" stop-color="${C.ember}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.ember}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${C.bg}"/><rect width="1200" height="630" fill="url(#g1)"/><rect width="1200" height="630" fill="url(#g2)"/>
  <g transform="translate(80 64) scale(1.9)"><path d="${FLAME}" fill="none" stroke="${C.ember}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>
  ${text(F.display, 'Fire', 132, 100, 38, C.ink)}${text(F.display, 'Path', 132 + width(F.display, 'Fire', 38), 100, 38, C.ember)}
  ${inner}
  <rect x="80" y="560" width="1040" height="1" fill="${C.line}"/>
  ${text(F.ui, 'firepath.pro', 80, 600, 24, C.ink3)}
</svg>`;
}

function card({ eyebrow, title, accent, footer }) {
  const titleFont = F.display;
  const { size, lines } = wrap(titleFont, title, 1040, [76, 68, 60, 54], 3);
  const lh = size * 1.12;
  const top = 290 - ((lines.length - 1) * lh) / 2 + (eyebrow ? 20 : 0);
  let out = '';
  if (eyebrow) {
    const ew = width(F.uiBold, eyebrow.toUpperCase(), 20) + 36;
    out += `<rect x="80" y="${top - size - 54}" width="${ew}" height="38" rx="19" fill="#FFFFFF" stroke="${C.line}"/>`;
    out += text(F.uiBold, eyebrow.toUpperCase(), 98, top - size - 28, 20, C.emberInk);
  }
  lines.forEach((l, i) => {
    const y = top + i * lh;
    if (accent && i === lines.length - 1 && l.endsWith(accent)) {
      const head = l.slice(0, l.length - accent.length);
      out += text(titleFont, head, 80, y, size, C.ink) + text(F.displayItalic, accent, 80 + width(titleFont, head, size), y, size, C.ember);
    } else out += text(titleFont, l, 80, y, size, C.ink);
  });
  if (footer) out += text(F.ui, footer, 1120 - width(F.ui, footer, 24), 600, 24, C.ink2);
  return frame(out);
}

async function png(svg, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
}

function articles() {
  const dir = path.join(ROOT, 'src', 'content', 'learn');
  return fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const meta = JSON.parse(raw.match(/^<!--meta ([\s\S]*?) -->/)[1]);
    const words = raw.replace(/<[^>]+>/g, ' ').split(/\s+/).length;
    return { slug: f.replace(/\.html$/, ''), heading: meta.heading, badge: meta.badge, mins: Math.max(2, Math.round(words / 230)) };
  });
}

function starts() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'starts.ts'), 'utf8');
  return [...src.matchAll(/slug: '([a-z-]+)',\s*door: '([^']+)',\s*title: '([^']+)'/g)].map(m => ({ slug: m[1], door: m[2], title: m[3] }));
}

async function icons() {
  const iconSvg = (size, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="${bg ? 14 : 0}" fill="${C.espresso}"/>
    <g transform="translate(12 11) scale(1.68)"><path d="${FLAME}" fill="none" stroke="${C.ember}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), iconSvg(64, true));
  for (const [name, size, rounded] of [['favicon-32.png', 32, true], ['icon-192.png', 192, true], ['icon-512.png', 512, true], ['apple-touch-icon.png', 180, false]]) {
    await png(iconSvg(size, rounded), path.join(OUT, 'icons', name));
  }
}

(async () => {
  await icons();
  await png(card({ eyebrow: 'Built for everyday Australians', title: 'Money shouldn’t feel confusing.', accent: 'confusing.', footer: 'Find your freedom date — free' }), path.join(OUT, 'og', 'default.png'));
  const list = articles();
  for (const a of list) await png(card({ eyebrow: `Learning Lab · ${a.badge.split(' · ')[0]}`, title: a.heading, footer: `${a.mins} min read` }), path.join(OUT, 'og', 'learn', `${a.slug}.png`));
  let s = [];
  try { s = starts(); } catch (e) { /* start pages not defined yet */ }
  for (const p of s) await png(card({ eyebrow: p.door, title: p.title, footer: 'Start where you are' }), path.join(OUT, 'og', 'start', `${p.slug}.png`));
  console.log(`icons, default, ${list.length} articles, ${s.length} start pages`);
})();
