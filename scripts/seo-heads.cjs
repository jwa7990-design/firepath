/**
 * Keeps the <head> of the hand-written pages in public/ in step with the Astro pages:
 * icons, share image, site details — and for the free tools, a search-focused title,
 * description, canonical address and WebApplication structured data.
 *   node scripts/seo-heads.cjs public/firepath.html …   (no arguments = every page)
 * Safe to re-run: everything it adds sits between <!-- seo:start --> and <!-- seo:end -->.
 */
const fs = require('fs');
const path = require('path');
const SITE = 'https://www.firepath.pro';

// Free tools people search for. Title ≤ ~60 characters, description ≤ ~155.
const TOOLS = {
  'firepath.html': { path: '/firepath', title: 'FIRE & Retirement Age Calculator Australia | FirePath',
    description: 'Free Australian retirement age and FIRE calculator. See when work could become optional, with super from 60 and what brings it closer. No account needed.',
    app: 'FirePath freedom calculator' },
  'withdrawal.html': { path: '/withdrawal', title: 'Will my money last? Retirement withdrawal calculator | FirePath',
    description: 'Will your money last? Test a withdrawal rate the way markets really behave: the odds it lasts 30 years, in today’s dollars. Free and Australian.',
    app: 'Withdrawal planner' },
  'hearmeout.html': { path: '/hearmeout', title: 'Money what-if calculator — sell the house, lump sums & more | FirePath',
    description: 'Run life’s big money decisions through your numbers: sell or downsize the house, a lump sum or redundancy, paying off a loan, renting vs buying. Free, no account needed.',
    app: 'What if…? money scenarios' },
  'freedom-gap.html': { path: '/freedom-gap', title: 'Coast FIRE & part-time freedom calculator Australia | FirePath',
    description: 'How close is your portfolio to paying your way? See your freedom gap, what the Age Pension adds from 67, and how many hours of part-time work would close it.',
    app: 'Freedom gap' },
  'compound.html': { path: '/compound', title: 'Compound interest calculator Australia — regular investing | FirePath',
    description: 'See what regular weekly, fortnightly or monthly investing grows into — how much is your money and how much is growth, and what waiting really costs. Free.',
    app: 'Compound interest' },
};

function block(file, html) {
  const t = TOOLS[file];
  const lines = [
    '<!-- seo:start -->',
    '<meta property="og:site_name" content="FirePath"/>',
    '<meta property="og:locale" content="en_AU"/>',
    `<meta property="og:image" content="${SITE}/og/default.png"/>`,
    '<meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>',
    '<meta name="twitter:card" content="summary_large_image"/>',
    `<meta name="twitter:image" content="${SITE}/og/default.png"/>`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>',
    '<link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32"/>',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>',
    '<link rel="manifest" href="/site.webmanifest"/>',
    '<meta name="theme-color" content="#FDF6EE"/>',
  ];
  if (t) {
    lines.push(
      `<link rel="canonical" href="${SITE}${t.path}"/>`,
      `<meta property="og:url" content="${SITE}${t.path}"/>`,
      '<meta property="og:type" content="website"/>',
      `<meta property="og:title" content="${t.title}"/>`,
      `<meta property="og:description" content="${t.description}"/>`,
      `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: t.app, url: SITE + t.path, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' }, inLanguage: 'en-AU' })}</script>`);
  }
  lines.push('<!-- seo:end -->');
  return lines.join('\n');
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(__dirname, '..', 'public')).filter(f => f.endsWith('.html')).map(f => path.join('public', f));
for (const rel of files) {
  const p = path.resolve(rel), file = path.basename(p);
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/\n?<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, '');
  const t = TOOLS[file];
  if (t) {
    // Replace the old title/description, and drop older og/canonical tags the block now provides.
    s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${t.title}</title>`);
    if (/<meta name="description"/.test(s)) s = s.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${t.description}"/>`);
    else s = s.replace(/<\/title>/, `</title>\n<meta name="description" content="${t.description}"/>`);
    s = s.replace(/\s*<link rel="canonical"[^>]*>/g, '').replace(/\s*<meta property="og:(url|type|title|description)"[^>]*>/g, '');
  }
  s = s.replace(/\s*<meta property="og:(image|site_name|locale)[^>]*>/g, '').replace(/\s*<link rel="(icon|apple-touch-icon|manifest)"[^>]*>/g, '');
  s = s.replace(/<\/title>/, `</title>\n${block(file, s)}`);
  fs.writeFileSync(p, s);
  console.log('✓', file, t ? '(tool)' : '');
}
