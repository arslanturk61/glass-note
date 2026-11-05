import { h } from './dom.js';

let host = null;

export function toast(message, { type = 'info', action = null, duration = 4200 } = {}) {
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  let timer;
  const el = h('div', { class: `toast ${type}` },
    h('span', null, message),
    action ? h('button', { class: 'btn sm', onclick: () => { dismiss(); action.onClick(); } }, action.label) : null);
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  };
  host.append(el);
  timer = setTimeout(dismiss, type === 'error' ? Math.max(duration, 7000) : duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2000); });
  return dismiss;
}
