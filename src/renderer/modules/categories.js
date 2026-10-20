import { api, state, render, setCategories } from './state.js';
import { h, debounce } from '../components/dom.js';
import { openDialog, promptDialog } from '../components/dialog.js';
import { openPopover } from '../components/popover.js';
import { colorPicker } from '../components/color-picker.js';
import { reportError } from './actions.js';
import { toast } from '../components/toast.js';

const nameError = (v) => {
  const n = v.replace(/\s+/g, ' ').trim();
  if (!n) return 'Kategori adı boş olamaz.';
  if (n.length > 60) return 'Kategori adı en fazla 60 karakter olabilir.';
  return null;
};

export function createCategoryDialog() {
  const palette = state.info.palette;
  let color = palette[state.categories.length % palette.length].hex;
  return openDialog((close) => {
    const input = h('input', { class: 'input', placeholder: 'Örn. İş, Fikirler, Yapılacaklar', autofocus: true, maxlength: '60' });
    const err = h('div', { class: 'error-text', role: 'alert' });
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const msg = nameError(input.value);
        if (msg) { err.textContent = msg; input.classList.add('invalid'); return; }
        try {
          const cat = await api.categories.create({ name: input.value, color });
          setCategories(await api.categories.list());
          render();
          close(cat);
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('div', { class: 'modal-body' },
      h('h2', null, 'Yeni kategori'),
      h('div', { class: 'field' }, h('label', null, 'Ad'), input, err),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Renk'),
        h('p', { class: 'hint' }, 'Bu kategorideki notlar, kendi renkleri seçilmediği sürece bu rengi kullanır.'),
        colorPicker({ value: color, palette, onChange: (c) => { color = c; } }))),
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Oluştur')));
  });
}

export async function renameCategory(cat) {
  const name = await promptDialog({ title: 'Kategoriyi yeniden adlandır', label: 'Ad', value: cat.name, validate: nameError });
  if (name === null || name.trim() === cat.name) return;
  try {
    await api.categories.update(cat.id, { name });
    setCategories(await api.categories.list());
    render();
  } catch (e) {
    reportError(e);
  }
}

export function editCategoryColor(cat, anchor) {
  const save = debounce(async (color) => {
    try {
      await api.categories.update(cat.id, { color });
    } catch (e) {
      reportError(e);
    }
  }, 250);
  openPopover(anchor, colorPicker({
    value: cat.color,
    palette: state.info.palette,
    onChange: (color) => {
      // Anında önizleme; kalıcı kayıt kısa bir gecikmeyle.
      setCategories(state.categories.map((c) => (c.id === cat.id ? { ...c, color } : c)));
      render();
      save(color);
    },
  }));
}

// Silmeden önce bağlı notların ne olacağı her zaman sorulur.
export async function deleteCategory(cat) {
  const count = [...state.notes.values()].filter((n) => n.category_id === cat.id).length;
  const others = state.categories.filter((c) => c.id !== cat.id);
  const result = await openDialog((close) => {
    let mode = 'uncategorize';
    const target = h('select', { class: 'input', disabled: true, 'aria-label': 'Hedef kategori' },
      others.map((c) => h('option', { value: String(c.id) }, c.name)));
    const opt = (value, title, hint, extra) => h('label', { class: 'option' },
      h('input', {
        type: 'radio', name: 'mode', value, checked: value === mode,
        onchange: () => { mode = value; target.disabled = value !== 'move'; },
      }),
      h('strong', null, title), h('span', { class: 'hint' }, hint), extra ?? null);
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        close({ mode, targetId: mode === 'move' ? Number(target.value) : null });
      },
    },
    h('div', { class: 'modal-body' },
      h('h2', null, `“${cat.name}” kategorisi silinsin mi?`),
      h('p', null, count
        ? `Bu kategoride ${count} not var. Notlara ne olacağını seçin:`
        : 'Bu kategoride not yok. Kategori kaldırılacak.'),
      count ? h('div', { class: 'option-list' },
        opt('uncategorize', 'Notları kategorisiz bırak', 'Notlar korunur, yalnızca kategori bağlantısı kaldırılır.'),
        others.length ? opt('move', 'Notları başka kategoriye taşı', 'Notlar seçtiğiniz kategoriye aktarılır.', h('div', { style: { 'grid-column': '2' } }, target)) : null,
        opt('trash', 'Notları çöp kutusuna taşı', 'Notlar çöp kutusundan geri yüklenebilir.')) : null),
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close(null) }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn danger' }, 'Kategoriyi sil')));
  });
  if (!result) return;
  try {
    await api.categories.remove(cat.id, result.mode, result.targetId);
    setCategories(await api.categories.list());
    if (state.view.type === 'category' && state.view.id === cat.id) state.view = { type: 'all' };
    render();
    toast(`“${cat.name}” silindi`);
  } catch (e) {
    reportError(e);
  }
}

export async function reorderCategories(ids) {
  // İyimser güncelleme, hata olursa sunucudaki sıraya dön.
  const byId = state.categoriesById;
  setCategories(ids.map((id, i) => ({ ...byId.get(id), sort_order: i })));
  render();
  try {
    setCategories(await api.categories.reorder(ids));
  } catch (e) {
    reportError(e);
    setCategories(await api.categories.list());
  }
  render();
}
