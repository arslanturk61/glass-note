import { api, state, render, VIEW_LABELS } from './state.js';
import { h, clear } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { openMenu } from '../components/popover.js';
import { matchesView } from './filter.js';
import { patchNote } from './actions.js';
import { createCategoryDialog, renameCategory, editCategoryColor, deleteCategory, reorderCategories } from './categories.js';

const NAV = [
  { type: 'all', icon: 'notes' },
  { type: 'pinned', icon: 'pin' },
  { type: 'favorites', icon: 'star' },
  { type: 'reminders', icon: 'bell' },
  { type: 'archive', icon: 'archive' },
  { type: 'trash', icon: 'trash' },
];

const NOTE_MIME = 'application/x-glassnote-note';
const CAT_MIME = 'application/x-glassnote-category';

export function createSidebar({ onNavigate, onNewNote, onOpenSettings }) {
  const el = h('aside', { class: 'sidebar', 'aria-label': 'Gezinti' });
  let dragCatId = null;

  const isActive = (view) => state.page === 'notes' && state.view.type === view.type && (view.type !== 'category' || state.view.id === view.id);

  function navItem({ view, iconEl, label, count, key }) {
    return h('button', {
      class: `nav-item${isActive(view) ? ' active' : ''}`,
      'aria-current': isActive(view) ? 'page' : null,
      title: state.settings.sidebarCollapsed ? label : null,
      dataset: { key },
      onclick: () => onNavigate(view),
    }, iconEl, h('span', { class: 'label' }, label), count ? h('span', { class: 'count' }, String(count)) : null);
  }

  // Not kartını bir kategoriye bırakmak notu o kategoriye taşır.
  function acceptNoteDrop(target, categoryId) {
    target.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(NOTE_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('drop-target');
    });
    target.addEventListener('dragleave', () => target.classList.remove('drop-target'));
    target.addEventListener('drop', (e) => {
      const id = Number(e.dataTransfer.getData(NOTE_MIME));
      target.classList.remove('drop-target');
      if (id) {
        e.preventDefault();
        patchNote(id, { category_id: categoryId });
      }
    });
  }

  function categoryItem(cat, count) {
    const view = { type: 'category', id: cat.id };
    const btn = navItem({ view, key: `cat-${cat.id}`, iconEl: h('span', { class: 'dot', style: { '--c': cat.color } }), label: cat.name, count });
    acceptNoteDrop(btn, cat.id);
    const more = h('button', {
      class: 'icon-btn sm more', 'aria-label': `${cat.name} seçenekleri`, title: 'Seçenekler',
      onclick: (e) => {
        e.stopPropagation();
        openMenu(more, [
          { label: 'Yeniden adlandır', icon: 'edit', onSelect: () => renameCategory(cat) },
          { label: 'Rengi değiştir', icon: 'drop', onSelect: () => editCategoryColor(cat, btn) },
          'sep',
          { label: 'Kategoriyi sil', icon: 'trash', danger: true, onSelect: () => deleteCategory(cat) },
        ], { align: 'end' });
      },
    }, icon('more', 'sm'));
    const li = h('li', { class: 'cat-item', draggable: 'true', dataset: { id: String(cat.id) } }, btn, more);

    li.addEventListener('dragstart', (e) => {
      dragCatId = cat.id;
      e.dataTransfer.setData(CAT_MIME, String(cat.id));
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      dragCatId = null;
      li.classList.remove('dragging');
      el.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    });
    li.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(CAT_MIME) || dragCatId === cat.id) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      li.classList.toggle('drop-after', after);
      li.classList.toggle('drop-before', !after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
      if (!e.dataTransfer.types.includes(CAT_MIME)) return;
      e.preventDefault();
      const after = li.classList.contains('drop-after');
      li.classList.remove('drop-before', 'drop-after');
      const moving = Number(e.dataTransfer.getData(CAT_MIME));
      if (!moving || moving === cat.id) return;
      const ids = state.categories.map((c) => c.id).filter((id) => id !== moving);
      ids.splice(ids.indexOf(cat.id) + (after ? 1 : 0), 0, moving);
      reorderCategories(ids);
    });
    return li;
  }

  function renderSidebar() {
    const focusedKey = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const notes = [...state.notes.values()];
    const count = (view) => notes.filter((n) => matchesView(n, view)).length;
    const collapsed = state.settings.sidebarCollapsed;

    clear(el, 
      h('div', { class: 'brand drag' },
        h('div', { class: 'brand-logo', 'aria-hidden': 'true' }, icon('notes', 'sm')),
        h('span', { class: 'brand-name' }, state.info.name),
        h('button', {
          class: 'icon-btn sm', dataset: { key: 'collapse' },
          title: collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt',
          'aria-label': collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt',
          onclick: () => {
            state.settings.sidebarCollapsed = !collapsed;
            api.settings.set('sidebarCollapsed', !collapsed);
            render();
          },
        }, icon('sidebar', 'sm'))),
      h('div', { class: 'sidebar-new' },
        h('button', { class: 'btn primary', dataset: { key: 'new' }, title: 'Yeni not (Ctrl+N)', onclick: onNewNote },
          icon('plus', 'sm'), h('span', { class: 'label' }, 'Yeni not'), h('kbd', null, 'Ctrl N'))),
      h('div', { class: 'sidebar-scroll' },
        h('nav', { class: 'nav', 'aria-label': 'Görünümler' },
          NAV.map(({ type, icon: ic }) => {
            const btn = navItem({ view: { type }, key: type, iconEl: icon(ic, 'sm'), label: VIEW_LABELS[type], count: count({ type }) });
            if (type === 'all') acceptNoteDrop(btn, null);
            return btn;
          })),
        h('div', { class: 'section-head' },
          h('span', null, 'Kategoriler'),
          h('button', { class: 'icon-btn sm', title: 'Yeni kategori', 'aria-label': 'Yeni kategori', dataset: { key: 'new-cat' }, onclick: () => createCategoryDialog() }, icon('plus', 'sm'))),
        state.categories.length
          ? h('ul', { class: 'cat-list', 'aria-label': 'Kategoriler (sıralamak için sürükleyin)' },
            state.categories.map((c) => categoryItem(c, count({ type: 'category', id: c.id }))))
          : h('p', { class: 'cat-empty' }, 'Notlarınızı düzenlemek için kendi kategorilerinizi oluşturun.')),
      h('div', { class: 'sidebar-foot' },
        h('button', {
          class: `nav-item${state.page === 'settings' ? ' active' : ''}`, dataset: { key: 'settings' }, title: collapsed ? 'Ayarlar' : null, onclick: onOpenSettings,
        }, icon('sliders', 'sm'), h('span', { class: 'label' }, 'Ayarlar'))),
    );

    if (focusedKey) el.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus({ preventScroll: true });
  }

  return { el, render: renderSidebar, NOTE_MIME };
}
