// FirePath — Astro build settings.
// Everything in public/ is copied to dist/ untouched; pages in src/pages are
// built to plain .html files alongside them. Cloudflare Pages serves dist/.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.firepath.pro',
  output: 'static',
  build: { format: 'preserve' },   // foo.astro -> foo.html, foo/index.astro -> foo/index.html
  trailingSlash: 'ignore',
});
