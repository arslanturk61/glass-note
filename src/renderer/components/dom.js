// Küçük DOM oluşturucu. Kullanıcı verisi her zaman metin düğümü olarak eklenir;
// innerHTML yalnızca temizlenmiş not içeriği ve sabit ikon işaretlemesi için kullanılır.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv != null) el.style.setProperty(sk, sv);
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendAll(el, children);
  return el;
}

export function append(el, ...children) {
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendAll(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Öğeyi boşaltır ve isteğe bağlı yeni çocukları ekler (null/false atlanır).
export function clear(el, ...children) {
  while (el.firstChild) el.firstChild.remove();
  appendAll(el, children);
  return el;
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  d.cancel = () => { clearTimeout(t); t = null; };
  d.pending = () => t !== null;
  return d;
}

// Vurgu rengine göre okunaklı ön plan rengi (WCAG göreli parlaklık).
export function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.4 ? '#0F1117' : '#FFFFFF';
}
