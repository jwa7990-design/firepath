/**
 * FirePath — Shared Interactions
 * =================================
 * The interaction-layer counterpart to visual-system.css. These started as
 * page-specific code in index_visual_v2.html (the hero count-up, the card tilt,
 * the scroll-reveal observer) — extracted here so every page uses the same
 * primitives instead of each page reinventing its own version.
 *
 * Respects prefers-reduced-motion globally, once, here — individual call sites
 * don't need to check it themselves.
 *
 * Usage:
 *   <script src="js/interactions.js"></script>
 *   <script>
 *     FirePathMotion.initReveal(); // wire up every .fp-reveal element on the page
 *     FirePathMotion.countUp(document.getElementById('pct'), 42);
 *   </script>
 */

window.FirePathMotion = (function () {

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Wires up scroll-reveal for every element matching `selector` (default:
   * .fp-reveal from visual-system.css). Each element gets `.in-view` added once,
   * the first time it enters the viewport — never re-triggers on scroll back up.
   */
  function initReveal(selector) {
    selector = selector || '.fp-reveal';
    const els = document.querySelectorAll(selector);
    if (prefersReducedMotion) {
      els.forEach(el => el.classList.add('in-view'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => observer.observe(el));
    return observer;
  }

  /**
   * Counts a number up from 0 to `target` inside `el`, ease-out cubic, over
   * `duration` ms. Defaults to 550ms — the speed refined through real review
   * for numbers people see on repeat visits (a dashboard opened daily
   * shouldn't make someone wait through a long animation every time).
   * For a genuine one-time first-impression moment (e.g. a marketing
   * homepage hero, seen once), explicitly pass a longer duration —
   * { duration: 2600 } was the original homepage hero's "watch something
   * happen" pacing. Don't rely on the default for that case; it's tuned
   * for the more common repeat-visit context now.
   * Jumps straight to the target under reduced motion.
   * `onComplete` fires once, after the count finishes.
   */
  function countUp(el, target, opts) {
    opts = opts || {};
    const duration = opts.duration || 550;
    const onComplete = opts.onComplete || function () {};
    if (!el) return;
    if (prefersReducedMotion) {
      el.textContent = target;
      onComplete();
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        onComplete();
      }
    }
    requestAnimationFrame(tick);
  }

  /**
   * Grows `el`'s width (or height, via opts.axis = 'height') from 0 to
   * `targetPct`%, via CSS transition. Call once the element is in the DOM;
   * a tiny setTimeout is used internally so the browser registers the
   * starting 0% before the transition to the target begins.
   */
  function animateBar(el, targetPct, opts) {
    opts = opts || {};
    const axis = opts.axis || 'width';
    const delay = opts.delay != null ? opts.delay : 300;
    if (!el) return;
    if (prefersReducedMotion) {
      el.style[axis] = targetPct + '%';
      return;
    }
    setTimeout(() => { el.style[axis] = targetPct + '%'; }, delay);
  }

  /**
   * Subtle mouse-tilt on `cardEl`, tracked relative to `wrapEl`'s bounds.
   * `maxDeg` caps rotation (default 3°) — Vision Pro-style restraint, not
   * gaming RGB tilt. No-op entirely under reduced motion.
   */
  function tiltCard(wrapEl, cardEl, opts) {
    opts = opts || {};
    const maxDeg = opts.maxDeg != null ? opts.maxDeg : 3;
    if (prefersReducedMotion || !wrapEl || !cardEl) return;
    wrapEl.addEventListener('mousemove', (e) => {
      const rect = wrapEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      cardEl.style.transform = `rotateX(${(-y * maxDeg).toFixed(2)}deg) rotateY(${(x * maxDeg).toFixed(2)}deg)`;
    });
    wrapEl.addEventListener('mouseleave', () => {
      cardEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  return { prefersReducedMotion, initReveal, countUp, animateBar, tiltCard };
})();
