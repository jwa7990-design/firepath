// js/date-note.js — the one line under the date.
// FirePathEngine.headlineNotes picks the note that matters most for this person; this draws
// it, with any others behind a quiet "More about this date". The savings note can carry its
// own actions (a Change button or link, and Learning Lab links), passed in as HTML.
//
//   FirePathDateNote.render(container, notes, { actions: { savings: '<p>…</p>' } })
(function () {
  let styled = false;
  function addStyles() {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = `
.dn-more { appearance: none; background: none; border: 0; padding: 0; margin-left: 4px; font: inherit; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; cursor: pointer; white-space: nowrap; }
.dn-more:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 3px; }
.dn-others { margin-top: 8px; }
.dn-others p, .dn-act p { margin: 6px 0 0; }
.dn-main a, .dn-act a, .dn-others a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }`;
    document.head.appendChild(el);
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // opts.actions[key]: { inline: HTML at the end of the line, more: HTML inside "More about this date" }.
  function render(container, notes, opts) {
    if (!container) return;
    addStyles();
    const acts = (opts && opts.actions) || {};
    if (!notes || !notes.main) { container.innerHTML = ''; container.hidden = true; return; }
    const id = (container.id || 'dn') + '-more';
    const main = acts[notes.main.key] || {};
    const others = notes.others || [];
    const moreHtml = (main.more ? `<p>${main.more}</p>` : '')
      + others.map(n => `<p>${esc(n.text)}${acts[n.key] && acts[n.key].inline ? ' ' + acts[n.key].inline : ''}</p>${acts[n.key] && acts[n.key].more ? `<p>${acts[n.key].more}</p>` : ''}`).join('');
    container.innerHTML =
      `<p class="dn-main">${esc(notes.main.text)}${main.inline ? ' ' + main.inline : ''}${moreHtml ? ` <button type="button" class="dn-more" aria-expanded="false" aria-controls="${id}">More about this date</button>` : ''}</p>`
      + (moreHtml ? `<div class="dn-others" id="${id}" hidden>${moreHtml}</div>` : '');
    container.hidden = false;
    const btn = container.querySelector('.dn-more');
    if (btn) btn.addEventListener('click', () => {
      const box = container.querySelector('.dn-others'), open = btn.getAttribute('aria-expanded') !== 'true';
      box.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Less' : 'More about this date';
    });
  }

  window.FirePathDateNote = { render };
})();
