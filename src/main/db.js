'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_SETTINGS, BACKUP_FORMAT, BACKUP_VERSION, LIMITS, APP_NAME } = require('../shared/constants');
const v = require('../shared/validate');
const { htmlToText } = require('../shared/text');

// Sıralı migration listesi. Yayınlanmış bir migration asla değiştirilmez;
// şema değişiklikleri yeni bir eleman olarak eklenir (PRAGMA user_version).
const MIGRATIONS = [
  `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    color TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reminder_at TEXT,
    reminder_done INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_notes_reminder ON notes(reminder_at) WHERE reminder_at IS NOT NULL AND reminder_done = 0;
  CREATE INDEX idx_notes_category ON notes(category_id);
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE widget_states (
    note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    x INTEGER,
    y INTEGER,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    is_open INTEGER NOT NULL DEFAULT 0,
    always_on_top INTEGER NOT NULL DEFAULT 0,
    opacity REAL NOT NULL DEFAULT 1,
    glass INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  `,
];

const now = () => new Date().toISOString();
const b = (x) => (x ? 1 : 0);

function rowToNote(r, tagMap) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    content_text: r.content_text,
    category_id: r.category_id,
    color: r.color,
    is_favorite: !!r.is_favorite,
    is_pinned: !!r.is_pinned,
    is_archived: !!r.is_archived,
    deleted_at: r.deleted_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    reminder_at: r.reminder_at,
    reminder_done: !!r.reminder_done,
    tags: tagMap?.get(r.id) ?? [],
  };
}

function rowToCategory(r) {
  return { id: r.id, name: r.name, color: r.color, sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at };
}

function rowToWidget(r) {
  return {
    note_id: r.note_id,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    is_open: !!r.is_open,
    always_on_top: !!r.always_on_top,
    opacity: r.opacity,
    glass: !!r.glass,
    updated_at: r.updated_at,
  };
}

function openStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // --- migrations ---
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > MIGRATIONS.length) {
    throw new Error(`Veritabanı bu sürümden daha yeni (şema ${version}). Lütfen ${APP_NAME}'u güncelleyin.`);
  }
  for (let i = version; i < MIGRATIONS.length; i++) {
    tx(() => {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }

  const q = {
    allNotes: db.prepare('SELECT * FROM notes ORDER BY id'),
    note: db.prepare('SELECT * FROM notes WHERE id = ?'),
    noteTags: db.prepare('SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name'),
    allNoteTags: db.prepare('SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id ORDER BY t.name'),
    insertNote: db.prepare(`INSERT INTO notes (title, content, content_text, category_id, color, is_favorite, is_pinned, is_archived, deleted_at, created_at, updated_at, reminder_at, reminder_done)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    tagByName: db.prepare('SELECT id FROM tags WHERE name = ?'),
    insertTag: db.prepare('INSERT INTO tags (name) VALUES (?)'),
    clearNoteTags: db.prepare('DELETE FROM note_tags WHERE note_id = ?'),
    addNoteTag: db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)'),
    purgeTags: db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)'),
    categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    settings: db.prepare('SELECT key, value FROM settings'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    widget: db.prepare('SELECT * FROM widget_states WHERE note_id = ?'),
    widgets: db.prepare('SELECT * FROM widget_states'),
  };

  function categoryExists(cid) {
    return cid === null || !!q.category.get(cid);
  }

  function setTags(noteId, names) {
    q.clearNoteTags.run(noteId);
    for (const name of names) {
      let row = q.tagByName.get(name);
      const tagId = row ? row.id : Number(q.insertTag.run(name).lastInsertRowid);
      q.addNoteTag.run(noteId, tagId);
    }
    q.purgeTags.run();
  }

  function getNote(noteId) {
    const r = q.note.get(noteId);
    if (!r) return null;
    const tagMap = new Map([[noteId, q.noteTags.all(noteId).map((t) => t.name)]]);
    return rowToNote(r, tagMap);
  }

  // ------------------------------------------------------------------ notes
  const notes = {
    list() {
      const tagMap = new Map();
      for (const { note_id, name } of q.allNoteTags.all()) {
        if (!tagMap.has(note_id)) tagMap.set(note_id, []);
        tagMap.get(note_id).push(name);
      }
      return q.allNotes.all().map((r) => rowToNote(r, tagMap));
    },

    get: getNote,

    create(input = {}) {
      const p = v.notePatch(input);
      if (p.category_id !== undefined && !categoryExists(p.category_id)) throw new v.ValidationError('Kategori bulunamadı');
      const t = now();
      const content = p.content ?? '';
      return tx(() => {
        const r = q.insertNote.run(
          p.title ?? '', content, htmlToText(content), p.category_id ?? null, p.color ?? null,
          b(p.is_favorite), b(p.is_pinned), b(p.is_archived), null, t, t, p.reminder_at ?? null, 0,
        );
        const noteId = Number(r.lastInsertRowid);
        if (p.tags) setTags(noteId, p.tags);
        return getNote(noteId);
      });
    },

    update(noteId, patch) {
      v.id(noteId);
      const p = v.notePatch(patch);
      if (!q.note.get(noteId)) throw new v.ValidationError('Not bulunamadı');
      if (p.category_id !== undefined && !categoryExists(p.category_id)) throw new v.ValidationError('Kategori bulunamadı');
      return tx(() => {
        const sets = [];
        const vals = [];
        for (const k of ['title', 'content', 'category_id', 'color']) {
          if (p[k] !== undefined) { sets.push(`${k} = ?`); vals.push(p[k]); }
        }
        for (const k of ['is_favorite', 'is_pinned', 'is_archived']) {
          if (p[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b(p[k])); }
        }
        if (p.content !== undefined) { sets.push('content_text = ?'); vals.push(htmlToText(p.content)); }
        if (p.reminder_at !== undefined) {
          // Yeni bir hatırlatma zamanı ayarlamak, onu yeniden "bekliyor" durumuna alır.
          sets.push('reminder_at = ?', 'reminder_done = 0');
          vals.push(p.reminder_at);
        }
        // Sabitleme/favori/arşiv bayrakları "son düzenleme" zamanını değiştirmez.
        if (['title', 'content', 'tags', 'category_id', 'color', 'reminder_at'].some((k) => p[k] !== undefined)) {
          sets.push('updated_at = ?');
          vals.push(now());
        }
        if (sets.length) db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, noteId);
        if (p.tags) setTags(noteId, p.tags);
        return getNote(noteId);
      });
    },

    trash(noteId) {
      v.id(noteId);
      db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now(), noteId);
      return getNote(noteId);
    },

    restore(noteId) {
      v.id(noteId);
      db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(noteId);
      return getNote(noteId);
    },

    // Kalıcı silme yalnızca çöp kutusundaki notlar için mümkündür.
    destroy(noteId) {
      v.id(noteId);
      return tx(() => {
        const r = db.prepare('DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL').run(noteId);
        q.purgeTags.run();
        return r.changes > 0;
      });
    },

    // Hiç içerik girilmemiş yeni notu iz bırakmadan kaldırır.
    discardIfEmpty(noteId) {
      v.id(noteId);
      return tx(() => {
        const r = db.prepare(`DELETE FROM notes WHERE id = ? AND title = '' AND content_text = ''
          AND reminder_at IS NULL AND id NOT IN (SELECT note_id FROM note_tags)`).run(noteId);
        return r.changes > 0;
      });
    },

    emptyTrash() {
      return tx(() => {
        const ids = db.prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL').all().map((r) => r.id);
        db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run();
        q.purgeTags.run();
        return ids;
      });
    },

    dueReminders(atIso) {
      return db.prepare(`SELECT * FROM notes WHERE reminder_at IS NOT NULL AND reminder_done = 0
        AND deleted_at IS NULL AND reminder_at <= ? ORDER BY reminder_at`).all(atIso).map((r) => rowToNote(r));
    },

    markReminderDone(noteId) {
      db.prepare('UPDATE notes SET reminder_done = 1 WHERE id = ?').run(v.id(noteId));
      return getNote(noteId);
    },
  };

  // ------------------------------------------------------------- categories
  const categories = {
    list: () => q.categories.all().map(rowToCategory),

    create({ name, color }) {
      const n = v.categoryName(name);
      const c = v.color(color);
      if (!c) throw new v.ValidationError('Kategori rengi gerekli');
      const t = now();
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get().m;
      const r = db.prepare('INSERT INTO categories (name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(n, c, max + 1, t, t);
      return rowToCategory(q.category.get(Number(r.lastInsertRowid)));
    },

    update(cid, patch) {
      v.id(cid);
      if (!q.category.get(cid)) throw new v.ValidationError('Kategori bulunamadı');
      if (!patch || typeof patch !== 'object') throw new v.ValidationError('Geçersiz kategori verisi');
      const sets = [];
      const vals = [];
      for (const [k, val] of Object.entries(patch)) {
        if (k === 'name') { sets.push('name = ?'); vals.push(v.categoryName(val)); }
        else if (k === 'color') {
          const c = v.color(val);
          if (!c) throw new v.ValidationError('Kategori rengi gerekli');
          sets.push('color = ?'); vals.push(c);
        } else throw new v.ValidationError(`Bilinmeyen alan: ${k}`);
      }
      if (sets.length) {
        sets.push('updated_at = ?');
        vals.push(now());
        db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals, cid);
      }
      return rowToCategory(q.category.get(cid));
    },

    // mode: 'uncategorize' | 'move' | 'trash' — notlar asla sessizce silinmez.
    remove(cid, mode, targetId = null) {
      v.id(cid);
      if (!q.category.get(cid)) throw new v.ValidationError('Kategori bulunamadı');
      if (!['uncategorize', 'move', 'trash'].includes(mode)) throw new v.ValidationError('Geçersiz silme seçeneği');
      if (mode === 'move') {
        v.id(targetId, 'hedef kategori');
        if (targetId === cid || !q.category.get(targetId)) throw new v.ValidationError('Hedef kategori geçersiz');
      }
      return tx(() => {
        const affected = db.prepare('SELECT id FROM notes WHERE category_id = ?').all(cid).map((r) => r.id);
        if (mode === 'move') db.prepare('UPDATE notes SET category_id = ? WHERE category_id = ?').run(targetId, cid);
        if (mode === 'trash') {
          db.prepare('UPDATE notes SET deleted_at = ? WHERE category_id = ? AND deleted_at IS NULL').run(now(), cid);
        }
        // 'uncategorize' ve 'trash' için ON DELETE SET NULL kategoriyi boşaltır.
        db.prepare('DELETE FROM categories WHERE id = ?').run(cid);
        return affected;
      });
    },

    reorder(ids) {
      if (!Array.isArray(ids)) throw new v.ValidationError('Geçersiz sıralama');
      ids.forEach((x) => v.id(x));
      const existing = new Set(q.categories.all().map((c) => c.id));
      if (ids.length !== existing.size || !ids.every((x) => existing.has(x)) || new Set(ids).size !== ids.length) {
        throw new v.ValidationError('Sıralama tüm kategorileri içermeli');
      }
      tx(() => ids.forEach((cid, i) => db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(i, cid)));
      return categories.list();
    },
  };

  // --------------------------------------------------------------- settings
  const settings = {
    all() {
      const out = { ...DEFAULT_SETTINGS };
      for (const { key, value } of q.settings.all()) {
        if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
        try {
          out[key] = v.setting(key, JSON.parse(value));
        } catch {
          // Bozuk/eskimiş değer varsayılana düşer.
        }
      }
      return out;
    },
    set(key, value) {
      const val = v.setting(key, value);
      q.setSetting.run(key, JSON.stringify(val));
      return val;
    },
  };

  // ---------------------------------------------------------------- widgets
  const widgets = {
    get(noteId) {
      const r = q.widget.get(noteId);
      return r ? rowToWidget(r) : null;
    },
    list: () => q.widgets.all().map(rowToWidget),
    save(noteId, s) {
      const cur = widgets.get(noteId) ?? { x: null, y: null, width: 300, height: 320, is_open: false, always_on_top: false, opacity: 1, glass: true };
      const n = { ...cur, ...s };
      db.prepare(`INSERT INTO widget_states (note_id, x, y, width, height, is_open, always_on_top, opacity, glass, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(note_id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height,
          is_open = excluded.is_open, always_on_top = excluded.always_on_top, opacity = excluded.opacity, glass = excluded.glass,
          updated_at = excluded.updated_at`)
        .run(noteId, n.x, n.y, n.width, n.height, b(n.is_open), b(n.always_on_top), n.opacity, b(n.glass), now());
      return widgets.get(noteId);
    },
  };

  // ------------------------------------------------------------------ backup
  function exportData() {
    const { mainWindowBounds, lastView, trayHintShown, openAtLogin, ...portableSettings } = settings.all();
    return {
      app: APP_NAME,
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: now(),
      categories: categories.list(),
      notes: notes.list().map(({ content_text, ...n }) => n),
      settings: portableSettings,
    };
  }

  function validateBackup(data) {
    const errors = [];
    const err = (m) => { if (errors.length < 20) errors.push(m); };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Dosya geçerli bir yedek nesnesi değil.'] };
    if (data.format !== BACKUP_FORMAT) err(`Bu dosya bir ${APP_NAME} yedeği değil (format alanı eksik veya hatalı).`);
    if (!Number.isInteger(data.version) || data.version < 1 || data.version > BACKUP_VERSION) err('Desteklenmeyen yedek sürümü.');
    if (!Array.isArray(data.categories)) err('Kategori listesi eksik.');
    if (!Array.isArray(data.notes)) err('Not listesi eksik.');
    if (errors.length) return { ok: false, errors };

    const catIds = new Set();
    data.categories.forEach((c, i) => {
      try {
        if (!c || typeof c !== 'object') throw new v.ValidationError('nesne değil');
        v.id(c.id); v.categoryName(c.name);
        if (!v.isHexColor(c.color)) throw new v.ValidationError('renk geçersiz');
        if (catIds.has(c.id)) throw new v.ValidationError('yinelenen kimlik');
        catIds.add(c.id);
      } catch (e) { err(`Kategori #${i + 1}: ${e.message}`); }
    });
    data.notes.forEach((n, i) => {
      try {
        if (!n || typeof n !== 'object') throw new v.ValidationError('nesne değil');
        v.notePatch({
          title: n.title, content: n.content, color: n.color ?? null, is_favorite: n.is_favorite,
          is_pinned: n.is_pinned, is_archived: n.is_archived, reminder_at: n.reminder_at ?? null, tags: n.tags ?? [],
        });
        if (n.category_id !== null && n.category_id !== undefined && !catIds.has(n.category_id)) throw new v.ValidationError('bilinmeyen kategori');
        for (const k of ['created_at', 'updated_at']) v.isoDate(n[k], k);
        if (n.deleted_at != null) v.isoDate(n.deleted_at, 'deleted_at');
      } catch (e) { err(`Not #${i + 1}${n?.title ? ` (“${String(n.title).slice(0, 30)}”)` : ''}: ${e.message}`); }
    });
    if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings) || data.settings === null)) {
      err('Ayarlar bölümü geçersiz.');
    }
    return errors.length
      ? { ok: false, errors }
      : { ok: true, errors: [], summary: { notes: data.notes.length, categories: data.categories.length, exported_at: data.exported_at ?? null } };
  }

  // mode: 'merge' => mevcut veriye ekler; 'replace' => önce otomatik yedek alır, sonra değiştirir.
  function importData(data, mode, safetyBackupPath) {
    const check = validateBackup(data);
    if (!check.ok) throw new v.ValidationError(check.errors.join('\n'));
    if (!['merge', 'replace'].includes(mode)) throw new v.ValidationError('Geçersiz içe aktarma modu');
    if (mode === 'replace') {
      if (!safetyBackupPath) throw new Error('Güvenlik yedeği yolu gerekli');
      snapshot(safetyBackupPath);
    }
    return tx(() => {
      if (mode === 'replace') {
        db.exec('DELETE FROM note_tags; DELETE FROM tags; DELETE FROM widget_states; DELETE FROM notes; DELETE FROM categories;');
      }
      const existingByName = new Map(categories.list().map((c) => [c.name.toLocaleLowerCase('tr'), c.id]));
      let maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get().m;
      const catMap = new Map();
      const sortedCats = [...data.categories].sort((a, c) => (a.sort_order ?? 0) - (c.sort_order ?? 0));
      for (const c of sortedCats) {
        const name = v.categoryName(c.name);
        const existing = existingByName.get(name.toLocaleLowerCase('tr'));
        if (existing) { catMap.set(c.id, existing); continue; }
        const t = now();
        const r = db.prepare('INSERT INTO categories (name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(name, c.color.toUpperCase(), ++maxOrder, c.created_at && !Number.isNaN(Date.parse(c.created_at)) ? new Date(c.created_at).toISOString() : t, t);
        catMap.set(c.id, Number(r.lastInsertRowid));
        existingByName.set(name.toLocaleLowerCase('tr'), Number(r.lastInsertRowid));
      }
      let count = 0;
      for (const n of data.notes) {
        const content = n.content ?? '';
        const r = q.insertNote.run(
          n.title, content, htmlToText(content),
          n.category_id != null ? catMap.get(n.category_id) : null,
          n.color ? n.color.toUpperCase() : null,
          b(n.is_favorite), b(n.is_pinned), b(n.is_archived),
          n.deleted_at ? new Date(n.deleted_at).toISOString() : null,
          new Date(n.created_at).toISOString(), new Date(n.updated_at).toISOString(),
          n.reminder_at ? new Date(n.reminder_at).toISOString() : null, b(n.reminder_done),
        );
        if (Array.isArray(n.tags) && n.tags.length) setTags(Number(r.lastInsertRowid), v.tags(n.tags));
        count++;
      }
      if (mode === 'replace' && data.settings) {
        for (const [key, val] of Object.entries(data.settings)) {
          if (['mainWindowBounds', 'lastView', 'trayHintShown', 'openAtLogin'].includes(key)) continue;
          try { settings.set(key, val); } catch { /* bilinmeyen/geçersiz ayar atlanır */ }
        }
      }
      return { notes: count, categories: catMap.size };
    });
  }

  // Tutarlı bir anlık kopya (WAL dahil) üretir.
  function snapshot(targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath);
    db.prepare('VACUUM INTO ?').run(targetPath);
    return targetPath;
  }

  function close() {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* yoksay */ }
    db.close();
  }

  return {
    path: dbPath,
    schemaVersion: MIGRATIONS.length,
    notes,
    categories,
    settings,
    widgets,
    exportData,
    validateBackup,
    importData,
    snapshot,
    close,
    limits: LIMITS,
  };
}

module.exports = { openStore, MIGRATIONS };
