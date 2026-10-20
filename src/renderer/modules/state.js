// Ana pencerenin tek durum kaynağı. Değişiklikler render() ile bir sonraki
// karede toplu olarak çizilir.
export const api = window.glassnote;

export const state = {
  info: null,
  settings: null,
  notes: new Map(),
  categories: [],
  categoriesById: new Map(),
  widgetIds: new Set(),
  view: { type: 'all' },
  search: '',
  color: null,
  selectedId: null,
  page: 'notes', // notes | settings
};

const subscribers = new Set();
let scheduled = false;

export function subscribe(fn) {
  subscribers.add(fn);
}

export function render() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const fn of subscribers) fn();
  });
}

export function setCategories(list) {
  state.categories = list;
  state.categoriesById = new Map(list.map((c) => [c.id, c]));
}

export function upsertNotes(notes = [], removed = []) {
  for (const n of notes) state.notes.set(n.id, n);
  for (const id of removed) state.notes.delete(id);
}

export const VIEW_LABELS = {
  all: 'Tüm notlar',
  pinned: 'Sabitlenenler',
  favorites: 'Favoriler',
  reminders: 'Hatırlatmalar',
  archive: 'Arşiv',
  trash: 'Çöp kutusu',
};

export function viewLabel(view) {
  if (view.type === 'category') return state.categoriesById.get(view.id)?.name ?? 'Kategori';
  return VIEW_LABELS[view.type] ?? VIEW_LABELS.all;
}
