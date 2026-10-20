import { h } from './dom.js';
import { icon } from './icons.js';
import { sanitizeHtml, plainTextToHtml, safeHref } from './sanitize.js';

const HEADINGS = [
  { cmd: 'h1', text: 'H1', label: 'Başlık 1 (Ctrl+Alt+1)' },
  { cmd: 'h2', text: 'H2', label: 'Başlık 2 (Ctrl+Alt+2)' },
  { cmd: 'h3', text: 'H3', label: 'Başlık 3 (Ctrl+Alt+3)' },
  'sep',
];
// Dar alanlar (widget) için tek düğme: Normal → H1 → H2 → H3 → Normal
const HEADING_CYCLE = [{ cmd: 'heading', text: 'H', label: 'Başlık (tıkladıkça H1 › H2 › H3 › normal metin)' }, 'sep'];

const TOOLS = [
  { cmd: 'bold', icon: 'bold', label: 'Kalın (Ctrl+B)' },
  { cmd: 'italic', icon: 'italic', label: 'İtalik (Ctrl+I)' },
  { cmd: 'underline', icon: 'underline', label: 'Altı çizili (Ctrl+U)' },
  'sep',
  { cmd: 'bullets', icon: 'bullets', label: 'Madde işaretli liste' },
  { cmd: 'numbers', icon: 'numbers', label: 'Numaralı liste' },
  { cmd: 'checklist', icon: 'checklist', label: 'Görev listesi' },
  'sep',
  { cmd: 'link', icon: 'link', label: 'Bağlantı ekle (Ctrl+K)' },
];

// contenteditable tabanlı, bilinçli olarak sade bir editör.
// askLink(currentHref) -> Promise<string|null>  ('' = bağlantıyı kaldır)
export function createRichEditor({ placeholder = 'Yazmaya başlayın…', onChange, askLink, openLink, compact = false }) {
  const el = h('div', {
    class: 'rich', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
    'aria-label': 'Not içeriği', 'data-placeholder': placeholder, spellcheck: 'true',
  });
  const buttons = new Map();

  const inEditor = (node) => node && el.contains(node);
  function closest(tag) {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n !== el) {
      if (n.nodeType === 1 && n.tagName === tag) return n;
      n = n.parentNode;
    }
    return null;
  }

  function refreshEmpty() {
    const empty = !el.textContent.trim() && !el.querySelector('li');
    el.classList.toggle('is-empty', empty);
  }

  function changed() {
    refreshEmpty();
    refreshToolbar();
    onChange?.();
  }

  function exec(cmd, value = null) {
    el.focus();
    document.execCommand(cmd, false, value);
  }

  function currentHeading() {
    return closest('H1') ?? closest('H2') ?? closest('H3');
  }

  // Aynı başlığa tekrar basmak satırı normal metne çevirir.
  function setBlock(tag) {
    const cur = currentHeading()?.tagName.toLowerCase() ?? 'div';
    exec('formatBlock', tag === cur ? 'div' : tag);
  }

  function currentList() {
    const li = closest('LI');
    return li ? li.parentElement : null;
  }

  async function run(cmd) {
    const list = currentList();
    const isChecklist = list?.tagName === 'UL' && list.dataset.type === 'checklist';
    switch (cmd) {
      case 'h1':
      case 'h2':
      case 'h3':
        setBlock(cmd);
        break;
      case 'paragraph':
        exec('formatBlock', 'div');
        break;
      case 'heading': {
        const order = ['div', 'h1', 'h2', 'h3'];
        const cur = currentHeading()?.tagName.toLowerCase() ?? 'div';
        exec('formatBlock', order[(order.indexOf(cur) + 1) % order.length]);
        break;
      }
      case 'bold':
      case 'italic':
      case 'underline':
        exec(cmd);
        break;
      case 'bullets':
        if (isChecklist) {
          list.removeAttribute('data-type');
          for (const li of list.children) li.removeAttribute('data-checked');
        } else exec('insertUnorderedList');
        break;
      case 'numbers':
        exec('insertOrderedList');
        break;
      case 'checklist':
        if (isChecklist) {
          list.removeAttribute('data-type');
          for (const li of list.children) li.removeAttribute('data-checked');
          exec('insertUnorderedList');
        } else {
          if (!list || list.tagName !== 'UL') exec('insertUnorderedList');
          const ul = closest('UL');
          if (ul) {
            ul.dataset.type = 'checklist';
            for (const li of ul.children) if (!li.dataset.checked) li.dataset.checked = 'false';
          }
        }
        break;
      case 'link':
        await editLink();
        break;
      default:
        return;
    }
    changed();
  }

  async function editLink() {
    if (!askLink) return;
    const sel = getSelection();
    const range = sel.rangeCount && inEditor(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const existing = closest('A');
    const answer = await askLink(existing?.getAttribute('href') ?? '');
    if (answer === null) return;
    el.focus();
    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (answer === '') {
      if (existing) {
        const r = document.createRange();
        r.selectNodeContents(existing);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      document.execCommand('unlink');
      return;
    }
    const href = safeHref(answer);
    if (!href) return;
    if (existing) {
      existing.setAttribute('href', href);
    } else if (range && !range.collapsed) {
      document.execCommand('createLink', false, href);
    } else {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = answer.trim();
      document.execCommand('insertHTML', false, a.outerHTML);
    }
  }

  function refreshToolbar() {
    if (!buttons.size) return;
    const sel = getSelection();
    const active = sel.rangeCount && inEditor(sel.anchorNode);
    const list = active ? currentList() : null;
    const heading = active ? currentHeading()?.tagName.toLowerCase() : null;
    const state = {
      h1: heading === 'h1',
      h2: heading === 'h2',
      h3: heading === 'h3',
      heading: !!heading,
      bold: active && document.queryCommandState('bold'),
      italic: active && document.queryCommandState('italic'),
      underline: active && document.queryCommandState('underline'),
      bullets: list?.tagName === 'UL' && list.dataset.type !== 'checklist',
      numbers: list?.tagName === 'OL',
      checklist: list?.tagName === 'UL' && list.dataset.type === 'checklist',
      link: active && !!closest('A'),
    };
    for (const [cmd, b] of buttons) b.setAttribute('aria-pressed', String(!!state[cmd]));
  }

  // --- olaylar
  el.addEventListener('input', (e) => {
    if (e.inputType === 'insertParagraph') {
      const li = closest('LI');
      if (li && li.parentElement?.dataset.type === 'checklist' && !li.textContent.trim()) li.dataset.checked = 'false';
    }
    changed();
  });

  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      run('link');
    }
    // Ctrl+Alt+1/2/3 başlık, Ctrl+Alt+0 normal metin (e.code klavye düzeninden bağımsız).
    if (e.ctrlKey && e.altKey && /^Digit[0-3]$/.test(e.code)) {
      e.preventDefault();
      const n = e.code.slice(-1);
      run(n === '0' ? 'paragraph' : `h${n}`);
    }
  });

  el.addEventListener('mousedown', (e) => {
    const li = e.target.closest?.('li');
    if (li && li.parentElement?.dataset.type === 'checklist' && inEditor(li)) {
      const left = li.getBoundingClientRect().left;
      const box = parseFloat(getComputedStyle(li).fontSize) * 1.5;
      if (e.clientX - left <= box) {
        e.preventDefault();
        li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
        changed();
      }
    }
  });

  el.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && inEditor(a) && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openLink?.(a.getAttribute('href'));
    }
  });

  el.addEventListener('mouseover', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && !a.title) a.title = `${a.getAttribute('href')}\nCtrl + tıklayarak açın`;
  });

  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = html ? sanitizeHtml(html) : plainTextToHtml(text);
    if (clean) document.execCommand('insertHTML', false, clean);
  });

  el.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) e.preventDefault();
  });

  const onSelection = () => refreshToolbar();
  document.addEventListener('selectionchange', onSelection);

  function toolbar() {
    return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Biçimlendirme' },
      [...(compact ? HEADING_CYCLE : HEADINGS), ...TOOLS].map((t) => {
        if (t === 'sep') return h('span', { class: 'sep', 'aria-hidden': 'true' });
        const b = h('button', {
          class: `icon-btn sm${t.text ? ' text-btn' : ''}`, type: 'button', title: t.label, 'aria-label': t.label, 'aria-pressed': 'false', dataset: { cmd: t.cmd },
          onmousedown: (e) => e.preventDefault(), // editörün odağını ve seçimini koru
          onclick: () => run(t.cmd),
        }, t.text ?? icon(t.icon, 'sm'));
        buttons.set(t.cmd, b);
        return b;
      }));
  }

  return {
    el,
    toolbar,
    setHTML(html) {
      el.innerHTML = sanitizeHtml(html);
      refreshEmpty();
    },
    getHTML() {
      const html = sanitizeHtml(el.innerHTML);
      return el.textContent.trim() || el.querySelector('li') ? html : '';
    },
    focus(atEnd = true) {
      el.focus();
      if (atEnd) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    },
    hasFocus: () => el.contains(document.activeElement) || document.activeElement === el,
    destroy: () => document.removeEventListener('selectionchange', onSelection),
  };
}
