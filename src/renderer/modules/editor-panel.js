import { api, state, render, upsertNotes } from './state.js';
import { h, clear, append, debounce } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { createRichEditor } from '../components/rich-editor.js';
import { openMenu, openPopover, closePopover } from '../components/popover.js';
import { promptDialog } from '../components/dialog.js';
import { colorPicker } from '../components/color-picker.js';
import { fullDateTime, shortDateTime, toLocalInput, fromLocalInput } from '../components/format.js';
import { toast } from '../components/toast.js';
import { effectiveColor } from './filter.js';
import { patchNote, trashNote, restoreNote, destroyNote, toggleWidget, toggleArchive, reportError } from './actions.js';
import { createCategoryDialog } from './categories.js';
import { safeHref } from '../components/sanitize.js';

const AUTOSAVE_DELAY = 600;

export function createEditorPanel({ onClosed }) {
  let note = null;
  let createdHere = false;
  let pending = {};
  let inflight = null;
  let lastError = null;

  const status = h('span', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const actions = h('div', { style: { display: 'flex', gap: '2px' } });
  const titleInput = h('textarea', { class: 'editor-title', rows: '1', placeholder: 'Başlık', maxlength: '500', 'aria-label': 'Not başlığı', spellcheck: 'true' });
  const meta = h('div', { class: 'editor-meta' });
  const tagsField = h('div', { class: 'tags-field' });
  const banner = h('div');
  const foot = h('div', { class: 'editor-foot' });

  const editor = createRichEditor({
    onChange: () => queue({ content: editor.getHTML() }),
    askLink: (current) => promptDialog({
      title: current ? 'Bağlantıyı düzenle' : 'Bağlantı ekle',
      label: 'Adres (boş bırakırsanız bağlantı kaldırılır)',
      value: current,
      placeholder: 'https://ornek.com',
      validate: (v) => (v.trim() && !safeHref(v) ? 'Yalnızca http, https ve e-posta bağlantıları desteklenir.' : null),
    }),
    openLink: (href) => api.app.openExternal(href).catch(reportError),
    dictation: state.info.speechAvailable ? {
      transcribe: (wav) => api.speech.transcribe(wav),
      onError: (msg) => toast(msg, { type: 'error' }),
    } : null,
  });

  const el = h('aside', { class: 'editor-panel', 'aria-label': 'Not düzenleyici', 'aria-hidden': 'true' },
    h('div', { class: 'editor-inner' },
      h('div', { class: 'editor-head drag' },
        h('button', { class: 'icon-btn', title: 'Kapat (Esc)', 'aria-label': 'Düzenleyiciyi kapat', onclick: () => close() }, icon('close')),
        status,
        h('span', { class: 'spacer' }),
        actions),
      banner,
      h('div', { class: 'editor-body' },
        titleInput,
        meta,
        tagsField,
        h('div', { class: 'editor-toolbar' }, editor.toolbar()),
        h('div', { class: 'editor-content' }, editor.el)),
      foot));

  // ------------------------------------------------------------- saving
  function setStatus(kind, text) {
    status.className = `status ${kind}`;
    status.textContent = text;
  }

  const saveSoon = debounce(() => flush(), AUTOSAVE_DELAY);

  function queue(patch) {
    if (!note || note.deleted_at) return;
    Object.assign(pending, patch);
    if (state.settings.autosave) {
      setStatus('dirty', 'Kaydediliyor…');
      saveSoon();
    } else {
      setStatus('dirty', 'Kaydedilmedi · Ctrl+S');
    }
  }

  async function flush() {
    saveSoon.cancel();
    if (inflight) await inflight;
    if (!note || !Object.keys(pending).length) return true;
    const id = note.id;
    const patch = pending;
    pending = {};
    inflight = (async () => {
      try {
        const saved = await api.notes.update(id, patch);
        upsertNotes([saved]);
        if (note?.id === id) {
          note = saved;
          lastError = null;
          if (!Object.keys(pending).length) setStatus('saved', 'Kaydedildi');
          renderFoot();
        }
        render();
        return true;
      } catch (e) {
        // Değişiklikler kaybolmasın: bekleyen yamaya geri eklenir.
        pending = { ...patch, ...pending };
        lastError = e.message;
        setStatus('error', 'Kaydedilemedi');
        toast(`Not kaydedilemedi: ${e.message}`, { type: 'error', action: { label: 'Tekrar dene', onClick: () => flush() } });
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  // Pencere kapanırken: eşzamanlı yazma, böylece veri kaybolmaz.
  function flushSync() {
    saveSoon.cancel();
    if (!note || !Object.keys(pending).length) return;
    const r = api.notes.updateSync(note.id, pending);
    if (r?.ok) pending = {};
  }

  // ------------------------------------------------------------ rendering
  function metaButton(ic, label, cls, onClick, extra) {
    return h('button', { class: `meta-btn ${cls}`, type: 'button', onclick: onClick }, extra ?? icon(ic, 'xs'), h('span', null, label));
  }

  function renderActions() {
    clear(actions);
    if (!note) return;
    if (note.deleted_at) return;
    const btn = (ic, label, on, onClick) => h('button', {
      class: `icon-btn${on ? ' on' : ''}`, title: label, 'aria-label': label, 'aria-pressed': String(!!on), onclick: onClick,
    }, icon(ic, on && ic === 'star' ? 'filled' : ''));
    append(actions, 
      btn('pin', note.is_pinned ? 'Sabitlemeyi kaldır' : 'Uygulamada sabitle', note.is_pinned, () => patchNote(note.id, { is_pinned: !note.is_pinned })),
      btn('star', note.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', note.is_favorite, () => patchNote(note.id, { is_favorite: !note.is_favorite })),
      btn('widget', state.widgetIds.has(note.id) ? "Masaüstü widget'ını kapat" : 'Masaüstünde widget olarak aç', state.widgetIds.has(note.id), async () => { await flush(); toggleWidget(note.id); }),
      btn('archive', note.is_archived ? 'Arşivden çıkar' : 'Arşivle', note.is_archived, () => toggleArchive(note)),
      btn('trash', 'Çöp kutusuna taşı', false, async () => {
        const id = note.id;
        await flush();
        createdHere = false;
        close({ skipDiscard: true });
        trashNote(id);
      }),
    );
  }

  function renderMeta() {
    clear(meta);
    if (!note) return;
    const cat = state.categoriesById.get(note.category_id);
    const color = effectiveColor(note, state.categoriesById);
    const ro = !!note.deleted_at;

    const catBtn = metaButton('folder', cat ? cat.name : 'Kategori yok', cat ? 'set' : '', () => {
      if (ro) return;
      openMenu(catBtn, [
        { title: 'Kategori' },
        { label: 'Kategorisiz', checked: note.category_id === null, onSelect: () => patchNote(note.id, { category_id: null }) },
        ...state.categories.map((c) => ({ label: c.name, checked: note.category_id === c.id, onSelect: () => patchNote(note.id, { category_id: c.id }) })),
        'sep',
        { label: 'Yeni kategori…', icon: 'plus', onSelect: async () => {
          const c = await createCategoryDialog();
          if (c && note) patchNote(note.id, { category_id: c.id });
        } },
      ]);
    }, cat ? h('span', { class: 'dot', style: { '--c': cat.color } }) : null);

    const colorLabel = note.color ? note.color : (cat ? 'Kategori rengi' : 'Renk');
    const colorBtn = metaButton('drop', colorLabel, note.color ? 'set' : '', () => {
      if (ro) return;
      const save = debounce((c) => patchNote(note.id, { color: c }), 200);
      openPopover(colorBtn, colorPicker({
        value: note.color,
        palette: state.info.palette,
        allowAuto: true,
        autoLabel: cat ? `Kategori rengi (${cat.name})` : 'Otomatik (renksiz)',
        onChange: (c) => save(c),
      }));
    }, color ? h('span', { class: 'dot', style: { '--c': color } }) : null);

    const pendingReminder = note.reminder_at && !note.reminder_done;
    const remBtn = metaButton('bell', note.reminder_at ? `${note.reminder_done ? 'Hatırlatıldı' : 'Hatırlatma'}: ${shortDateTime(note.reminder_at)}` : 'Hatırlatma ekle',
      pendingReminder ? 'warn' : '', () => { if (!ro) openReminder(remBtn); });

    append(meta, catBtn, colorBtn, remBtn);
  }

  function openReminder(anchor) {
    const input = h('input', { class: 'input', type: 'datetime-local', value: note.reminder_at ? toLocalInput(note.reminder_at) : '' });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const preset = (label, fn) => h('button', { class: 'btn sm', type: 'button', onclick: () => { input.value = toLocalInput(fn().toISOString()); } }, label);
    const at = (days, hour, min = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, min, 0, 0); return d; };
    const save = async (iso) => {
      const n = await patchNote(note.id, { reminder_at: iso });
      if (n) { closePopover(); toast(iso ? `Hatırlatma ayarlandı: ${fullDateTime(iso)}` : 'Hatırlatma kaldırıldı'); }
    };
    openPopover(anchor, h('div', { class: 'reminder-pop' },
      h('div', { class: 'field-label' }, 'Hatırlatma zamanı'),
      input,
      h('div', { class: 'quick' },
        preset('1 saat sonra', () => new Date(Date.now() + 3600_000)),
        preset('Bu akşam 20:00', () => at(0, 20)),
        preset('Yarın 09:00', () => at(1, 9))),
      h('p', { class: 'hint' }, 'Bildirim, uygulama açıkken veya sistem tepsisinde çalışırken gösterilir.'),
      err,
      h('div', { style: { display: 'flex', gap: '8px', 'justify-content': 'flex-end' } },
        note.reminder_at ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => save(null) }, 'Kaldır') : null,
        h('button', {
          class: 'btn sm primary', type: 'button',
          onclick: () => {
            const iso = fromLocalInput(input.value);
            if (!iso) { err.textContent = 'Lütfen bir tarih ve saat seçin.'; return; }
            if (new Date(iso).getTime() < Date.now() - 30_000) { err.textContent = 'Geçmiş bir zaman seçilemez.'; return; }
            save(iso);
          },
        }, 'Kaydet'))));
  }

  function renderTags() {
    clear(tagsField);
    if (!note) return;
    const ro = !!note.deleted_at;
    const tags = note.tags;
    const setTags = (next) => patchNote(note.id, { tags: next });
    const input = h('input', { placeholder: tags.length ? 'Etiket ekle…' : 'Etiket ekle (Enter ile)…', 'aria-label': 'Etiket ekle', maxlength: '40', disabled: ro });
    const add = () => {
      const v = input.value.replace(/^#+/, '').replace(/,/g, ' ').trim();
      if (!v) return;
      if (tags.some((t) => t.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) { input.value = ''; return; }
      setTags([...tags, v]).then(() => tagsField.querySelector('input')?.focus());
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      if (e.key === 'Backspace' && !input.value && tags.length) setTags(tags.slice(0, -1)).then(() => tagsField.querySelector('input')?.focus());
    });
    input.addEventListener('blur', add);
    append(tagsField, 
      icon('hash', 'xs'),
      tags.map((t) => h('span', { class: 'tag-chip' }, t,
        ro ? null : h('button', { type: 'button', 'aria-label': `${t} etiketini kaldır`, onclick: () => setTags(tags.filter((x) => x !== t)) }, icon('close', 'xs')))),
      input);
  }

  function renderFoot() {
    clear(foot);
    if (!note) return;
    append(foot, h('span', null, `Oluşturuldu: ${fullDateTime(note.created_at)}`), h('span', null, `Düzenlendi: ${fullDateTime(note.updated_at)}`));
  }

  function renderBanner() {
    clear(banner);
    if (!note?.deleted_at) return;
    append(banner, h('div', { class: 'trash-banner' },
      icon('trash', 'sm'), h('span', null, 'Bu not çöp kutusunda.'),
      h('button', { class: 'btn sm', onclick: () => restoreNote(note.id) }, 'Geri yükle'),
      h('button', { class: 'btn sm danger', onclick: async () => { const id = note.id; if (await destroyNote(id)) close({ skipDiscard: true }); } }, 'Kalıcı olarak sil')));
  }

  function autoGrow() {
    titleInput.style.height = 'auto';
    titleInput.style.height = `${titleInput.scrollHeight}px`;
  }

  function fill() {
    titleInput.value = note.title;
    editor.setHTML(note.content);
    const ro = !!note.deleted_at;
    titleInput.readOnly = ro;
    editor.el.contentEditable = ro ? 'false' : 'true';
    requestAnimationFrame(autoGrow);
    renderAll();
    if (!lastError) setStatus('', '');
  }

  function renderAll() {
    renderActions();
    renderMeta();
    renderTags();
    renderFoot();
    renderBanner();
  }

  // --------------------------------------------------------------- events
  titleInput.addEventListener('input', () => {
    autoGrow();
    queue({ title: titleInput.value.replace(/\n/g, ' ') });
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor.focus(true);
    }
  });

  // ---------------------------------------------------------------- API
  async function open(id, { focus = null, created = false } = {}) {
    if (note && note.id !== id) await close({ keepPanel: true });
    const n = state.notes.get(id);
    if (!n) return;
    note = n;
    createdHere = created;
    pending = {};
    lastError = null;
    state.selectedId = id;
    fill();
    document.getElementById('app').classList.add('editor-open');
    el.setAttribute('aria-hidden', 'false');
    render();
    if (focus === 'title') titleInput.focus({ preventScroll: true });
    if (focus === 'content') editor.focus(true);
  }

  async function close({ keepPanel = false, skipDiscard = false } = {}) {
    if (!note) return;
    const id = note.id;
    const wasNew = createdHere;
    await flush();
    note = null;
    createdHere = false;
    state.selectedId = null;
    if (!keepPanel) {
      document.getElementById('app').classList.remove('editor-open');
      el.setAttribute('aria-hidden', 'true');
      onClosed?.(id);
    }
    // Hiç yazılmadan bırakılan yeni not iz bırakmaz.
    if (wasNew && !skipDiscard) {
      try {
        if (await api.notes.discardIfEmpty(id)) upsertNotes([], [id]);
      } catch { /* yoksay */ }
    }
    render();
  }

  // Başka bir pencereden (widget) veya ana süreçten gelen güncelleme.
  function external(n) {
    if (!note || n.id !== note.id) return;
    const editing = el.contains(document.activeElement);
    const contentChanged = n.content !== note.content || n.title !== note.title;
    note = { ...n };
    if (contentChanged && !editing && !Object.keys(pending).length) fill();
    else renderAll();
  }

  function removed(id) {
    if (note?.id === id) {
      pending = {};
      note = null;
      createdHere = false;
      document.getElementById('app').classList.remove('editor-open');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  return {
    el,
    open,
    close,
    flush,
    flushSync,
    external,
    removed,
    refresh: () => note && renderAll(),
    currentId: () => note?.id ?? null,
    isOpen: () => !!note,
  };
}
