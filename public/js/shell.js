/**
 * FirePath — Page shell
 * ======================
 * Draws the navigation around every page from one definition, so the site has one
 * menu instead of thirty hand-copied ones. Two shells:
 *
 *   App (signed-in):  <body class="app" data-shell="app" data-active="money">
 *                     → desktop rail, mobile tab bar, Ask FirePath pill
 *   Site (public):    <body class="site" data-shell="site" data-active="features">
 *                     → sticky top nav with mobile drawer, and the site footer
 *
 * Put the script tag as the FIRST thing inside <body> so the nav is drawn before the
 * rest of the page paints:
 *   <body class="app" data-shell="app" data-active="journey">
 *   <script src="js/shell.js"></script>
 *
 * data-active: journey | money | strategy | learn | ask   (app)
 *              features | pricing | learn | faq            (site)
 * data-footer="none" on a site page skips the footer (e.g. the calculator flow).
 * Styles live in css/app.css. Works from subfolders (learn/…) — links are resolved
 * against this script's own location.
 */
(function () {
  const script = document.currentScript;
  const root = script ? script.src.replace(/js\/shell\.js(\?.*)?$/, '') : '/';
  const url = path => root + path;
  const body = document.body;
  const kind = body.getAttribute('data-shell');
  const active = body.getAttribute('data-active') || '';
  if (!kind) return;

  const ICON = {
    flame: '<path d="M12 22c4.5 0 7-2.8 7-6.8 0-2.8-1.4-4.8-2.8-6.5 0 1.8-.9 2.8-1.8 2.8.4-2.8-.9-4.8-2.7-7.3-.9 2.8-3.6 4.6-3.6 9 0 .9.2 1.8.5 2.7-1-.6-1.7-1.6-1.9-3-1.1 1.8-1.4 3.6-1.4 4.8 0 4 3.2 6.8 7.2 6.8z"/>',
    journey: '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.2 3 2.5c1.7.3 3 1.1 3 2.5s-1.3 2.5-3 2.5-3-1.1-3-2.5"/>',
    strategy: '<path d="M3 3v18h18M7 15l4-5 3 3 5-7"/>',
    learn: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>',
    ask: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  const svg = (name, size, stroke) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
  const current = key => key === active ? ' active" aria-current="page' : '';
  // The "you are here" highlight. It carries a view-transition name (css/app.css),
  // so on page change it glides from the old item to the new one.
  const indicator = key => key === active ? '<span class="nav-indicator" aria-hidden="true"></span>' : '';

  // ── App shell ──────────────────────────────────────────
  const APP_TABS = [
    ['journey', 'Journey', 'journey.html'],
    ['money', 'Money', 'money.html'],
    ['strategy', 'Strategy', 'strategy.html'],
    ['learn', 'Learn', 'learn.html']
  ];

  function renderApp() {
    const rail = `
<nav class="desktop-rail" aria-label="Primary">
  <a href="${url('journey.html')}" class="desktop-rail-logo">${svg('flame', 20)}FirePath</a>
  <div class="desktop-rail-nav">
    ${APP_TABS.map(([k, label, href]) => `<a href="${url(href)}" class="desktop-rail-item${current(k)}">${indicator(k)}${svg(k, 18)}${label}</a>`).join('')}
  </div>
  <a href="${url('ask-firepath.html')}" class="desktop-rail-ask${current('ask')}">${svg('ask', 15)}Ask FirePath</a>
  <div class="desktop-rail-footer">
    <a href="${url('welcome.html')}" data-persona-open title="Change how FirePath talks to you">Level: <span data-persona-name>—</span></a>
    <a href="${url('account.html')}">Settings</a>
    <a href="${url('auth.html?action=signout')}">Sign out</a>
  </div>
</nav>`;
    const tabbar = `
<nav class="mobile-tabbar" aria-label="Primary">
  ${APP_TABS.map(([k, label, href]) => `<a href="${url(href)}" class="mobile-tabbar-item${current(k)}">${indicator(k)}${svg(k, 20)}${label}</a>`).join('')}
</nav>`;
    const ask = active === 'ask' ? '' : `<a href="${url('ask-firepath.html')}" class="ask-pill">${svg('ask', 14, 2)}Ask FirePath</a>`;
    // All drawn straight away (not at the end of the page) so they're on screen in the
    // very first frame — page transitions keep them still instead of blinking them.
    body.insertAdjacentHTML('afterbegin', rail + tabbar + ask);
  }

  // ── Site shell ─────────────────────────────────────────
  const SITE_LINKS = [
    ['features', 'Features', 'features.html'],
    ['pricing', 'Pricing', 'pricing.html'],
    ['learn', 'Learning Lab', 'learn/index.html'],
    ['faq', 'FAQ', 'faq.html']
  ];

  function renderSite() {
    const nav = `
<header class="site-nav" id="siteNav">
  <a href="${url('index.html')}" class="site-logo">${svg('flame', 20)}<span>Fire<em>Path</em></span></a>
  <nav class="site-links" aria-label="Primary">
    ${SITE_LINKS.map(([k, label, href]) => `<a href="${url(href)}" class="site-link"${k === active ? ' aria-current="page"' : ''}>${indicator(k)}${label}</a>`).join('')}
  </nav>
  <div class="site-actions">
    <a href="${url('auth.html')}" class="btn btn-quiet site-signin">Sign in</a>
    <a href="${url('firepath.html')}" class="btn btn-primary">Find my path</a>
    <button class="site-menu-btn" id="siteMenuBtn" aria-label="Menu" aria-expanded="false" aria-controls="siteDrawer">${svg('menu', 22)}</button>
  </div>
</header>
<div class="site-drawer" id="siteDrawer">
  ${SITE_LINKS.map(([, label, href]) => `<a href="${url(href)}">${label}</a>`).join('')}
  <a href="${url('auth.html')}">Sign in</a>
  <a href="${url('firepath.html')}" class="btn btn-ember">Find my path →</a>
</div>`;
    body.insertAdjacentHTML('afterbegin', nav);

    const btn = document.getElementById('siteMenuBtn');
    const drawer = document.getElementById('siteDrawer');
    btn.addEventListener('click', () => {
      const open = !drawer.classList.contains('open');
      drawer.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.innerHTML = svg(open ? 'close' : 'menu', 22);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    const navEl = document.getElementById('siteNav');
    const onScroll = () => navEl.classList.toggle('scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (body.getAttribute('data-footer') === 'none') return;
    const year = new Date().getFullYear();
    const footer = `
<footer class="site-footer">
  <div class="site-footer-inner">
    <div class="site-footer-brand">
      <a href="${url('index.html')}" class="site-logo">${svg('flame', 18)}<span>Fire<em>Path</em></span></a>
      <p>Plain-English money guidance for everyday Australians — and the date work could become optional.</p>
    </div>
    <div><h4>Product</h4><ul>
      <li><a href="${url('firepath.html')}">Free calculator</a></li>
      <li><a href="${url('features.html')}">Features</a></li>
      <li><a href="${url('pricing.html')}">Pricing</a></li>
      <li><a href="${url('auth.html')}">Sign in</a></li>
    </ul></div>
    <div><h4>Learn</h4><ul>
      <li><a href="${url('learn/index.html')}">Learning Lab</a></li>
      <li><a href="${url('learn/what-is-fire-australia.html')}">What is FIRE?</a></li>
      <li><a href="${url('assumptions.html')}">How we calculate</a></li>
      <li><a href="${url('faq.html')}">FAQ</a></li>
    </ul></div>
    <div><h4>Company</h4><ul>
      <li><a href="${url('index.html#why')}">Why FirePath</a></li>
      <li><a href="${url('feedback.html')}">Feedback</a></li>
      <li><a href="${url('privacy.html')}">Privacy</a></li>
      <li><a href="${url('terms.html')}">Terms</a></li>
    </ul></div>
    <div class="site-footer-legal">© ${year} FirePath. FirePath is an educational tool and doesn't provide financial advice. Projections are illustrative only — always consider your personal circumstances.</div>
  </div>
</footer>`;
    const addFooter = () => {
      const slot = document.querySelector('[data-site-footer]');
      if (slot) slot.outerHTML = footer; else body.insertAdjacentHTML('beforeend', footer);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFooter); else addFooter();
  }

  // ── Motion ─────────────────────────────────────────────
  // Cards and article boxes below the fold ease in as they're scrolled to. Only
  // things off-screen at load are touched, so nothing visible ever blinks, and
  // content added later by a page's own script simply appears as normal.
  const REVEAL = '.app-main .card, .site-main .card, main .card, .article-body > [class$="-box"], .article .cta-box, [data-reveal]';
  function initMotion() {
    if (document.querySelector('.article')) body.insertAdjacentHTML('afterbegin', '<div class="fp-progress" aria-hidden="true"></div>');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const fold = window.innerHeight;
    const targets = Array.from(document.querySelectorAll(REVEAL)).filter(el =>
      !el.closest('.rise, .fp-reveal, [data-no-reveal], dialog, [role="dialog"]') &&
      el.getBoundingClientRect().top > fold);
    if (!targets.length) return;
    let batch = 0, batchTimer;
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.style.setProperty('--fp-delay', Math.min(batch++, 4) * 70 + 'ms');   // gentle stagger within one scroll
        el.classList.add('fp-shown');
        // Hand the element back to its own styles (hover lifts etc.) once it has arrived.
        setTimeout(() => { el.classList.remove('fp-pending', 'fp-shown'); el.style.removeProperty('--fp-delay'); }, 1100);
      });
      clearTimeout(batchTimer); batchTimer = setTimeout(() => { batch = 0; }, 120);
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => { el.classList.add('fp-pending'); io.observe(el); });
  }

  if (kind === 'app') renderApp();
  else if (kind === 'site') renderSite();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMotion); else initMotion();
})();
