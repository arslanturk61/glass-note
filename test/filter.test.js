'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/renderer/modules/filter.js');

const note = (o) => ({
  id: 1, title: '', content_text: '', category_id: null, color: null, tags: [],
  is_pinned: false, is_favorite: false, is_archived: false, deleted_at: null, reminder_at: null, reminder_done: false,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...o,
});

test('fold: Türkçe büyük/küçük harf ve aksan duyarsız', async () => {
  const { fold } = await load();
  assert.equal(fold('ŞİRKET'), 'sirket');
  assert.equal(fold('Işık'), 'isik');
  assert.equal(fold('ÇAĞRI ÖĞÜN'), 'cagri ogun');
});

test('arama başlık, içerik, kategori ve etiketleri kapsar', async () => {
  const { matchesSearch } = await load();
  const cats = new Map([[7, { id: 7, name: 'Projeler', color: '#000000' }]]);
  const n = note({ title: 'Toplantı', content_text: 'bütçe onayı', category_id: 7, tags: ['öncelik'] });
  for (const q of ['toplanti', 'BUTCE', 'projeler', '#once', 'toplantı bütçe']) assert.ok(matchesSearch(n, q, cats), q);
  for (const q of ['yok', '#bütçe', 'toplantı yok']) assert.ok(!matchesSearch(n, q, cats), q);
});

test('görünümler arşiv, çöp ve kategoriyi doğru ayırır', async () => {
  const { matchesView } = await load();
  const live = note({ category_id: 3 });
  const archived = note({ is_archived: true, is_favorite: true });
  const trashed = note({ deleted_at: '2026-01-02T00:00:00.000Z', is_pinned: true });
  assert.ok(matchesView(live, { type: 'all' }) && !matchesView(archived, { type: 'all' }) && !matchesView(trashed, { type: 'all' }));
  assert.ok(matchesView(archived, { type: 'archive' }) && matchesView(archived, { type: 'favorites' }));
  assert.ok(matchesView(trashed, { type: 'trash' }) && !matchesView(trashed, { type: 'pinned' }));
  assert.ok(matchesView(live, { type: 'category', id: 3 }) && !matchesView(live, { type: 'category', id: 4 }));
});

test('renk filtresi kategori rengini miras alır, not rengi önceliklidir', async () => {
  const { filterNotes, effectiveColor } = await load();
  const cats = new Map([[1, { id: 1, name: 'İş', color: '#0C60FC' }]]);
  const a = note({ id: 1, category_id: 1 });
  const b = note({ id: 2, category_id: 1, color: '#FF7A59' });
  assert.equal(effectiveColor(a, cats), '#0C60FC');
  assert.equal(effectiveColor(b, cats), '#FF7A59');
  assert.deepEqual(filterNotes([a, b], { view: { type: 'all' }, color: '#0C60FC', categoriesById: cats }).map((n) => n.id), [1]);
});

test('sıralama: sabitlenenler önce, başlık Türkçe alfabeye göre', async () => {
  const { sortNotes } = await load();
  const cats = new Map();
  const list = [
    note({ id: 1, title: 'Zeytin', updated_at: '2026-01-03T00:00:00.000Z' }),
    note({ id: 2, title: 'Çay', updated_at: '2026-01-01T00:00:00.000Z' }),
    note({ id: 3, title: 'Cam', updated_at: '2026-01-02T00:00:00.000Z', is_pinned: true }),
    note({ id: 4, title: 'Şeker', updated_at: '2026-01-04T00:00:00.000Z' }),
  ];
  assert.deepEqual(sortNotes(list, { sortBy: 'updated', pinnedFirst: true, categoriesById: cats }).map((n) => n.id), [3, 4, 1, 2]);
  assert.deepEqual(sortNotes(list, { sortBy: 'title', pinnedFirst: false, categoriesById: cats }).map((n) => n.title), ['Cam', 'Çay', 'Şeker', 'Zeytin']);
});
