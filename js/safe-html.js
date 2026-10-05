/**
 * FirePath — safe HTML for AI-written text
 * =========================================
 * Anything an AI model writes (insights, lesson text, glossary answers, plan
 * steps) can be steered by what a person types, so it must never be inserted
 * into a page as raw HTML. These helpers keep the harmless formatting the AI
 * legitimately uses — bold, italics, line breaks, headings, lists, tables and
 * the Learning Lab boxes — and strip everything that can run code: scripts,
 * event handlers (onclick, onerror…), javascript: links, frames, forms, styles.
 *
 * Usage:
 *   el.innerHTML = FirePathSafe.aiText(reply);   // plain AI reply (**bold**, line breaks)
 *   el.innerHTML = FirePathSafe.html(markup);    // AI or stored HTML (articles, saved insights)
 *   `<div>${FirePathSafe.escape(value)}</div>`   // a value that should never contain HTML
 */
window.FirePathSafe = (function () {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'small', 'sup', 'sub', 'code', 'hr',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'
  ]);
  // Removed together with everything inside them.
  const DROP_TAGS = new Set([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta',
    'base', 'form', 'input', 'button', 'select', 'option', 'textarea', 'svg', 'math', 'template',
    'noscript', 'video', 'audio', 'source', 'track', 'canvas', 'img', 'picture', 'title'
  ]);
  const TAG_ATTRS = { a: ['href', 'title'], th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'], ol: ['start'] };
  const SAFE_CLASS = /^[A-Za-z0-9_\- ]{0,120}$/;
  const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

  function cleanChildren(parent) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) continue;
      if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); continue; }   // comments etc.
      const tag = node.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) { node.remove(); continue; }
      cleanChildren(node);
      if (!ALLOWED_TAGS.has(tag)) { node.replaceWith(...node.childNodes); continue; }  // keep the text, lose the tag
      const keep = TAG_ATTRS[tag] || [];
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === 'class' && SAFE_CLASS.test(attr.value)) continue;
        if (keep.includes(name)) {
          if (name === 'href' && !SAFE_HREF.test(attr.value.trim())) { node.removeAttribute(attr.name); continue; }
          if ((name === 'colspan' || name === 'rowspan' || name === 'start') && !/^\d{1,3}$/.test(attr.value)) { node.removeAttribute(attr.name); continue; }
          continue;
        }
        node.removeAttribute(attr.name);
      }
      if (tag === 'a' && node.hasAttribute('href') && /^https?:/i.test(node.getAttribute('href'))) {
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }
    }
  }

  // Parses inside an inert <template>: nothing in it loads or runs while we clean it.
  function html(dirty) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(dirty == null ? '' : dirty);
    cleanChildren(tpl.content);
    return tpl.innerHTML;
  }

  function aiText(text) {
    const withFormatting = String(text == null ? '' : text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\r?\n/g, '<br>');
    return html(withFormatting);
  }

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { html, aiText, escape };
})();
