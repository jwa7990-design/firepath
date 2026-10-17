/**
 * Shared by the Learning Lab dashboards (hub and shelves): ticks on guides read on this device, and on
 * wide screens with a mouse, the board leaning very slightly towards the pointer (--rx / --ry).
 */
import { getRead } from './lab-progress';

export function tickRead(): Set<string> {
  const read = new Set(getRead());
  document.querySelectorAll<HTMLElement>('[data-slug]').forEach(el => { if (read.has(el.dataset.slug!)) el.classList.add('is-read'); });
  return read;
}

export function leanBoard() {
  const plane = document.getElementById('labPlane');
  const board = plane?.closest('.lab-board') as HTMLElement | null;
  if (!plane || !board || !window.matchMedia) return;
  const lean = window.matchMedia('(min-width: 900px) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let raf = 0;
  board.addEventListener('pointermove', e => {
    if (!lean.matches || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = board.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      plane.style.setProperty('--ry', `${(x * 3).toFixed(2)}deg`);
      plane.style.setProperty('--rx', `${(2 - y * 2.4).toFixed(2)}deg`);
    });
  });
  board.addEventListener('pointerleave', () => { plane.style.removeProperty('--rx'); plane.style.removeProperty('--ry'); });
}
