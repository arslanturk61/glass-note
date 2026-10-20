import { h, clear, debounce } from './components/dom.js';
import { icon } from './components/icons.js';
import { createRichEditor } from './components/rich-editor.js';
import { promptDialog } from './components/dialog.js';
import { safeHref } from './components/sanitize.js';
import { applyAppearance } from './modules/theme.js';

const api = window.glassnote;
const root = document.getElementById('widget');
const AUTOSAVE_DELAY = 600;

async function init() {
  const { noteId, state: initialState, glassSupported } = await api.widget.init();
  let [note, settings, categories] = await Promise.all([api.notes.get(noteId), api.settings.get(), api.categories.list()]);
  let wstate = initialState;
  if (!note) {
    root.classList.add('missing');
    root.textContent = 'Bu not artık mevcut değil.';
    return;
  }

  let pending = {};
  let inflight = null;

  const status = h('span', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const titleInput = h('input', { class: 'w-title', placeholder: 'Başlık', maxlength: '500', 'aria-label': 'Not başlığı', spellcheck: 'true' });
  const catLabel = h('span', { class: 'w-cat' });
  const dot = h('span', { class: 'dot' });

  const editor = createRichEditor({
    placeholder: 'Not yazın…',
    onChange: () => queue({ content: editor.getHTML() }),
    askLink: (current) => promptDialog({
      title: current ? 'Bağlantıyı düzenle' : 'Bağlantı ekle',
      label: 'Adres (boş = kaldır)',
      value: current,
      placeholder: 'https://ornek.com',
      validate: (v) => (v.trim() && !safeHref(v) ? 'Yalnızca http, https ve e-posta bağlantıları.' : null),
    }),
    openLink: (href) => api.app.openExternal(href).catch(() => {}),
  });

  const onTopBtn = h('button', {
    class: 'icon-btn sm', 'aria-label': 'Her zaman üstte', onclick: async () => {
      await api.widget.setAlwaysOnTop(!wstate.always_on_top).catch(() => {});
    },
  }, icon('layers', 'sm'));
  const menuBtn = h('button', { class: 'icon-btn sm', title: 'Widget menüsü', 'aria-label': 'Widget menüsü', onclick: () => api.widget.menu() }, icon('more', 'sm'));
  const closeBtn = h('button', {
    class: 'icon-btn sm', title: "Widget'ı kapat (not silinmez)", 'aria-label': "Widget'ı kapat",
    onclick: async () => { await flush(); api.widget.close(); },
  }, icon('close', 'sm'));

  root.append(
    // Sürükleme alanı yalnızca bu başlık şerididir; metin alanları ayrı tutulur.
    h('header', { class: 'w-head drag', ondblclick: () => api.app.showMain({ noteId }) }, dot, catLabel, h('div', { class: 'w-actions' }, onTopBtn, menuBtn, closeBtn)),
    titleInput,
    h('div', { class: 'w-body', onclick: (e) => { if (e.target === e.currentTarget) editor.focus(true); } }, editor.el),
    h('footer', { class: 'w-toolbar' }, h('div', { class: 'toolbar-wrap', style: { display: 'flex', 'align-items': 'center' } }, editor.toolbar(), status)),
  );

  function setStatus(kind, text) {
    status.className = `status ${kind}`;
    status.textContent = text;
  }

  const saveSoon = debounce(() => flush(), AUTOSAVE_DELAY);
  function queue(patch) {
    Object.assign(pending, patch);
    if (settings.autosave) { setStatus('', 'Kaydediliyor…'); saveSoon(); } else setStatus('', 'Kaydedilmedi · Ctrl+S');
  }

  async function flush() {
    saveSoon.cancel();
    if (inflight) await inflight;
    if (!Object.keys(pending).length) return true;
    const patch = pending;
    pending = {};
    inflight = api.notes.update(noteId, patch).then((saved) => {
      note = saved;
      if (!Object.keys(pending).length) setStatus('', 'Kaydedildi');
      return true;
    }).catch((e) => {
      pending = { ...patch, ...pending };
      setStatus('error', 'Kaydedilemedi');
      status.title = e.message;
      return false;
    }).finally(() => { inflight = null; });
    return inflight;
  }

  function look() {
    const cat = categories.find((c) => c.id === note.category_id);
    const color = note.color ?? cat?.color ?? settings.accentColor;
    root.style.setProperty('--nc', color);
    catLabel.textContent = cat ? cat.name : (note.is_pinned ? 'Sabitlenmiş' : '');
    const glass = glassSupported && wstate.glass;
    root.classList.toggle('opaque', !glass);
    applyAppearance(settings, { glassEnabled: glass });
    onTopBtn.classList.toggle('on', wstate.always_on_top);
    onTopBtn.setAttribute('aria-pressed', String(wstate.always_on_top));
    onTopBtn.title = wstate.always_on_top ? 'Her zaman üstte: açık' : 'Her zaman üstte: kapalı';
    document.title = note.title || 'Not';
  }

  function fill() {
    titleInput.value = note.title;
    editor.setHTML(note.content);
    look();
  }

  titleInput.addEventListener('input', () => queue({ title: titleInput.value }));
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(true); } });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
  });

  api.on('notes:changed', ({ notes, removed }) => {
    if (removed.includes(noteId)) return;
    const n = notes.find((x) => x.id === noteId);
    if (!n) return;
    const editing = root.contains(document.activeElement) && document.activeElement !== document.body;
    const contentChanged = n.content !== note.content || n.title !== note.title;
    note = n;
    if (contentChanged && !editing && !Object.keys(pending).length) fill();
    else look();
  });
  api.on('categories:changed', (list) => { categories = list; look(); });
  api.on('settings:changed', (s) => { settings = s; look(); });
  api.on('widget:state', (s) => { wstate = s; look(); });
  api.on('notes:reload', async () => {
    const n = await api.notes.get(noteId);
    if (n) { note = n; fill(); }
  });
  api.on('app:flush', () => flush());
  window.addEventListener('beforeunload', () => {
    saveSoon.cancel();
    if (Object.keys(pending).length) api.notes.updateSync(noteId, pending);
  });
  for (const ev of ['dragover', 'drop']) {
    window.addEventListener(ev, (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  }

  fill();
  if (!note.title && !note.content) titleInput.focus();
}

init().catch((e) => {
  clear(root, h('div', { class: 'missing' }, String(e?.message ?? e)));
  root.classList.add('missing');
});
