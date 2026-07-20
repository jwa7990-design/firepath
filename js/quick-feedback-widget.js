/**
 * FirePath — Quick Feedback Widget
 * ==================================
 * A small pinned button, present on every page that includes this script.
 * Opens a lightweight face-reaction + optional text box. Fire-and-forget —
 * built for "something felt off right now", not deep research.
 *
 * The full multi-question survey (feedback.html) stays separate, linked
 * from Account → Settings, for people who want to give more detailed input.
 *
 * Usage: add this one line before </body> on any page:
 *   <script src="js/quick-feedback-widget.js"></script>
 * Requires auth.js already loaded on the page (for getToken/getUserId) —
 * works fine without it too, just won't attach a user_id to the submission.
 */

(function() {
  // Same 1-5 scale as feedback.html's rating, so the two data sources stay comparable.
  const FACES = [
    { value: 1, label: 'Not great' },
    { value: 2, label: 'Meh' },
    { value: 3, label: 'Okay' },
    { value: 4, label: 'Good' },
    { value: 5, label: 'Loved it' },
  ];

  // Simple line-art faces matching the site's SVG icon language — no raw emoji.
  const FACE_SVGS = {
    1: '<circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><circle cx="9" cy="9.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.6" fill="currentColor" stroke="none"/>',
    2: '<circle cx="12" cy="12" r="9"/><path d="M8 14.5h8"/><circle cx="9" cy="9.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.6" fill="currentColor" stroke="none"/>',
    3: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 1 4 1 4-1 4-1"/><circle cx="9" cy="9.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.6" fill="currentColor" stroke="none"/>',
    4: '<circle cx="12" cy="12" r="9"/><path d="M8 13.5s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.6" fill="currentColor" stroke="none"/>',
    5: '<circle cx="12" cy="12" r="9"/><path d="M7.5 13s2 3 4.5 3 4.5-3 4.5-3"/><circle cx="9" cy="9" r="0.7" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="0.7" fill="currentColor" stroke="none"/>',
  };

  let selectedRating = null;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #qfw-btn {
        position: fixed; bottom: 20px; right: 20px; z-index: 9998;
        width: 48px; height: 48px; border-radius: 50%;
        background: linear-gradient(135deg, var(--fire-orange, #F4622A), var(--fire-amber, #F9A825));
        border: none; box-shadow: 0 4px 16px rgba(244,98,42,0.35);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: transform 0.2s ease;
      }
      #qfw-btn:hover { transform: scale(1.08); }
      #qfw-btn svg { width: 22px; height: 22px; color: white; }
      #qfw-overlay {
        display: none; position: fixed; inset: 0; background: rgba(61,43,31,0.4);
        z-index: 9999; align-items: flex-end; justify-content: center;
      }
      #qfw-overlay.open { display: flex; }
      #qfw-panel {
        background: white; border-radius: 20px 20px 0 0; padding: 24px 20px 28px;
        width: 100%; max-width: 420px; box-sizing: border-box;
        font-family: 'DM Sans', sans-serif; color: var(--warm-brown, #3D2B1F);
        animation: qfw-slide-up 0.25s ease both;
      }
      @media (min-width: 640px) {
        #qfw-overlay { align-items: center; }
        #qfw-panel { border-radius: 20px; margin-bottom: 40px; }
      }
      @keyframes qfw-slide-up { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      #qfw-title { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; margin-bottom: 4px; }
      #qfw-sub { font-size: 12px; color: var(--soft-grey, #9E8E85); font-weight: 300; margin-bottom: 16px; }
      #qfw-faces { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 14px; }
      .qfw-face-btn {
        flex: 1; background: none; border: 2px solid var(--border, #EDE3DA); border-radius: 12px;
        padding: 10px 4px; cursor: pointer; transition: all 0.15s ease; display: flex; flex-direction: column; align-items: center; gap: 4px;
      }
      .qfw-face-btn svg { width: 24px; height: 24px; fill: none; stroke: var(--soft-grey, #9E8E85); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .qfw-face-btn:hover { border-color: rgba(244,98,42,0.4); }
      .qfw-face-btn.selected { border-color: var(--fire-orange, #F4622A); background: #FFF7F3; }
      .qfw-face-btn.selected svg { stroke: var(--fire-orange, #F4622A); }
      .qfw-face-label { font-size: 9px; color: var(--soft-grey, #9E8E85); font-weight: 500; }
      .qfw-face-btn.selected .qfw-face-label { color: var(--fire-orange, #F4622A); }
      #qfw-textarea {
        width: 100%; box-sizing: border-box; min-height: 70px; padding: 12px 14px;
        border: 1.5px solid var(--border, #EDE3DA); border-radius: 12px; font-family: 'DM Sans', sans-serif;
        font-size: 13px; color: var(--warm-brown, #3D2B1F); resize: none; outline: none; margin-bottom: 14px; transition: border-color 0.2s;
      }
      #qfw-textarea:focus { border-color: var(--fire-orange, #F4622A); }
      #qfw-actions { display: flex; gap: 8px; }
      #qfw-submit {
        flex: 1; background: linear-gradient(135deg, var(--fire-orange, #F4622A), var(--fire-amber, #F9A825));
        color: white; border: none; border-radius: 12px; padding: 12px; font-size: 13px; font-weight: 500;
        font-family: 'DM Sans', sans-serif; cursor: pointer;
      }
      #qfw-submit:disabled { opacity: 0.5; cursor: not-allowed; }
      #qfw-close { background: none; border: none; color: var(--soft-grey, #9E8E85); font-size: 13px; padding: 12px 16px; cursor: pointer; font-family: 'DM Sans', sans-serif; }
      #qfw-success { display: none; text-align: center; padding: 8px 0 4px; }
      #qfw-success.visible { display: block; }
      #qfw-success-text { font-size: 14px; font-weight: 500; color: var(--warm-brown, #3D2B1F); margin-top: 8px; }
      #qfw-deeper { display: block; text-align: center; font-size: 12px; color: var(--fire-orange, #F4622A); text-decoration: none; margin-top: 14px; }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    const btn = document.createElement('button');
    btn.id = 'qfw-btn';
    btn.setAttribute('aria-label', 'Give quick feedback');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    const overlay = document.createElement('div');
    overlay.id = 'qfw-overlay';
    overlay.innerHTML = `
      <div id="qfw-panel">
        <div id="qfw-form-area">
          <div id="qfw-title">How's it going?</div>
          <div id="qfw-sub">Takes 10 seconds. Real people read this.</div>
          <div id="qfw-faces">${FACES.map(f => `
            <button class="qfw-face-btn" data-rating="${f.value}" aria-label="${f.label}">
              <svg viewBox="0 0 24 24">${FACE_SVGS[f.value]}</svg>
              <span class="qfw-face-label">${f.label}</span>
            </button>`).join('')}
          </div>
          <textarea id="qfw-textarea" placeholder="Anything you want to add? (optional)"></textarea>
          <div id="qfw-actions">
            <button id="qfw-close">Not now</button>
            <button id="qfw-submit" disabled>Send</button>
          </div>
        </div>
        <div id="qfw-success">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#2E7D32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto;display:block;"><path d="M20 6L9 17l-5-5"/></svg>
          <div id="qfw-success-text">Thanks — genuinely.</div>
        </div>
        <a href="/feedback.html" id="qfw-deeper">Want to share more detail? →</a>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    btn.addEventListener('click', () => overlay.classList.add('open'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWidget(); });
    document.getElementById('qfw-close').addEventListener('click', closeWidget);

    document.querySelectorAll('.qfw-face-btn').forEach(fb => {
      fb.addEventListener('click', () => {
        document.querySelectorAll('.qfw-face-btn').forEach(b => b.classList.remove('selected'));
        fb.classList.add('selected');
        selectedRating = parseInt(fb.dataset.rating);
        document.getElementById('qfw-submit').disabled = false;
      });
    });

    document.getElementById('qfw-submit').addEventListener('click', submitQuickFeedback);
  }

  function closeWidget() {
    document.getElementById('qfw-overlay').classList.remove('open');
    setTimeout(resetWidget, 300);
  }

  function resetWidget() {
    selectedRating = null;
    document.querySelectorAll('.qfw-face-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('qfw-textarea').value = '';
    document.getElementById('qfw-submit').disabled = true;
    document.getElementById('qfw-form-area').style.display = 'block';
    document.getElementById('qfw-success').classList.remove('visible');
  }

  async function submitQuickFeedback() {
    const submitBtn = document.getElementById('qfw-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const payload = {
      rating: selectedRating,
      other: document.getElementById('qfw-textarea').value.trim() || null,
      // Every other field from the full survey (gaps/confusing/bring_back/pro_interest/email)
      // stays null here — that's how a quick submission is distinguished from a full one
      // without needing a schema change.
      is_pro: (typeof localStorage !== 'undefined' && localStorage.getItem('fp_is_pro') === 'true'),
      submitted_at: new Date().toISOString(),
      page_url: window.location.pathname,
    };

    try {
      const token = typeof getToken === 'function' ? getToken() : null;
      const userId = typeof getUserId === 'function' ? getUserId() : null;
      const workerUrl = typeof WORKER_URL !== 'undefined' ? WORKER_URL : null;

      if (token && userId && workerUrl) {
        await fetch(`${workerUrl}/db/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ ...payload, user_id: userId }),
        });
      }
    } catch (e) {
      console.log('Quick feedback save failed', e);
      // Still show success — a failed background save shouldn't block the person's experience
    }

    document.getElementById('qfw-form-area').style.display = 'none';
    document.getElementById('qfw-success').classList.add('visible');
    submitBtn.textContent = 'Send';
    setTimeout(closeWidget, 2200);
  }

  function init() {
    injectStyles();
    injectMarkup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
