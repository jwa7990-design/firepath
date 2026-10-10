// js/note-prompts.js — the "anything else?" note, made useful.
// Under the note: tap-to-add prompts for what would make this person's date more accurate
// (only the ones that apply to them, and only until they're answered), then a "Counted"
// list of what FirePath read from the note (FirePathEngine.noteFacts) and used. Optional:
// people tap a prompt only if they want to. Used by the free calculator and Your full plan.
//
//   FirePathNotePrompts.attach({
//     textarea,                 // the note
//     mount,                    // an element to draw into (below the note)
//     context: () => ({ hasMortgage, working, hasSuper, invests }),
//     onChange: facts => {},    // the latest noteFacts result, after each edit
//   }) → { refresh() }
(function () {
  const PROMPTS = [
    { key: 'mortgage', when: c => c.hasMortgage, label: 'Mortgage repayments', text: 'Mortgage repayments $___ a month', pick: '___' },
    { key: 'employer', when: c => c.working, label: 'Employer super above 12%', text: 'My employer pays ___% super', pick: '___' },
    { key: 'insurance', when: c => c.hasSuper, label: 'Insurance through super', text: 'Super insurance about $___ a year', pick: '___' },
    { key: 'aus', when: c => c.invests, label: 'Australian shares', text: 'About half of my investments are in Australian shares', pick: 'half' },
  ];

  let styled = false;
  function addStyles() {
    if (styled) return;
    styled = true;
    const css = `
.np { margin-top: 12px; }
.np-lead { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); }
.np-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.np-chip { appearance: none; border: 1px solid var(--line-strong, var(--line)); background: transparent; color: var(--ink); border-radius: 999px; padding: 7px 12px; font: 500 13.5px/1.2 var(--font-ui, inherit); cursor: pointer; }
.np-chip:hover { border-color: var(--ink); }
.np-chip:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.np-counted { list-style: none; margin: 10px 0 0; padding: 0; }
.np-counted li { font-size: 14px; line-height: 1.5; color: var(--ink); }
.np-counted li::before { content: '\\2713'; margin-right: 6px; color: var(--hp-accent, var(--ember-ink, currentColor)); font-weight: 700; }
.np-counted-head { margin: 10px 0 2px; font-size: 13px; font-weight: 600; color: var(--ink); }`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function attach(o) {
    const E = window.FirePathEngine;
    if (!o || !o.textarea || !o.mount || !E || !E.noteFacts) return { refresh() {} };
    addStyles();
    const ta = o.textarea, mount = o.mount;
    mount.classList.add('np');

    function insert(p) {
      const v = ta.value.replace(/\s+$/, '');
      const start = (v ? v + (/[.!?]$/.test(v) ? ' ' : '. ') : '').length;
      ta.value = (v ? v + (/[.!?]$/.test(v) ? ' ' : '. ') : '') + p.text;
      ta.focus();
      const at = start + p.text.indexOf(p.pick);
      try { ta.setSelectionRange(at, at + p.pick.length); } catch (e) {}
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function refresh() {
      const facts = E.noteFacts(ta.value);
      const have = new Set(facts.counted.map(c => c.key));
      const ctx = (o.context && o.context()) || {};
      const chips = PROMPTS.filter(p => p.when(ctx) && !have.has(p.key));
      mount.innerHTML = '';
      if (chips.length) {
        const lead = document.createElement('p');
        lead.className = 'np-lead';
        lead.textContent = 'The more you add, the more accurate your date. Tap to add:';
        mount.appendChild(lead);
        const row = document.createElement('div');
        row.className = 'np-chips';
        chips.forEach(p => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'np-chip';
          b.textContent = '+ ' + p.label;
          b.addEventListener('click', () => insert(p));
          row.appendChild(b);
        });
        mount.appendChild(row);
      }
      if (facts.counted.length) {
        const head = document.createElement('p');
        head.className = 'np-counted-head';
        head.textContent = 'Counted in your numbers:';
        const ul = document.createElement('ul');
        ul.className = 'np-counted';
        ul.setAttribute('aria-live', 'polite');
        facts.counted.forEach(c => { const li = document.createElement('li'); li.textContent = c.text; ul.appendChild(li); });
        mount.appendChild(head);
        mount.appendChild(ul);
      }
      if (o.onChange) o.onChange(facts);
    }

    ta.addEventListener('input', refresh);
    refresh();
    return { refresh };
  }

  window.FirePathNotePrompts = { attach, PROMPTS };
})();
