// Saf filtreleme ve sıralama fonksiyonları (DOM'a bağımlı değil; birim testli).

// Türkçe duyarlı katlama: büyük/küçük harf ve aksan farkı gözetmez,
// böylece "sirket" araması "Şirket"i, "ISTANBUL" araması "İstanbul"u bulur.
export function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

export const VIEWS = {
  all: (n) => !n.deleted_at && !n.is_archived,
  pinned: (n) => !n.deleted_at && !n.is_archived && n.is_pinned,
  favorites: (n) => !n.deleted_at && n.is_favorite,
  reminders: (n) => !n.deleted_at && !!n.reminder_at,
  archive: (n) => !n.deleted_at && n.is_archived,
  trash: (n) => !!n.deleted_at,
};

export function matchesView(note, view) {
  if (view.type === 'category') return !note.deleted_at && !note.is_archived && note.category_id === view.id;
  return (VIEWS[view.type] ?? VIEWS.all)(note);
}

export function effectiveColor(note, categoriesById) {
  return note.color ?? categoriesById.get(note.category_id)?.color ?? null;
}

export function matchesSearch(note, query, categoriesById) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const tags = note.tags.map(fold);
  const hay = [note.title, note.content_text, categoriesById.get(note.category_id)?.name ?? '', ...note.tags].map(fold).join('\n');
  return tokens.every((t) => (t.startsWith('#') && t.length > 1 ? tags.some((tag) => tag.startsWith(t.slice(1))) : hay.includes(t)));
}

export function filterNotes(notes, { view, search = '', color = null, categoriesById }) {
  return notes.filter((n) => matchesView(n, view)
    && (!color || effectiveColor(n, categoriesById) === color)
    && matchesSearch(n, search, categoriesById));
}

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

export function sortNotes(notes, { sortBy = 'updated', pinnedFirst = true, categoriesById, view }) {
  const byCat = (n) => {
    const c = categoriesById.get(n.category_id);
    return c ? c.sort_order : Number.MAX_SAFE_INTEGER;
  };
  const cmp = {
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    created: (a, b) => b.created_at.localeCompare(a.created_at),
    title: (a, b) => collator.compare(a.title || '￿', b.title || '￿'),
    category: (a, b) => byCat(a) - byCat(b) || b.updated_at.localeCompare(a.updated_at),
  }[sortBy] ?? ((a, b) => b.updated_at.localeCompare(a.updated_at));
  const list = [...notes];
  if (view?.type === 'reminders') {
    // Bekleyen hatırlatmalar en yakından uzağa, tamamlananlar sonda.
    return list.sort((a, b) => Number(a.reminder_done) - Number(b.reminder_done) || a.reminder_at.localeCompare(b.reminder_at));
  }
  if (view?.type === 'trash') return list.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  return list.sort((a, b) => (pinnedFirst ? Number(b.is_pinned) - Number(a.is_pinned) : 0) || cmp(a, b) || b.id - a.id);
}
