// ─────────────────────────────────────────
// FirePath Onboarding Tour
// Auto-launches on first visit, never repeats
// ─────────────────────────────────────────

const TOUR_STEPS = [
  {
    emoji: '✍️',
    tag: 'STEP 1 OF 4',
    title: 'Be honest with us',
    body: 'The more accurate your numbers, the more useful your results. Income, savings, super, age — put in what\'s real. No judgement. FirePath only works if you give it something true to work with.',
    cta: 'Got it →',
  },
  {
    emoji: '🔥',
    tag: 'STEP 2 OF 4',
    title: 'Your results page',
    body: 'Once you submit, you\'ll see your freedom number — the amount you need invested to never have to work again. You\'ll also see your freedom age and how long it\'ll take at your current savings rate.',
    cta: 'Show me more →',
  },
  {
    emoji: '🧮',
    tag: 'STEP 3 OF 4',
    title: 'Run your "what if" scenarios',
    body: 'The Hear Me Out calculators let you stress-test your plan. What if you got a pay rise? Sold an asset? Moved somewhere cheaper? Model it and see exactly how many years it shaves off — or adds on.',
    cta: 'One more →',
  },
  {
    emoji: '🗺️',
    tag: 'STEP 4 OF 4',
    title: 'Things worth exploring',
    body: 'FirePath surfaces questions and ideas tailored to your numbers — things most people don\'t think to ask but probably should. It\'s where the real optimisation happens.',
    cta: 'Let\'s go →',
  },
];

let currentStep = 0;

function showOnboardingTour() {
  // Only show once — check localStorage
  if (localStorage.getItem('fp_tour_seen')) return;

  currentStep = 0;
  injectTourStyles();
  buildTourModal();

  // Slight delay so the page has painted first
  setTimeout(() => {
    const overlay = document.getElementById('fp-tour-overlay');
    if (overlay) overlay.classList.add('fp-tour-visible');
  }, 600);
}

function buildTourModal() {
  // Remove any existing instance
  const existing = document.getElementById('fp-tour-overlay');
  if (existing) existing.remove();

  const step = TOUR_STEPS[currentStep];

  const overlay = document.createElement('div');
  overlay.id = 'fp-tour-overlay';
  overlay.innerHTML = `
    <div id="fp-tour-card">

      <div id="fp-tour-progress-bar">
        <div id="fp-tour-progress-fill" style="width: ${((currentStep + 1) / TOUR_STEPS.length) * 100}%"></div>
      </div>

      <div id="fp-tour-header">
        <span id="fp-tour-tag">${step.tag}</span>
        <button id="fp-tour-skip" onclick="dismissTour()">Skip tour</button>
      </div>

      <div id="fp-tour-body">
        <div id="fp-tour-emoji">${step.emoji}</div>
        <h2 id="fp-tour-title">${step.title}</h2>
        <p id="fp-tour-text">${step.body}</p>

        <div id="fp-tour-dots">
          ${TOUR_STEPS.map((_, i) => `<div class="fp-dot ${i === currentStep ? 'fp-dot-active' : ''}" onclick="goToStep(${i})"></div>`).join('')}
        </div>

        <button id="fp-tour-cta" onclick="nextTourStep()">${step.cta}</button>

        ${currentStep === TOUR_STEPS.length - 1 ? '<p id="fp-tour-hint">Your results will be waiting when you\'re done.</p>' : ''}
      </div>

    </div>
  `;

  document.body.appendChild(overlay);
}

function nextTourStep() {
  if (currentStep === TOUR_STEPS.length - 1) {
    dismissTour();
    return;
  }

  const body = document.getElementById('fp-tour-body');
  if (body) {
    body.style.opacity = '0';
    body.style.transform = 'translateY(8px)';
  }

  setTimeout(() => {
    currentStep++;
    buildTourModal();
    setTimeout(() => {
      const overlay = document.getElementById('fp-tour-overlay');
      if (overlay) overlay.classList.add('fp-tour-visible');
    }, 30);
  }, 180);
}

function goToStep(i) {
  if (i === currentStep) return;
  const body = document.getElementById('fp-tour-body');
  if (body) {
    body.style.opacity = '0';
    body.style.transform = 'translateY(8px)';
  }
  setTimeout(() => {
    currentStep = i;
    buildTourModal();
    setTimeout(() => {
      const overlay = document.getElementById('fp-tour-overlay');
      if (overlay) overlay.classList.add('fp-tour-visible');
    }, 30);
  }, 180);
}

function dismissTour() {
  const overlay = document.getElementById('fp-tour-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }
  localStorage.setItem('fp_tour_seen', 'true');
}

function injectTourStyles() {
  if (document.getElementById('fp-tour-styles')) return;
  const style = document.createElement('style');
  style.id = 'fp-tour-styles';
  style.textContent = `
    #fp-tour-overlay {
      position: fixed;
      inset: 0;
      background: rgba(20, 10, 5, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 20px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.4s ease;
    }

    #fp-tour-overlay.fp-tour-visible {
      opacity: 1;
    }

    #fp-tour-card {
      width: 100%;
      max-width: 420px;
      background: linear-gradient(160deg, #FDF6EC 0%, #F8EDDA 100%);
      border-radius: 24px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(193,68,14,0.12);
      overflow: hidden;
      transform: translateY(30px) scale(0.96);
      transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    #fp-tour-overlay.fp-tour-visible #fp-tour-card {
      transform: translateY(0) scale(1);
    }

    #fp-tour-progress-bar {
      height: 3px;
      background: #E8D5C0;
    }

    #fp-tour-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #C1440E, #D4883A);
      transition: width 0.5s ease;
      border-radius: 2px;
    }

    #fp-tour-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px 0;
    }

    #fp-tour-tag {
      font-size: 10px;
      letter-spacing: 2px;
      font-weight: 600;
      color: #B8956A;
      font-family: 'DM Sans', sans-serif;
      text-transform: uppercase;
    }

    #fp-tour-skip {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 11px;
      color: #B8A090;
      font-family: 'DM Sans', sans-serif;
      letter-spacing: 0.5px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: color 0.2s;
    }

    #fp-tour-skip:hover {
      color: #7A5A40;
    }

    #fp-tour-body {
      padding: 20px 28px 28px;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    #fp-tour-emoji {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #FFF8F0, #F5E4CC);
      border-radius: 18px;
      border: 1.5px solid rgba(193,68,14,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      margin-bottom: 20px;
      box-shadow: 0 4px 16px rgba(193,68,14,0.1);
    }

    #fp-tour-title {
      margin: 0 0 12px;
      font-size: 24px;
      font-weight: 700;
      color: #1C0F08;
      line-height: 1.25;
      letter-spacing: -0.3px;
      font-family: 'Playfair Display', serif;
    }

    #fp-tour-text {
      margin: 0 0 24px;
      font-size: 15px;
      color: #5A3E2B;
      line-height: 1.65;
      font-family: 'DM Sans', sans-serif;
      font-weight: 300;
    }

    #fp-tour-dots {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
      align-items: center;
    }

    .fp-dot {
      height: 6px;
      width: 6px;
      border-radius: 3px;
      background: #DDD0C0;
      cursor: pointer;
      transition: all 0.35s ease;
    }

    .fp-dot-active {
      width: 20px;
      background: #C1440E;
    }

    #fp-tour-cta {
      width: 100%;
      padding: 16px 24px;
      background: linear-gradient(135deg, #C1440E, #C1440Ecc);
      color: white;
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 600;
      font-family: 'DM Sans', sans-serif;
      cursor: pointer;
      letter-spacing: 0.3px;
      box-shadow: 0 8px 24px rgba(193,68,14,0.3);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    #fp-tour-cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(193,68,14,0.4);
    }

    #fp-tour-hint {
      text-align: center;
      margin-top: 14px;
      margin-bottom: 0;
      font-size: 12px;
      color: #B8A090;
      font-family: 'DM Sans', sans-serif;
    }
  `;
  document.head.appendChild(style);
}

// ── Auto-launch on page load ──
document.addEventListener('DOMContentLoaded', function () {
  showOnboardingTour();
});
