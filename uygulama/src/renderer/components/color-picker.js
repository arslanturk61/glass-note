import { h } from './dom.js';

const HEX = /^#?[0-9a-fA-F]{6}$/;

// Hazır palet + yerel renk seçici + HEX girişi. value === null "otomatik" demektir.
export function colorPicker({ value, palette, allowAuto = false, autoLabel = 'Otomatik', onChange }) {
  const swatches = [];

  const hexInput = h('input', {
    class: 'input', value: value ?? '', placeholder: '#RRGGBB', maxlength: '7', spellcheck: 'false', 'aria-label': 'HEX renk kodu',
  });
  const native = h('input', { type: 'color', value: value ?? palette[0].hex, 'aria-label': 'Özel renk seç' });

  function set(v, from) {
    for (const s of swatches) s.setAttribute('aria-pressed', String(s.dataset.value === String(v)));
    if (from !== 'hex') hexInput.value = v ?? '';
    if (from !== 'native' && v) native.value = v.toLowerCase();
    hexInput.classList.remove('invalid');
    onChange?.(v);
  }

  if (allowAuto) {
    swatches.push(h('button', {
      class: 'swatch auto', type: 'button', title: autoLabel, 'aria-label': autoLabel, dataset: { value: 'null' },
      'aria-pressed': String(value === null), onclick: () => set(null),
    }));
  }
  for (const c of palette) {
    swatches.push(h('button', {
      class: 'swatch', type: 'button', title: `${c.name} ${c.hex}`, 'aria-label': c.name, dataset: { value: c.hex },
      style: { '--c': c.hex }, 'aria-pressed': String(value === c.hex), onclick: () => set(c.hex),
    }));
  }

  native.addEventListener('input', () => set(native.value.toUpperCase(), 'native'));
  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim();
    if (HEX.test(v)) set(`#${v.replace('#', '').toUpperCase()}`, 'hex');
    else hexInput.classList.toggle('invalid', v.length > 0);
  });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  return h('div', { class: 'color-picker' },
    h('div', { class: 'swatches' }, swatches),
    h('div', { class: 'custom-color' }, native, hexInput));
}
