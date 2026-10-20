// Beyaz liste tabanlı HTML temizleyici. Not içerikleri yalnızca bu fonksiyondan
// geçtikten sonra DOM'a yazılır. DOMParser ile ayrıştırılan belge etkisizdir
// (betikler çalışmaz, kaynaklar yüklenmez); çıktı sıfırdan yeniden kurulur.

const ALLOWED = {
  B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [],
  P: [], DIV: [], BR: [], UL: ['data-type'], OL: [], LI: ['data-checked'], A: ['href'],
};
const RENAME = { STRONG: 'B', EM: 'I', STRIKE: 'S', P: 'DIV' };
// İçeriğiyle birlikte tamamen atılan öğeler.
const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'HEAD', 'TITLE',
  'META', 'LINK', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'IMG', 'VIDEO', 'AUDIO',
  'CANVAS', 'PICTURE', 'SOURCE', 'TRACK', 'BASE', 'DIALOG', 'PORTAL', 'XMP', 'PLAINTEXT',
]);
// Satır yapısını korumak için blok olarak açılan öğeler.
const BLOCKISH = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'TR', 'DL', 'DT', 'DD', 'FIGURE', 'ADDRESS', 'ASIDE', 'NAV', 'MAIN']);

const SAFE_URL = /^(https?:|mailto:)/i;

export function safeHref(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : (v.includes('@') && !v.includes('/') ? `mailto:${v}` : `https://${v}`);
  if (!SAFE_URL.test(withProto)) return null;
  try {
    return new URL(withProto).href;
  } catch {
    return null;
  }
}

function cleanChildren(src, dst, doc) {
  for (const node of src.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      dst.append(doc.createTextNode(node.data));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toUpperCase();
    if (DROP.has(tag)) continue;
    const allowed = ALLOWED[tag];
    if (!allowed) {
      if (BLOCKISH.has(tag)) {
        const div = doc.createElement('div');
        cleanChildren(node, div, doc);
        dst.append(div);
      } else {
        cleanChildren(node, dst, doc); // etiketi kaldır, içeriği koru
      }
      continue;
    }
    const el = doc.createElement((RENAME[tag] ?? tag).toLowerCase());
    for (const attr of allowed) {
      const val = node.getAttribute(attr);
      if (val == null) continue;
      if (attr === 'href') {
        const href = safeHref(val);
        if (href) el.setAttribute('href', href);
      } else if (attr === 'data-type' && val === 'checklist') {
        el.setAttribute(attr, val);
      } else if (attr === 'data-checked' && (val === 'true' || val === 'false')) {
        el.setAttribute(attr, val);
      }
    }
    cleanChildren(node, el, doc);
    if (tag === 'A' && !el.hasAttribute('href')) {
      while (el.firstChild) dst.append(el.firstChild);
      continue;
    }
    dst.append(el);
  }
}

export function sanitizeHtml(html) {
  if (!html) return '';
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const root = out.createElement('div');
  cleanChildren(parsed.body, root, out);
  // Kontrol listesindeki maddelerin durumu her zaman tanımlı olsun.
  for (const li of root.querySelectorAll('ul[data-type="checklist"] > li:not([data-checked])')) li.setAttribute('data-checked', 'false');
  return root.innerHTML;
}

export function plainTextToHtml(text) {
  const out = document.implementation.createHTMLDocument('');
  const root = out.createElement('div');
  for (const line of String(text).split(/\r?\n/)) {
    const div = out.createElement('div');
    if (line) div.textContent = line;
    else div.append(out.createElement('br'));
    root.append(div);
  }
  return root.innerHTML;
}
