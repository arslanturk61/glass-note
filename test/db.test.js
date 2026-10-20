'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openStore } = require('../src/main/db');
const { htmlToText } = require('../src/shared/text');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glassnote-test-'));
  return path.join(dir, 'notes.db');
}

test('migration sets schema version and is idempotent', () => {
  const p = tmpDb();
  const s1 = openStore(p);
  assert.equal(s1.schemaVersion, 2);
  s1.close();
  const s2 = openStore(p);
  s2.close();
  const raw = new DatabaseSync(p);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 2);
  raw.close();
});

test('v1 veritabanı v2ye yükseltilirken notlar ve widget durumları korunur', () => {
  const { MIGRATIONS } = require('../src/main/db');
  const p = tmpDb();
  const raw = new DatabaseSync(p);
  raw.exec(MIGRATIONS[0]);
  raw.exec('PRAGMA user_version = 1');
  const t = new Date().toISOString();
  raw.prepare("INSERT INTO notes (title, content, content_text, created_at, updated_at) VALUES ('Eski not', '<div>içerik</div>', 'içerik', ?, ?)").run(t, t);
  raw.prepare('INSERT INTO widget_states (note_id, x, y, width, height, is_open, always_on_top, updated_at) VALUES (1, 10, 20, 300, 320, 1, 1, ?)').run(t);
  raw.close();
  const s = openStore(p);
  assert.equal(s.notes.get(1).title, 'Eski not');
  const w = s.widgets.get(1);
  assert.equal(w.always_on_top, true);
  assert.equal(w.desktop_pinned, false);
  s.widgets.save(1, { desktop_pinned: true, always_on_top: false });
  assert.equal(s.widgets.get(1).desktop_pinned, true);
  s.close();
});

test('refuses to open a database from a newer app version', () => {
  const p = tmpDb();
  openStore(p).close();
  const raw = new DatabaseSync(p);
  raw.exec('PRAGMA user_version = 99');
  raw.close();
  assert.throws(() => openStore(p), /daha yeni/);
});

test('notes: create, update, persist across reopen with Turkish text', () => {
  const p = tmpDb();
  let s = openStore(p);
  const n = s.notes.create({ title: 'Şirket toplantısı — ĞÜŞİÖÇ ğüşıöç', content: '<b>Önemli</b> &amp; acil' });
  assert.equal(n.content_text, 'Önemli & acil');
  const u = s.notes.update(n.id, { content: '<ul><li>Çay</li><li>Simit</li></ul>', tags: ['#iş', 'İŞ', ' yarın '] });
  assert.deepEqual(u.tags.sort(), ['iş', 'yarın']);
  assert.ok(u.updated_at >= n.updated_at);
  s.close();
  s = openStore(p);
  const back = s.notes.get(n.id);
  assert.equal(back.title, 'Şirket toplantısı — ĞÜŞİÖÇ ğüşıöç');
  assert.equal(back.content, '<ul><li>Çay</li><li>Simit</li></ul>');
  assert.equal(back.content_text, 'Çay\nSimit');
  s.close();
});

test('notes: pin/favorite do not bump updated_at; validation rejects bad input', () => {
  const s = openStore(tmpDb());
  const n = s.notes.create({ title: 'a' });
  const pinned = s.notes.update(n.id, { is_pinned: true, is_favorite: true });
  assert.equal(pinned.updated_at, n.updated_at);
  assert.equal(pinned.is_pinned, true);
  assert.throws(() => s.notes.update(n.id, { evil: 1 }), /Bilinmeyen alan/);
  assert.throws(() => s.notes.update(n.id, { color: 'red' }), /Geçersiz renk/);
  assert.throws(() => s.notes.update(n.id, { is_pinned: 'yes' }), /true\/false/);
  assert.throws(() => s.notes.update(n.id, { title: 'x'.repeat(501) }), /çok uzun/);
  assert.throws(() => s.notes.update(n.id, { category_id: 999 }), /Kategori bulunamadı/);
  assert.throws(() => s.notes.update(-1, { title: 'x' }), /Geçersiz id/);
  s.close();
});

test('notes: trash, restore, destroy only from trash, empty trash', () => {
  const s = openStore(tmpDb());
  const a = s.notes.create({ title: 'a', tags: ['x'] });
  const c = s.notes.create({ title: 'c' });
  assert.equal(s.notes.destroy(a.id), false, 'cannot hard-delete a live note');
  assert.ok(s.notes.trash(a.id).deleted_at);
  assert.equal(s.notes.restore(a.id).deleted_at, null);
  s.notes.trash(a.id);
  s.notes.trash(c.id);
  assert.equal(s.notes.destroy(a.id), true);
  assert.equal(s.notes.get(a.id), null);
  assert.deepEqual(s.notes.emptyTrash(), [c.id]);
  assert.equal(s.notes.list().length, 0);
  s.close();
});

test('notes: discardIfEmpty only removes truly empty notes', () => {
  const s = openStore(tmpDb());
  const empty = s.notes.create({});
  const full = s.notes.create({ content: '<div>x</div>' });
  const blankHtml = s.notes.create({ content: '<div><br></div>' });
  assert.equal(s.notes.discardIfEmpty(empty.id), true);
  assert.equal(s.notes.discardIfEmpty(full.id), false);
  assert.equal(s.notes.discardIfEmpty(blankHtml.id), true);
  s.close();
});

test('categories: create, rename, reorder, delete modes', () => {
  const s = openStore(tmpDb());
  const work = s.categories.create({ name: ' İş ', color: '#0c60fc' });
  const home = s.categories.create({ name: 'Kişisel', color: '#2BC39A' });
  const ideas = s.categories.create({ name: 'Fikirler', color: '#9B7BF7' });
  assert.equal(work.name, 'İş');
  assert.equal(work.color, '#0C60FC');
  assert.equal(s.categories.update(work.id, { name: 'Ofis' }).name, 'Ofis');
  assert.deepEqual(s.categories.reorder([ideas.id, work.id, home.id]).map((c) => c.id), [ideas.id, work.id, home.id]);
  assert.throws(() => s.categories.reorder([ideas.id]), /tüm kategorileri/);

  const n1 = s.notes.create({ title: '1', category_id: work.id });
  const n2 = s.notes.create({ title: '2', category_id: home.id });
  const n3 = s.notes.create({ title: '3', category_id: ideas.id });

  s.categories.remove(work.id, 'move', home.id);
  assert.equal(s.notes.get(n1.id).category_id, home.id);
  assert.equal(s.notes.get(n1.id).deleted_at, null);

  s.categories.remove(ideas.id, 'uncategorize');
  assert.equal(s.notes.get(n3.id).category_id, null);
  assert.equal(s.notes.get(n3.id).deleted_at, null);

  s.categories.remove(home.id, 'trash');
  assert.ok(s.notes.get(n2.id).deleted_at, 'moved to trash, not hard-deleted');
  assert.ok(s.notes.get(n1.id).deleted_at);
  assert.throws(() => s.categories.remove(12345, 'trash'), /bulunamadı/);
  s.close();
});

test('settings: defaults, validation, persistence', () => {
  const p = tmpDb();
  let s = openStore(p);
  assert.equal(s.settings.all().theme, 'system');
  s.settings.set('theme', 'dark');
  s.settings.set('accentColor', '#ff00aa');
  assert.throws(() => s.settings.set('theme', 'neon'), /Geçersiz değer/);
  assert.throws(() => s.settings.set('hack', true), /Bilinmeyen ayar/);
  s.close();
  s = openStore(p);
  assert.equal(s.settings.all().theme, 'dark');
  assert.equal(s.settings.all().accentColor, '#FF00AA');
  s.close();
});

test('widgets: state saved and cascades with note deletion', () => {
  const s = openStore(tmpDb());
  const n = s.notes.create({ title: 'w' });
  s.widgets.save(n.id, { x: 10, y: 20, width: 333, height: 222, is_open: true, always_on_top: true });
  assert.deepEqual(
    (({ x, y, width, height, is_open, always_on_top }) => ({ x, y, width, height, is_open, always_on_top }))(s.widgets.get(n.id)),
    { x: 10, y: 20, width: 333, height: 222, is_open: true, always_on_top: true },
  );
  s.notes.trash(n.id);
  s.notes.destroy(n.id);
  assert.equal(s.widgets.get(n.id), null);
  s.close();
});

test('reminders: due query and done flag; new time re-arms', () => {
  const s = openStore(tmpDb());
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const a = s.notes.create({ title: 'past', reminder_at: past });
  s.notes.create({ title: 'future', reminder_at: future });
  assert.deepEqual(s.notes.dueReminders(new Date().toISOString()).map((n) => n.id), [a.id]);
  s.notes.markReminderDone(a.id);
  assert.equal(s.notes.dueReminders(new Date().toISOString()).length, 0);
  s.notes.update(a.id, { reminder_at: past });
  assert.equal(s.notes.dueReminders(new Date().toISOString()).length, 1);
  s.close();
});

test('backup: export → validate → merge and replace import', () => {
  const src = openStore(tmpDb());
  const cat = src.categories.create({ name: 'Projeler', color: '#E8C547' });
  src.notes.create({ title: 'Plan', content: '<b>adım</b>', category_id: cat.id, tags: ['q4'], is_pinned: true });
  src.notes.create({ title: 'Serbest' });
  src.settings.set('theme', 'light');
  const backup = JSON.parse(JSON.stringify(src.exportData()));
  src.close();

  assert.equal(backup.format, 'glassnote-backup');
  const dst = openStore(tmpDb());
  assert.deepEqual(dst.validateBackup(backup).summary.notes, 2);

  dst.categories.create({ name: 'projeler', color: '#000000' }); // aynı isim (farklı büyük/küçük harf)
  dst.notes.create({ title: 'Mevcut' });
  dst.importData(backup, 'merge');
  assert.equal(dst.notes.list().length, 3, 'merge keeps existing notes');
  assert.equal(dst.categories.list().length, 1, 'merge reuses same-named category');
  const plan = dst.notes.list().find((n) => n.title === 'Plan');
  assert.deepEqual(plan.tags, ['q4']);
  assert.equal(plan.is_pinned, true);

  const safety = path.join(path.dirname(dst.path), 'safety.db');
  dst.importData(backup, 'replace', safety);
  assert.ok(fs.existsSync(safety), 'safety snapshot written before replace');
  assert.deepEqual(dst.notes.list().map((n) => n.title).sort(), ['Plan', 'Serbest']);
  assert.equal(dst.settings.all().theme, 'light');

  // Güvenlik yedeği gerçekten eski veriyi içeriyor mu?
  const snap = new DatabaseSync(safety);
  assert.equal(snap.prepare('SELECT COUNT(*) c FROM notes').get().c, 3);
  snap.close();
  dst.close();
});

test('backup: invalid files are rejected without touching data', () => {
  const s = openStore(tmpDb());
  s.notes.create({ title: 'korunacak' });
  assert.equal(s.validateBackup(null).ok, false);
  assert.equal(s.validateBackup({ foo: 1 }).ok, false);
  const bad = { format: 'glassnote-backup', version: 1, categories: [], notes: [{ title: 5, content: '', created_at: 'x', updated_at: 'y' }] };
  const r = s.validateBackup(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Not #1/);
  assert.throws(() => s.importData(bad, 'replace', path.join(path.dirname(s.path), 'x.db')));
  assert.equal(s.notes.list().length, 1);
  const badCat = { format: 'glassnote-backup', version: 1, categories: [], notes: [{ title: 't', content: '', category_id: 7, is_favorite: false, is_pinned: false, is_archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] };
  assert.match(s.validateBackup(badCat).errors[0], /bilinmeyen kategori/);
  s.close();
});

test('htmlToText handles entities and blocks safely', () => {
  assert.equal(htmlToText('<div>a</div><div>b<br>c</div>'), 'a\nb\nc');
  assert.equal(htmlToText('&lt;script&gt; &#x1F600; &#305;'), '<script> 😀 ı');
  assert.equal(htmlToText('<script>alert(1)</script>ok'), 'ok');
  assert.equal(htmlToText(''), '');
});
