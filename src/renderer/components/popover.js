import { h } from './dom.js';
import { icon } from './icons.js';

let current = null;

export function closePopover() {
  if (!current) return;
  const { el, onClose, restoreFocus } = current;
  current = null;
  el.remove();
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('blur', closePopover);
  window.removeEventListener('resize', closePopover);
  onClose?.();
  if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus({ preventScroll: true });
}

export const isPopoverOpen = () => current !== null;

function outside(e) {
  if (current && !current.el.contains(e.target) && !current.anchor?.contains?.(e.target)) closePopover();
}

function onKey(e) {
  if (!current) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closePopover();
    return;
  }
  if (current.el.classList.contains('menu') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = [...current.el.querySelectorAll('.menu-item:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }
}

// anchor: bir öğe veya {x, y} noktası
export function openPopover(anchor, content, { onClose, className = '', align = 'start' } = {}) {
  closePopover();
  const el = h('div', { class: `popover ${className}`, role: className.includes('menu') ? 'menu' : 'dialog' }, content);
  document.body.append(el);
  const pad = 8;
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let x = align === 'end' ? r.right - w : r.left;
  let y = r.bottom + 6;
  if (y + hgt > innerHeight - pad) y = Math.max(pad, r.top - hgt - 6);
  x = Math.min(Math.max(pad, x), innerWidth - w - pad);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  current = { el, onClose, anchor: anchor instanceof Element ? anchor : null, restoreFocus: document.activeElement };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closePopover);
    window.addEventListener('resize', closePopover);
  });
  const first = el.querySelector('.menu-item:not(:disabled), input, button');
  first?.focus({ preventScroll: true });
  return { el, close: closePopover };
}

// items: { label, icon, onSelect, checked, danger, disabled } | 'sep' | { title }
export function openMenu(anchor, items, opts = {}) {
  const nodes = items.filter(Boolean).map((it) => {
    if (it === 'sep') return h('div', { class: 'menu-sep', role: 'separator' });
    if (it.title) return h('div', { class: 'menu-title' }, it.title);
    return h('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`,
      role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
      'aria-checked': it.checked !== undefined ? String(!!it.checked) : null,
      disabled: !!it.disabled,
      onclick: () => { closePopover(); it.onSelect?.(); },
    },
    it.icon ? icon(it.icon, 'sm') : null,
    h('span', null, it.label),
    it.checked ? icon('check', 'sm check') : null);
  });
  return openPopover(anchor, nodes, { ...opts, className: `menu ${opts.className ?? ''}` });
}
