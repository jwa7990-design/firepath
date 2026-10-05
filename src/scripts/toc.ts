/**
 * Keeps a contents list ([data-toc="<id>"] links) in step with the section being
 * read ([data-doc-section] elements): the current section is the last one whose
 * top has passed just under the sticky nav, or the final one at the page bottom.
 */
export function followSections() {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-doc-section]'));
  const links = new Map(Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc]')).map(a => [a.dataset.toc, a]));
  if (!sections.length || !links.size) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const visible = sections.filter(s => !s.hidden);
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let current = visible[0];
    for (const s of visible) if (s.getBoundingClientRect().top <= 140) current = s;
    if (atBottom) current = visible[visible.length - 1];
    links.forEach((a, id) => id === current?.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
  return update;
}
