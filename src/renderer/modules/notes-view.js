import { api, state, render, viewLabel } from './state.js';
import { h, clear } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { openMenu } from '../components/popover.js';
import { confirmDialog } from '../components/dialog.js';
import { relativeTime, shortDateTime, fullDateTime } from '../components/format.js';
import { filterNotes, sortNotes, effectiveColor } from './filter.js';
import { patchNote, toggleWidget, noteMenuItems, reportError } from './actions.js';
import { toast } from '../components/toast.js';

const CHUNK = 120;
const NOTE_MIME = 'application/x-glassnote-note';

export function visibleNotes() {
  const { view, search, color, categoriesById, settings } = state;
  const list = filterNotes([...state.notes.values()], { view, search, color, categoriesById });
  return sortNotes(list, { sortBy: settings.sortBy, pinnedFirst: settings.pinnedFirst, categoriesById, view });
}

export function createNotesView({ onOpen, onNewNote }) {
  const head = h('div', { class: 'content-head' });
  const scroll = h('div', { class: 'notes-scroll', tabindex: '-1' });
  let observer = null;
  const seen = new Set(); // giriş animasyonu yalnızca ilk kez görünen kartlarda oynar

  function card(n) {
    const color = effectiveColor(n, state.categoriesById);
    const cat = state.categoriesById.get(n.category_id);
    const trashed = !!n.deleted_at;
    const actionBtn = (ic, label, on, onClick, cls = '') => h('button', {
      class: `icon-btn sm${on ? ' on' : ''} ${cls}`, title: label, 'aria-label': label, 'aria-pressed': on == null ? null : String(on),
      onclick: (e) => { e.stopPropagation(); onClick(e); },
    }, icon(ic, `sm${on && ic === 'star' ? ' filled' : ''}`));

    const more = actionBtn('more', 'Diğer işlemler', null, (e) => openMenu(e.currentTarget, noteMenuItems(n, { onOpen: () => onOpen(n.id) }), { align: 'end' }));

    const el = h('article', {
      class: `card${color ? ' has-color' : ''}${state.selectedId === n.id ? ' selected' : ''}${seen.has(n.id) ? '' : ' enter'}`,
      style: color ? { '--nc': color } : null,
      tabindex: '0',
      role: 'button',
      'aria-label': `${n.title || 'Başlıksız not'}${n.is_pinned ? ', sabitlenmiş' : ''}`,
      draggable: trashed ? null : 'true',
      dataset: { id: String(n.id) },
      onclick: () => onOpen(n.id),
      onkeydown: (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(n.id); }
        if (e.key === 'Delete' && !trashed) { e.preventDefault(); noteMenuItems(n).at(-1).onSelect(); }
      },
      oncontextmenu: (e) => {
        e.preventDefault();
        openMenu({ x: e.clientX, y: e.clientY }, noteMenuItems(n, { onOpen: () => onOpen(n.id) }));
      },
      ondragstart: (e) => {
        e.dataTransfer.setData(NOTE_MIME, String(n.id));
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      },
      ondragend: () => el.classList.remove('dragging'),
    },
    h('div', { class: 'card-top' },
      h('h3', { class: `card-title${n.title ? '' : ' untitled'}` }, n.title || 'Başlıksız not'),
      h('div', { class: 'card-flags', 'aria-hidden': 'true' },
        state.widgetIds.has(n.id) ? icon('widget', 'xs') : null,
        n.is_favorite ? icon('star', 'xs filled fav') : null,
        n.is_pinned ? icon('pin', 'xs pin') : null)),
    h('p', { class: 'card-preview' }, n.content_text.slice(0, 600)),
    n.tags.length ? h('div', { class: 'card-tags' }, n.tags.slice(0, 4).map((t) => h('span', null, `#${t}`))) : null,
    h('div', { class: 'card-foot' },
      cat ? h('span', { class: 'chip' }, h('span', { class: 'dot', style: { '--c': cat.color } }), cat.name) : null,
      n.reminder_at ? h('span', { class: `reminder${n.reminder_done ? ' done' : ''}`, title: `Hatırlatma: ${fullDateTime(n.reminder_at)}` }, icon('bell', 'xs'), shortDateTime(n.reminder_at)) : null,
      h('span', { class: 'time', title: `Son düzenleme: ${fullDateTime(n.updated_at)}` }, trashed ? `Silindi ${relativeTime(n.deleted_at)}` : relativeTime(n.updated_at))),
    trashed
      ? h('div', { class: 'card-actions' }, more)
      : h('div', { class: 'card-actions' },
        actionBtn('pin', n.is_pinned ? 'Sabitlemeyi kaldır' : 'Uygulamada sabitle', n.is_pinned, () => patchNote(n.id, { is_pinned: !n.is_pinned })),
        actionBtn('star', n.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', n.is_favorite, () => patchNote(n.id, { is_favorite: !n.is_favorite })),
        actionBtn('widget', state.widgetIds.has(n.id) ? "Masaüstü widget'ını kapat" : 'Masaüstünde widget olarak aç', state.widgetIds.has(n.id), () => toggleWidget(n.id)),
        more));
    return el;
  }

  function emptyState() {
    const total = [...state.notes.values()].filter((n) => !n.deleted_at).length;
    if (state.search || state.color) {
      return h('div', { class: 'empty subtle' },
        h('div', { class: 'empty-icon' }, icon('search')),
        h('h2', null, 'Sonuç bulunamadı'),
        h('p', null, state.search ? `“${state.search}” ile eşleşen not yok. Başlık, içerik, kategori ve etiketlerde arandı.` : 'Seçili renkte not yok.'),
        h('button', { class: 'btn', onclick: () => { state.search = ''; state.color = null; render(); } }, 'Filtreleri temizle'));
    }
    if (!total && state.view.type === 'all') {
      return h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, icon('sparkles')),
        h('h2', null, `${state.info.name}'a hoş geldiniz`),
        h('p', null, 'Notlarınız yalnızca bu bilgisayarda saklanır ve otomatik olarak kaydedilir.'),
        h('ul', { class: 'tips' },
          h('li', null, icon('plus', 'sm'), h('span', null, 'Yeni not için ', h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'N'))),
          h('li', null, icon('widget', 'sm'), h('span', null, 'Bir notu masaüstüne bağımsız widget olarak sabitleyin')),
          h('li', null, icon('folder', 'sm'), h('span', null, 'Kategoriler ve renklerle kendi düzeninizi kurun'))),
        h('button', { class: 'btn primary', onclick: onNewNote }, icon('plus', 'sm'), 'İlk notunu oluştur'));
    }
    const msgs = {
      pinned: ['pin', 'Sabitlenmiş not yok', 'Önemli notları listenin en üstünde tutmak için sabitleyin.'],
      favorites: ['star', 'Favori not yok', 'Sık kullandığınız notları yıldızlayarak burada toplayın.'],
      reminders: ['bell', 'Hatırlatma yok', 'Bir notun düzenleyicisinden tarih ve saat ekleyebilirsiniz.'],
      archive: ['archive', 'Arşiv boş', 'Arşivlenen notlar ana listeden kalkar ama silinmez.'],
      trash: ['trash', 'Çöp kutusu boş', 'Silinen notlar kalıcı olarak silinene kadar burada bekler.'],
      category: ['folder', 'Bu kategoride not yok', 'Yeni bir not oluşturun veya bir not kartını kenar çubuğundaki kategoriye sürükleyin.'],
      all: ['inbox', 'Görünür not yok', 'Tüm notlarınız arşivde veya çöp kutusunda.'],
    };
    const [ic, title, text] = msgs[state.view.type] ?? msgs.all;
    return h('div', { class: 'empty subtle' },
      h('div', { class: 'empty-icon' }, icon(ic)),
      h('h2', null, title),
      h('p', null, text),
      ['all', 'pinned', 'favorites', 'category'].includes(state.view.type) ? h('button', { class: 'btn', onclick: onNewNote }, icon('plus', 'sm'), 'Yeni not') : null);
  }

  function renderHead(count) {
    const cat = state.view.type === 'category' ? state.categoriesById.get(state.view.id) : null;
    clear(head, 
      h('h1', null, cat ? h('span', { class: 'dot', style: { '--c': cat.color } }) : null, viewLabel(state.view)),
      h('span', { class: 'sub' }, `${count} not`),
      state.color ? h('span', { class: 'filter-pill' }, h('span', { class: 'dot', style: { '--c': state.color } }), 'Renk filtresi',
        h('button', { class: 'icon-btn sm', 'aria-label': 'Renk filtresini kaldır', onclick: () => { state.color = null; render(); } }, icon('close', 'xs'))) : null,
      h('span', { class: 'spacer' }),
      state.view.type === 'trash' && count ? h('button', {
        class: 'btn sm',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Çöp kutusu boşaltılsın mı?', message: `${count} not kalıcı olarak silinecek. Bu işlem geri alınamaz.`, confirmText: 'Boşalt', danger: true });
          if (!ok) return;
          try {
            const n = await api.notes.emptyTrash();
            toast(`${n} not kalıcı olarak silindi`);
          } catch (e) { reportError(e); }
        },
      }, icon('trash', 'sm'), 'Çöp kutusunu boşalt') : null,
    );
  }

  function renderNotes() {
    observer?.disconnect();
    const list = visibleNotes();
    renderHead(list.length);
    const keepScroll = scroll.scrollTop;
    const focusedId = scroll.contains(document.activeElement) ? document.activeElement.closest('.card')?.dataset.id : null;
    clear(scroll);
    if (!list.length) {
      scroll.append(emptyState());
      return;
    }
    const container = h('div', { class: `notes ${state.settings.viewMode}`, role: 'list', 'aria-label': 'Notlar' });
    scroll.append(container);

    const grouped = state.settings.pinnedFirst && !['trash', 'reminders', 'pinned'].includes(state.view.type)
      && list.some((n) => n.is_pinned) && list.some((n) => !n.is_pinned);
    let i = 0;
    let lastPinned = null;
    const appendChunk = () => {
      const end = Math.min(i + CHUNK, list.length);
      for (; i < end; i++) {
        const n = list[i];
        if (grouped && n.is_pinned !== lastPinned) {
          container.append(h('div', { class: 'notes-group-label' }, n.is_pinned ? [icon('pin', 'xs'), 'Sabitlenenler'] : 'Diğer notlar'));
          lastPinned = n.is_pinned;
        }
        container.append(card(n));
        seen.add(n.id);
      }
      if (i < list.length) {
        const sentinel = h('div', { class: 'load-more' });
        container.append(sentinel);
        observer = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            sentinel.remove();
            appendChunk();
          }
        }, { root: scroll, rootMargin: '600px' });
        observer.observe(sentinel);
      }
    };
    appendChunk();
    scroll.scrollTop = keepScroll;
    if (focusedId) scroll.querySelector(`.card[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
  }

  return { head, scroll, render: renderNotes };
}
