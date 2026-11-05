import { api, state, render, upsertNotes } from './state.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/dialog.js';

export function reportError(err, prefix = '') {
  toast(`${prefix}${err?.message ?? err}`, { type: 'error' });
}

export async function patchNote(id, patch) {
  try {
    const n = await api.notes.update(id, patch);
    upsertNotes([n]);
    render();
    return n;
  } catch (e) {
    reportError(e, 'Değişiklik kaydedilemedi: ');
    return null;
  }
}

export async function trashNote(id) {
  try {
    const n = await api.notes.trash(id);
    upsertNotes([n]);
    render();
    toast('Not çöp kutusuna taşındı', {
      action: { label: 'Geri al', onClick: () => restoreNote(id, { silent: true }) },
    });
  } catch (e) {
    reportError(e, 'Not silinemedi: ');
  }
}

export async function restoreNote(id, { silent = false } = {}) {
  try {
    const n = await api.notes.restore(id);
    upsertNotes([n]);
    render();
    if (!silent) toast('Not geri yüklendi');
  } catch (e) {
    reportError(e);
  }
}

export async function destroyNote(id) {
  const n = state.notes.get(id);
  const ok = await confirmDialog({
    title: 'Not kalıcı olarak silinsin mi?',
    message: `“${n?.title || 'Başlıksız not'}” kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    confirmText: 'Kalıcı olarak sil',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.notes.destroy(id);
    upsertNotes([], [id]);
    render();
    return true;
  } catch (e) {
    reportError(e);
    return false;
  }
}

export async function toggleWidget(id) {
  try {
    if (state.widgetIds.has(id)) await api.widgets.close(id);
    else await api.widgets.open(id);
  } catch (e) {
    reportError(e, 'Widget açılamadı: ');
  }
}

export async function toggleArchive(n) {
  const updated = await patchNote(n.id, { is_archived: !n.is_archived });
  if (updated) toast(updated.is_archived ? 'Not arşivlendi' : 'Not arşivden çıkarıldı');
}

// Kart ve editör "daha fazla" menüleri için ortak öğeler.
export function noteMenuItems(n, { onOpen } = {}) {
  if (n.deleted_at) {
    return [
      { label: 'Geri yükle', icon: 'restore', onSelect: () => restoreNote(n.id) },
      { label: 'Kalıcı olarak sil', icon: 'trash', danger: true, onSelect: () => destroyNote(n.id) },
    ];
  }
  return [
    onOpen ? { label: 'Aç', icon: 'edit', onSelect: onOpen } : null,
    { label: state.widgetIds.has(n.id) ? "Masaüstü widget'ını kapat" : 'Masaüstünde widget olarak aç', icon: 'widget', onSelect: () => toggleWidget(n.id) },
    'sep',
    { label: n.is_pinned ? 'Sabitlemeyi kaldır' : 'Uygulamada sabitle', icon: 'pin', onSelect: () => patchNote(n.id, { is_pinned: !n.is_pinned }) },
    { label: n.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', icon: 'star', onSelect: () => patchNote(n.id, { is_favorite: !n.is_favorite }) },
    { label: n.is_archived ? 'Arşivden çıkar' : 'Arşivle', icon: 'archive', onSelect: () => toggleArchive(n) },
    'sep',
    { label: 'Çöp kutusuna taşı', icon: 'trash', danger: true, onSelect: () => trashNote(n.id) },
  ];
}
