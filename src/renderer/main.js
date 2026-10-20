import { api, state, render, subscribe, setCategories, upsertNotes } from './modules/state.js';
import { h, clear, debounce } from './components/dom.js';
import { icon } from './components/icons.js';
import { openMenu, openPopover, closePopover, isPopoverOpen } from './components/popover.js';
import { toast } from './components/toast.js';
import { applyAppearance } from './modules/theme.js';
import { matchesView, effectiveColor } from './modules/filter.js';
import { createSidebar } from './modules/sidebar.js';
import { createNotesView } from './modules/notes-view.js';
import { createEditorPanel } from './modules/editor-panel.js';
import { createSettingsView } from './modules/settings-view.js';
import { reportError } from './modules/actions.js';

const root = document.getElementById('app');

async function init() {
  const [info, settings, notes, categories, widgetIds] = await Promise.all([
    api.app.info(), api.settings.get(), api.notes.list(), api.categories.list(), api.widgets.openIds(),
  ]);
  state.info = info;
  state.settings = settings;
  upsertNotes(notes);
  setCategories(categories);
  state.widgetIds = new Set(widgetIds);
  document.title = info.name;

  const lv = settings.restoreLastView ? settings.lastView : null;
  if (lv?.view?.type === 'category' ? state.categoriesById.has(lv.view.id) : lv?.view?.type) state.view = lv.view;

  // ------------------------------------------------------------- layout
  const sidebar = createSidebar({ onNavigate: navigate, onNewNote: newNote, onOpenSettings: openSettings });
  const notesView = createNotesView({ onOpen: (id) => editor.open(id), onNewNote: newNote });
  const settingsView = createSettingsView();
  const editor = createEditorPanel({
    // Klavye kullanıcıları için odak, kapatılan notun kartına döner.
    onClosed: (id) => requestAnimationFrame(() => {
      // Bu arada yeni bir not açıldıysa veya kullanıcı başka yere odaklandıysa dokunma.
      const idle = !document.activeElement || document.activeElement === document.body || editor.el.contains(document.activeElement);
      if (editor.isOpen() || !idle) return;
      const card = notesView.scroll.querySelector(`.card[data-id="${id}"]`);
      (card ?? notesView.scroll).focus({ preventScroll: true });
    }),
  });

  const searchInput = h('input', {
    type: 'text', placeholder: 'Notlarda ara…', 'aria-label': 'Notlarda ara (başlık, içerik, kategori, #etiket)', spellcheck: 'false',
  });
  const searchClear = h('button', { class: 'icon-btn sm clear', 'aria-label': 'Aramayı temizle', title: 'Temizle', onclick: () => setSearch('') }, icon('close', 'xs'));
  const searchKbd = h('kbd', null, 'Ctrl F');
  const runSearch = debounce(() => render(), 90);
  function setSearch(v) {
    searchInput.value = v;
    state.search = v;
    if (state.page !== 'notes') state.page = 'notes';
    render();
  }
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    if (state.page !== 'notes') state.page = 'notes';
    runSearch();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchInput.value) { e.stopPropagation(); setSearch(''); }
    if (e.key === 'Enter') notesView.scroll.querySelector('.card')?.focus();
  });

  const topActions = h('div', { class: 'top-actions' });
  const topbar = h('header', { class: 'topbar drag' },
    h('div', { class: 'search' }, icon('search', 'sm'), searchInput, searchKbd, searchClear),
    topActions);
  const mainArea = h('div', { class: 'main-area', style: { display: 'contents' } });
  const main = h('main', { class: 'main' }, topbar, mainArea);
  root.append(sidebar.el, main, editor.el);

  function renderTopActions() {
    const s = state.settings;
    const hasSearch = !!state.search;
    searchClear.style.display = hasSearch ? '' : 'none';
    searchKbd.style.display = hasSearch ? 'none' : '';

    const colorBtn = h('button', {
      class: `icon-btn${state.color ? ' on' : ''}`, title: 'Renge göre filtrele', 'aria-label': 'Renge göre filtrele',
      onclick: () => {
        const used = [...new Set([...state.notes.values()].filter((n) => !n.deleted_at).map((n) => effectiveColor(n, state.categoriesById)).filter(Boolean))];
        const pick = (c) => { state.color = c; closePopover(); render(); };
        openPopover(colorBtn, h('div', { class: 'color-picker' },
          h('div', { class: 'menu-title' }, 'Renge göre filtrele'),
          used.length
            ? h('div', { class: 'swatches' }, used.map((c) => h('button', {
              class: 'swatch', style: { '--c': c }, title: c, 'aria-label': c, 'aria-pressed': String(state.color === c), onclick: () => pick(c),
            })))
            : h('p', { class: 'hint' }, 'Henüz renkli not yok.'),
          h('button', { class: 'btn sm', onclick: () => pick(null), disabled: !state.color }, 'Tüm renkler')), { align: 'end' });
      },
    }, state.color ? h('span', { class: 'color-filter-dot', style: { '--c': state.color } }) : icon('drop'));

    const sortLabels = { updated: 'Son düzenlenen', created: 'Oluşturulma tarihi', title: 'Başlık (A–Z)', category: 'Kategori' };
    const sortBtn = h('button', {
      class: 'icon-btn', title: `Sırala: ${sortLabels[s.sortBy]}`, 'aria-label': `Sıralama: ${sortLabels[s.sortBy]}`,
      onclick: () => openMenu(sortBtn, [
        { title: 'Sırala' },
        ...Object.entries(sortLabels).map(([k, label]) => ({ label, checked: s.sortBy === k, onSelect: () => setSetting('sortBy', k) })),
        'sep',
        { label: 'Sabitlenenler önce', icon: 'pin', checked: s.pinnedFirst, onSelect: () => setSetting('pinnedFirst', !s.pinnedFirst) },
      ], { align: 'end' }),
    }, icon('sort'));

    const viewBtn = (mode, ic, label) => h('button', {
      class: `icon-btn${s.viewMode === mode ? ' on' : ''}`, title: label, 'aria-label': label, 'aria-pressed': String(s.viewMode === mode),
      onclick: () => setSetting('viewMode', mode),
    }, icon(ic));

    clear(topActions, 
      colorBtn, sortBtn, viewBtn('grid', 'grid', 'Izgara görünümü'), viewBtn('list', 'list', 'Liste görünümü'),
      h('span', { class: 'divider' }),
      h('button', { class: `icon-btn${state.page === 'settings' ? ' on' : ''}`, title: 'Ayarlar', 'aria-label': 'Ayarlar', onclick: openSettings }, icon('sliders')),
      h('button', { class: 'btn primary sm', title: 'Yeni not (Ctrl+N)', 'aria-label': 'Yeni not', onclick: newNote }, icon('plus', 'sm'), h('span', { class: 'btn-text' }, 'Yeni not')),
    );
  }

  let shownPage = null;
  function renderAll() {
    root.classList.toggle('sidebar-collapsed', state.settings.sidebarCollapsed);
    sidebar.render();
    renderTopActions();
    if (shownPage !== state.page) {
      clear(mainArea, ...(state.page === 'settings' ? [settingsView.head, settingsView.el] : [notesView.head, notesView.scroll]));
      shownPage = state.page;
    }
    if (state.page === 'settings') settingsView.render();
    else notesView.render();
  }
  subscribe(renderAll);

  // ---------------------------------------------------------- navigation
  const saveLastView = debounce(() => {
    if (state.settings.restoreLastView) api.settings.set('lastView', { view: state.view }).catch(() => {});
  }, 500);

  function navigate(view) {
    state.page = 'notes';
    state.view = view;
    state.color = null;
    saveLastView();
    render();
    notesView.scroll.scrollTop = 0;
  }

  function openSettings() {
    state.page = 'settings';
    render();
  }

  async function setSetting(key, value) {
    state.settings[key] = value;
    render();
    try {
      await api.settings.set(key, value);
    } catch (e) {
      reportError(e);
    }
  }

  async function newNote() {
    state.page = 'notes';
    const view = state.view;
    if (['archive', 'trash', 'reminders'].includes(view.type)) state.view = { type: 'all' };
    const input = {};
    if (view.type === 'category') input.category_id = view.id;
    if (view.type === 'pinned') input.is_pinned = true;
    if (view.type === 'favorites') input.is_favorite = true;
    state.color = null;
    if (state.search) setSearch('');
    try {
      const n = await api.notes.create(input);
      upsertNotes([n]);
      render();
      await editor.open(n.id, { focus: 'title', created: true });
    } catch (e) {
      reportError(e, 'Not oluşturulamadı: ');
    }
  }

  // Tepsi menüsü, bildirim veya widget'tan gelen "notu aç" isteği.
  async function openFromOutside(id) {
    let n = state.notes.get(id);
    if (!n) {
      upsertNotes(await api.notes.list());
      n = state.notes.get(id);
      if (!n) return;
    }
    state.page = 'notes';
    if (!matchesView(n, state.view)) state.view = { type: n.deleted_at ? 'trash' : n.is_archived ? 'archive' : 'all' };
    if (state.search) setSearch('');
    state.color = null;
    render();
    await editor.open(id, { focus: 'content' });
    requestAnimationFrame(() => notesView.scroll.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  // -------------------------------------------------------------- events
  api.on('notes:changed', ({ notes, removed }) => {
    upsertNotes(notes, removed);
    for (const n of notes) editor.external(n);
    for (const id of removed) editor.removed(id);
    render();
  });
  api.on('notes:reload', async () => {
    state.notes.clear();
    upsertNotes(await api.notes.list());
    const id = editor.currentId();
    if (id && !state.notes.has(id)) editor.removed(id);
    render();
  });
  api.on('categories:changed', (list) => {
    setCategories(list);
    if (state.view.type === 'category' && !state.categoriesById.has(state.view.id)) state.view = { type: 'all' };
    editor.refresh();
    render();
  });
  api.on('settings:changed', (s) => {
    state.settings = { ...s, lastView: state.settings.lastView };
    applyAppearance(state.settings, { glassEnabled: state.info.supportsGlass });
    render();
  });
  api.on('widgets:changed', (ids) => {
    state.widgetIds = new Set(ids);
    editor.refresh();
    render();
  });
  api.on('app:open-note', (id) => openFromOutside(id).catch(reportError));
  api.on('app:new-note', () => newNote());
  api.on('app:show-settings', () => openSettings());
  api.on('app:flush', () => editor.flush());

  window.addEventListener('beforeunload', () => editor.flushSync());
  document.addEventListener('visibilitychange', () => { if (document.hidden) editor.flush(); });

  // Pencereye dosya bırakmak gezinmeye yol açmasın.
  for (const ev of ['dragover', 'drop']) {
    window.addEventListener(ev, (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'n') { e.preventDefault(); newNote(); return; }
    if (mod && k === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); return; }
    if (mod && k === 's') {
      e.preventDefault();
      editor.flush().then((ok) => { if (ok && editor.isOpen()) toast('Kaydedildi', { duration: 1200 }); });
      return;
    }
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
    if (e.key === 'Escape' && !isPopoverOpen() && !document.querySelector('dialog[open]')) {
      if (editor.isOpen()) { e.preventDefault(); editor.close(); } else if (state.page === 'settings') { state.page = 'notes'; render(); }
    }
  });

  // Göreli zamanlar ("5 dk önce") güncel kalsın.
  setInterval(() => { if (!document.hidden && state.page === 'notes') render(); }, 60_000);

  applyAppearance(settings, { glassEnabled: info.supportsGlass });
  renderAll();
  root.removeAttribute('aria-busy');
}

init().catch((e) => {
  root.removeAttribute('aria-busy');
  root.append(h('div', { class: 'empty', style: { 'grid-column': '1 / -1' } },
    h('h2', null, 'Uygulama başlatılamadı'), h('p', null, String(e?.message ?? e))));
});
