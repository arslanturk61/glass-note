import { h } from './dom.js';

// <dialog> tabanlı modal: odak hapsi, Esc ve arka plan yerel olarak gelir.
export function openDialog(build, { className = '' } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `modal ${className}` });
    let result;
    const close = (value) => {
      result = value;
      dlg.close();
    };
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    dlg.addEventListener('mousedown', (e) => {
      if (e.target === dlg) close(undefined); // arka plana tıklama
    });
    dlg.append(build(close));
    document.body.append(dlg);
    dlg.showModal();
    const focusTarget = dlg.querySelector('[autofocus]') ?? dlg.querySelector('input, .btn.primary, .btn');
    focusTarget?.focus();
  });
}

export function confirmDialog({ title, message, confirmText = 'Onayla', cancelText = 'Vazgeç', danger = false }) {
  return openDialog((close) => h('form', {
    method: 'dialog',
    onsubmit: (e) => { e.preventDefault(); close(true); },
  },
  h('div', { class: 'modal-body' }, h('h2', null, title), message ? h('p', null, message) : null),
  h('div', { class: 'modal-actions' },
    h('button', { type: 'button', class: 'btn ghost', onclick: () => close(false) }, cancelText),
    h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}`, autofocus: true }, confirmText)))).then(Boolean);
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmText = 'Kaydet', validate }) {
  return openDialog((close) => {
    const input = h('input', { class: 'input', value, placeholder, autofocus: true, spellcheck: 'false' });
    const err = h('div', { class: 'error-text', role: 'alert' });
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const msg = validate?.(input.value);
        if (msg) {
          err.textContent = msg;
          input.classList.add('invalid');
          input.focus();
          return;
        }
        close(input.value);
      },
    },
    h('div', { class: 'modal-body' }, h('h2', null, title), h('div', { class: 'field' }, label ? h('label', null, label) : null, input, err)),
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn primary' }, confirmText)));
  }).then((v) => (v === undefined ? null : v));
}
