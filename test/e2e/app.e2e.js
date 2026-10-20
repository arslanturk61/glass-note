'use strict';

// Gerçek Electron süreci üzerinde uçtan uca testler (Playwright).
// Her test geçici, izole bir kullanıcı veri klasörü kullanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { _electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
// GLASSNOTE_E2E_EXE ayarlıysa testler paketlenmiş uygulamaya karşı çalışır.
const EXE = process.env.GLASSNOTE_E2E_EXE ? path.resolve(ROOT, process.env.GLASSNOTE_E2E_EXE) : null;
const NO_THROTTLE = ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const LOGIN_NAME = EXE ? 'GlassNote' : 'GlassNote Dev';
const T = { timeout: 90_000 };

// Bir test başarısız olsa bile açık kalan uygulama süreçleri kapatılır.
const running = new Set();
test.afterEach(() => {
  for (const app of running) app.process().kill();
  running.clear();
});

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'glassnote-e2e-'));

async function launch(userData, extraArgs = []) {
  const app = await _electron.launch({
    // Testler sırasında başka pencerelerin arkasında kalan test pencereleri için
    // Chromium'un çizimi duraklatmasını engelle (yalnızca testlerde).
    ...(EXE ? { executablePath: EXE, args: [...NO_THROTTLE, ...extraArgs] } : { args: ['.', ...NO_THROTTLE, ...extraArgs] }),
    cwd: ROOT,
    colorScheme: null, // Playwright'ın açık tema taklidini kapat; nativeTheme geçerli olsun
    env: { ...process.env, GLASSNOTE_USER_DATA: userData, GLASSNOTE_TEST: '1' },
  });
  running.add(app);
  app.process().once('exit', () => running.delete(app));
  if (extraArgs.includes('--autostart')) return { app, win: null };
  const win = await pageFor(app, 'index.html');
  await win.waitForSelector('.sidebar');
  return { app, win };
}

async function pageFor(app, name, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const p = app.windows().find((w) => w.url().includes(name));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Pencere bulunamadı: ${name}`);
}

async function quit(app) {
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(() => global.__glassnote.quit()).catch(() => {});
  await exited;
}

const ctx = (app, fn, arg) => app.evaluate(fn, arg);

async function waitFor(fn, timeout = 10_000, step = 100) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`Koşul zaman aşımına uğradı (son değer: ${JSON.stringify(last)})`);
}

async function newNoteViaUi(win, title, body) {
  await win.keyboard.press('Control+N');
  await win.waitForFunction(() => document.activeElement?.classList.contains('editor-title'));
  await win.keyboard.type(title);
  await win.keyboard.press('Enter');
  await win.waitForFunction(() => document.activeElement?.classList.contains('rich'));
  await win.keyboard.type(body);
}

test('notlar otomatik kaydedilir ve yeniden başlatmadan sonra korunur', T, async () => {
  const ud = tmpDir();
  let { app, win } = await launch(ud);
  await newNoteViaUi(win, 'Kalıcılık testi ĞÜŞİÖÇ', 'İçerik: ğüşıöç — özel <karakterler> & "tırnak"');
  await win.waitForSelector('.editor-head .status.saved');
  const saved = await ctx(app, () => global.__glassnote.store.notes.list()[0]);
  assert.equal(saved.title, 'Kalıcılık testi ĞÜŞİÖÇ');
  assert.equal(saved.content_text, 'İçerik: ğüşıöç — özel <karakterler> & "tırnak"');

  // Gecikme dolmadan çıkış: beforeunload eşzamanlı kaydı içeriği korumalı.
  await win.click('.rich');
  await win.keyboard.press('End');
  await win.keyboard.type(' SON');
  await quit(app);

  ({ app, win } = await launch(ud));
  await win.waitForSelector('.card');
  const title = await win.textContent('.card .card-title');
  const preview = await win.textContent('.card .card-preview');
  assert.equal(title, 'Kalıcılık testi ĞÜŞİÖÇ');
  assert.ok(preview.endsWith(' SON'), `kapanışta kaydedilmemiş metin kayboldu: ${preview}`);
  await quit(app);
});

test('boş bırakılan yeni not iz bırakmaz; çöp kutusu ve geri yükleme çalışır', T, async () => {
  const { app, win } = await launch(tmpDir());
  await win.keyboard.press('Control+N');
  await win.waitForFunction(() => document.activeElement?.classList.contains('editor-title'));
  await win.keyboard.press('Escape');
  await waitFor(async () => (await ctx(app, () => global.__glassnote.store.notes.list().length)) === 0);

  await newNoteViaUi(win, 'Silinecek not', 'gövde');
  await win.waitForSelector('.editor-head .status.saved');
  await win.click('.editor-head button[aria-label="Çöp kutusuna taşı"]');
  await win.waitForSelector('.toast:has-text("çöp kutusuna")');
  assert.equal(await win.locator('.notes .card').count(), 0);
  await win.click('.nav-item[data-key="trash"]');
  await win.waitForSelector('.card:has-text("Silinecek not")');
  await win.click('.card', { button: 'right' });
  await win.click('.popover .menu-item:has-text("Geri yükle")');
  await win.click('.nav-item[data-key="all"]');
  await win.waitForSelector('.card:has-text("Silinecek not")');

  // Kalıcı silme onay ister.
  const id = await ctx(app, () => global.__glassnote.store.notes.list()[0].id);
  await ctx(app, (_e, nid) => global.__glassnote.trashNote(nid), id);
  await win.click('.nav-item[data-key="trash"]');
  await win.click('.card', { button: 'right' });
  await win.click('.popover .menu-item:has-text("Kalıcı olarak sil")');
  await win.click('dialog .btn.danger');
  await waitFor(async () => (await ctx(app, () => global.__glassnote.store.notes.list().length)) === 0);
  await quit(app);
});

test('kategoriler: oluşturma, renk, sürükleme ile not taşıma, silme seçenekleri', T, async () => {
  const { app, win } = await launch(tmpDir());
  for (const name of ['İş', 'Kişisel']) {
    await win.click('button[aria-label="Yeni kategori"]');
    await win.fill('dialog input.input', name);
    await win.click('dialog button[type=submit]');
    await win.waitForSelector('dialog', { state: 'detached' });
  }
  const cats = await ctx(app, () => global.__glassnote.store.categories.list());
  assert.deepEqual(cats.map((c) => c.name), ['İş', 'Kişisel']);

  // Sürükle-bırak ile sıralama: "Kişisel"i "İş"in üstüne taşı.
  await win.dragAndDrop(`.cat-item[data-id="${cats[1].id}"]`, `.cat-item[data-id="${cats[0].id}"]`, { targetPosition: { x: 40, y: 4 } });
  await waitFor(async () => (await ctx(app, () => global.__glassnote.store.categories.list().map((c) => c.name).join())) === 'Kişisel,İş');

  await newNoteViaUi(win, 'Taşınacak', 'x');
  await win.keyboard.press('Escape');
  // Kartı "Kişisel" kategorisine sürükle-bırak.
  await win.dragAndDrop('.card:has-text("Taşınacak")', `.cat-item[data-id="${cats[1].id}"] .nav-item`);
  await waitFor(async () => (await ctx(app, () => global.__glassnote.store.notes.list()[0].category_id)) === cats[1].id);

  // Kategori rengi notun etkin rengi olur (kendi rengi yoksa).
  await waitFor(async () => (await win.$eval('.card', (el) => el.style.getPropertyValue('--nc'))).toUpperCase() === cats[1].color);

  // Silerken "başka kategoriye taşı" seçeneği.
  await win.hover(`.cat-item[data-id="${cats[1].id}"]`);
  await win.click(`.cat-item[data-id="${cats[1].id}"] .more`);
  await win.click('.popover .menu-item:has-text("Kategoriyi sil")');
  await win.check('dialog input[value="move"]');
  await win.click('dialog .btn.danger');
  await waitFor(async () => (await ctx(app, () => global.__glassnote.store.categories.list().length)) === 1);
  const n = await ctx(app, () => global.__glassnote.store.notes.list()[0]);
  assert.equal(n.category_id, cats[0].id);
  assert.equal(n.deleted_at, null, 'not silinmemeli');
  await quit(app);
});

test('arama Türkçe karakterlere duyarsız; etiket ve renk filtresi çalışır', T, async () => {
  const { app, win } = await launch(tmpDir());
  await ctx(app, () => {
    const g = global.__glassnote;
    g.createNote({ title: 'Şirket toplantısı', content: '<div>bütçe</div>', tags: ['iş'] });
    g.createNote({ title: 'İstanbul gezisi', content: '<div>Galata</div>', color: '#FF7A59' });
    g.createNote({ title: 'Market', content: '<div>süt</div>' });
  });
  await win.waitForSelector('.card >> nth=2');
  const visible = async () => win.$$eval('.notes .card-title', (els) => els.map((e) => e.textContent).sort());
  await win.fill('.search input', 'sirket');
  await waitFor(async () => (await visible()).length === 1);
  assert.deepEqual(await visible(), ['Şirket toplantısı']);
  await win.fill('.search input', 'ISTANBUL');
  await waitFor(async () => (await visible())[0] === 'İstanbul gezisi');
  await win.fill('.search input', '#iş');
  await waitFor(async () => (await visible())[0] === 'Şirket toplantısı');
  await win.fill('.search input', 'yok-boyle-bir-sey');
  await win.waitForSelector('.empty h2:has-text("Sonuç bulunamadı")');
  await win.fill('.search input', '');
  await win.click('button[aria-label="Renge göre filtrele"]');
  await win.click('.popover .swatch[aria-label="#FF7A59"]');
  await waitFor(async () => (await visible()).length === 1);
  assert.deepEqual(await visible(), ['İstanbul gezisi']);
  await quit(app);
});

test("widget: bağımsız pencere, her zaman üstte, düzenleme, konum/boyut kaydı ve geri yükleme", T, async () => {
  const ud = tmpDir();
  let { app, win } = await launch(ud);
  const [a, b] = await ctx(app, () => [
    global.__glassnote.createNote({ title: 'Widget A', content: '<div>ilk</div>' }).id,
    global.__glassnote.createNote({ title: 'Widget B', content: '<div>ikinci</div>' }).id,
  ]);
  await win.waitForSelector(`.card[data-id="${a}"]`);
  await win.click(`.card[data-id="${a}"]`, { button: 'right' });
  await win.click('.popover .menu-item:has-text("Masaüstünde widget olarak aç")');
  const w = await pageFor(app, `widget.html?id=${a}`);
  await w.waitForSelector('.w-title');
  assert.equal(await w.inputValue('.w-title'), 'Widget A');

  const winState = (id) => ctx(app, (_e, nid) => {
    const bw = global.__glassnote.widgets.windowFor(nid);
    return bw && { onTop: bw.isAlwaysOnTop(), bounds: bw.getContentBounds(), visible: bw.isVisible() };
  }, id);
  assert.equal((await winState(a)).onTop, false);

  // Her zaman üstte: gerçek pencere özelliği değişmeli.
  await w.click('button[aria-label="Her zaman üstte"]');
  await w.waitForSelector('button[aria-label="Her zaman üstte"][aria-pressed="true"]');
  await waitFor(async () => (await winState(a)).onTop === true);
  assert.equal((await ctx(app, (_e, nid) => global.__glassnote.store.widgets.get(nid), a)).always_on_top, true);
  await w.click('button[aria-label="Her zaman üstte"]');
  await waitFor(async () => (await winState(a)).onTop === false);
  await w.click('button[aria-label="Her zaman üstte"]');
  await waitFor(async () => (await winState(a)).onTop === true);

  // Widget üzerinden düzenleme diske yazılır ve ana pencereye iletilir.
  // (Arka plandaki pencere rAF ile ancak görünür olduğunda yeniden çizer; bu yüzden
  // DOM yerine ana pencerenin aldığı değişiklik olayı doğrulanır.)
  await win.evaluate(() => {
    window.__changes = [];
    window.glassnote.on('notes:changed', (p) => window.__changes.push(...p.notes.map((n) => n.content_text)));
  });
  await w.click('.rich');
  await w.keyboard.press('End');
  await w.keyboard.type(' + widgetten');
  await waitFor(async () => (await ctx(app, (_e, nid) => global.__glassnote.store.notes.get(nid).content_text, a)).includes('widgetten'));
  await waitFor(() => win.evaluate(() => window.__changes.some((t) => t.includes('widgetten'))));

  // Taşıma ve boyutlandırma kalıcı olmalı.
  // Kesirli ekran ölçeklemesinde (ör. %125) pencere boyutu birkaç piksel yuvarlanabilir;
  // bu yüzden istenen değil, pencerenin gerçek sınırları referans alınır.
  await ctx(app, (_e, nid) => global.__glassnote.widgets.windowFor(nid).setContentBounds({ x: 140, y: 160, width: 341, height: 299 }), a);
  const target = (await winState(a)).bounds;
  await waitFor(async () => {
    const s = await ctx(app, (_e, nid) => global.__glassnote.store.widgets.get(nid), a);
    return s.x === target.x && s.y === target.y && s.width === target.width && s.height === target.height;
  });

  // İkinci widget.
  await ctx(app, (_e, nid) => global.__glassnote.widgets.open(nid), b);
  await pageFor(app, `widget.html?id=${b}`);
  assert.deepEqual((await ctx(app, () => global.__glassnote.widgets.openIds())).sort(), [a, b].sort());

  // B'yi kullanıcı kapatır: not silinmez, durum "kapalı" olur.
  const wb = await pageFor(app, `widget.html?id=${b}`);
  await wb.click('button[aria-label="Widget\'ı kapat"]');
  await waitFor(async () => (await ctx(app, () => global.__glassnote.widgets.openIds())).length === 1);
  assert.ok(await ctx(app, (_e, nid) => global.__glassnote.store.notes.get(nid), b), 'widget kapanınca not silinmemeli');
  assert.equal((await ctx(app, (_e, nid) => global.__glassnote.store.widgets.get(nid), b)).is_open, false);

  // Uygulamadan çıkış: A açık kalmalı ve aynı konumda geri yüklenmeli.
  await quit(app);
  ({ app, win } = await launch(ud));
  await pageFor(app, `widget.html?id=${a}`);
  assert.deepEqual(await ctx(app, () => global.__glassnote.widgets.openIds()), [a]);
  const st = await winState(a);
  assert.deepEqual(st.bounds, target, 'konum ve boyut aynen geri yüklenmeli (kayma olmamalı)');
  assert.equal(st.onTop, true, 'her zaman üstte tercihi geri yüklenmeli');
  await quit(app);

  // Ekran dışında kalmış (ör. çıkarılmış monitör) widget görünür alana taşınmalı.
  const db = new DatabaseSync(path.join(ud, 'glassnote.db'));
  db.prepare('UPDATE widget_states SET x = -30000, y = 25000 WHERE note_id = ?').run(a);
  db.close();
  ({ app, win } = await launch(ud));
  await pageFor(app, `widget.html?id=${a}`);
  const visibleOnSomeDisplay = await ctx(app, ({ screen }, nid) => {
    const r = global.__glassnote.widgets.windowFor(nid).getContentBounds();
    return screen.getAllDisplays().some(({ workArea: wa }) => r.x >= wa.x && r.y >= wa.y && r.x + r.width <= wa.x + wa.width && r.y + r.height <= wa.y + wa.height);
  }, a);
  assert.ok(visibleOnSomeDisplay, 'ekran dışı widget görünür alana alınmalı');

  // Not çöpe taşınınca widget kapanır.
  await ctx(app, (_e, nid) => global.__glassnote.trashNote(nid), a);
  await waitFor(async () => (await ctx(app, () => global.__glassnote.widgets.openIds())).length === 0);
  await quit(app);
});

test('sistem tepsisi: pencereyi tepsiye gizleme, widget göster/gizle, tamamen çıkış', T, async () => {
  const { app, win } = await launch(tmpDir());
  const items = await ctx(app, () => global.__glassnote.tray.items());
  assert.deepEqual(items.map((i) => i.id), ['open', 'new', 'show-widgets', 'hide-widgets', 'settings', 'quit']);

  const id = await ctx(app, () => global.__glassnote.createNote({ title: 'Tepsi' }).id);
  await ctx(app, (_e, nid) => global.__glassnote.widgets.open(nid), id);
  await pageFor(app, 'widget.html');
  await ctx(app, () => global.__glassnote.tray.trigger('hide-widgets'));
  await waitFor(() => ctx(app, (_e, nid) => !global.__glassnote.widgets.windowFor(nid).isVisible(), id));
  await ctx(app, () => global.__glassnote.tray.trigger('show-widgets'));
  await waitFor(() => ctx(app, (_e, nid) => global.__glassnote.widgets.windowFor(nid).isVisible(), id));

  // Pencereyi kapatmak (closeToTray açıkken) uygulamayı sonlandırmaz.
  await ctx(app, () => global.__glassnote.mainWindow.close());
  await waitFor(() => ctx(app, () => !global.__glassnote.mainWindow.isVisible() && !global.__glassnote.mainWindow.isDestroyed()));
  assert.equal(app.process().exitCode, null, 'uygulama çalışmaya devam etmeli');
  await ctx(app, () => global.__glassnote.tray.trigger('open'));
  await waitFor(() => ctx(app, () => global.__glassnote.mainWindow.isVisible()));

  await ctx(app, () => global.__glassnote.tray.trigger('settings'));
  await win.waitForSelector('.content-head h1:has-text("Ayarlar")');

  // Tepsiden "Yeni not oluştur" ana pencerede yeni not açar.
  await ctx(app, () => global.__glassnote.tray.trigger('new'));
  await win.waitForFunction(() => document.activeElement?.classList.contains('editor-title'));

  // "Uygulamadan çık" süreci sonlandırır.
  const exited = new Promise((r) => app.process().once('exit', r));
  await ctx(app, () => global.__glassnote.tray.trigger('quit'));
  await exited;
});

test('tepsi ayarı kapalıyken pencereyi kapatmak uygulamadan çıkar', T, async () => {
  const { app } = await launch(tmpDir());
  await ctx(app, () => global.__glassnote.setSetting('closeToTray', false));
  const exited = new Promise((r) => app.process().once('exit', r));
  await ctx(app, () => global.__glassnote.mainWindow.close());
  await exited;
});

test('Windows başlangıç kaydı etkinleştirilir ve kaldırılır', T, async () => {
  const { app } = await launch(tmpDir());
  const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const reg = () => {
    try { return execFileSync('reg', ['query', RUN, '/v', LOGIN_NAME], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
  try {
    await ctx(app, () => global.__glassnote.setSetting('openAtLogin', true));
    assert.equal(await ctx(app, () => global.__glassnote.loginItemActive()), true);
    const entry = reg();
    assert.ok(entry && entry.includes('--autostart'), `kayıt defteri girdisi bulunamadı: ${entry}`);
    await ctx(app, () => global.__glassnote.setSetting('openAtLogin', false));
    assert.equal(await ctx(app, () => global.__glassnote.loginItemActive()), false);
    assert.equal(reg(), null, 'kayıt kaldırılmalı');
  } finally {
    await ctx(app, () => global.__glassnote.setSetting('openAtLogin', false)).catch(() => {});
    await quit(app);
  }
});

test('yedek: dışa aktar, doğrula, birleştir/değiştir; bozuk dosya reddedilir', T, async () => {
  const dir = tmpDir();
  const { app, win } = await launch(dir);
  const file = path.join(dir, 'yedek.json');
  await ctx(app, (_e, f) => {
    const g = global.__glassnote;
    const c = g.store.categories.create({ name: 'Projeler', color: '#E8C547' });
    g.createNote({ title: 'Yedeklenecek', content: '<b>önemli</b>', category_id: c.id, tags: ['q4'] });
    return g.exportTo(f);
  }, file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(exported.notes.length, 1);
  assert.equal(exported.notes[0].title, 'Yedeklenecek');

  const inspected = await ctx(app, (_e, f) => global.__glassnote.inspectBackup(f), file);
  assert.equal(inspected.ok, true);
  await ctx(app, (_e, d) => global.__glassnote.importBackup(d, 'merge'), exported);
  assert.equal(await ctx(app, () => global.__glassnote.store.notes.list().length), 2);
  await win.waitForSelector('.card >> nth=1');

  const res = await ctx(app, (_e, d) => global.__glassnote.importBackup(d, 'replace'), exported);
  assert.ok(fs.existsSync(res.safetyBackup), 'güvenlik yedeği oluşturulmalı');
  assert.equal(await ctx(app, () => global.__glassnote.store.notes.list().length), 1);

  const bad = path.join(dir, 'bozuk.json');
  fs.writeFileSync(bad, '{ "format": "glassnote-backup", "notes": [ ');
  const r1 = await ctx(app, (_e, f) => global.__glassnote.inspectBackup(f), bad);
  assert.equal(r1.ok, false);
  fs.writeFileSync(bad, JSON.stringify({ format: 'glassnote-backup', version: 1, categories: [], notes: [{ title: 1 }] }));
  const r2 = await ctx(app, (_e, f) => global.__glassnote.inspectBackup(f), bad);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.length > 0);
  assert.equal(await ctx(app, () => global.__glassnote.store.notes.list().length), 1, 'bozuk dosya veriye dokunmamalı');
  await quit(app);
});

test('hatırlatma zamanında tetiklenir, tamamlandı olarak işaretlenir ve tekrar etmez', { timeout: 60_000 }, async () => {
  const { app } = await launch(tmpDir());
  const supported = await ctx(app, ({ Notification }) => Notification.isSupported());
  const id = await ctx(app, () => global.__glassnote.createNote({ title: 'Hatırlat' }).id);
  await ctx(app, (_e, nid) => global.__glassnote.updateNote(nid, { reminder_at: new Date(Date.now() + 2000).toISOString() }), id);
  await waitFor(() => ctx(app, (_e, nid) => global.__glassnote.store.notes.get(nid).reminder_done, id), 25_000, 500);
  assert.equal(await ctx(app, () => global.__glassnote.reminders.check()), 0, 'ikinci kez tetiklenmemeli');
  assert.equal(supported, true, 'Windows bildirimleri desteklenmeli');
  await quit(app);
});

test('güvenlik: zararlı HTML temizlenir, geçersiz IPC parametreleri reddedilir', T, async () => {
  const { app, win } = await launch(tmpDir());
  const id = await ctx(app, () => global.__glassnote.createNote({
    title: '<img src=x onerror="window.__xss=1">',
    content: '<img src=x onerror="window.__xss=2"><script>window.__xss=3</script><a href="javascript:window.__xss=4">tıkla</a><b onclick="x()">kalın</b><iframe src="https://example.com"></iframe>',
  }).id);
  await win.waitForSelector(`.card[data-id="${id}"]`);
  await win.click(`.card[data-id="${id}"]`);
  await win.waitForSelector('.rich b');
  await win.waitForTimeout(300);
  const html = await win.$eval('.rich', (el) => el.innerHTML);
  assert.ok(!/<img|<script|<iframe|onerror|onclick|javascript:/i.test(html), `temizlenmemiş içerik: ${html}`);
  assert.equal(await win.evaluate(() => window.__xss), undefined);
  assert.equal(await win.evaluate(() => typeof window.require), 'undefined', 'renderer Node erişimine sahip olmamalı');
  assert.equal(await win.evaluate(() => typeof window.process), 'undefined');
  const net = await win.evaluate(async () => { try { await fetch('https://example.com'); return 'izin verildi'; } catch { return 'engellendi'; } });
  assert.equal(net, 'engellendi', 'renderer dış ağa erişememeli');

  const errs = await win.evaluate(async () => {
    const out = [];
    for (const fn of [
      () => window.glassnote.notes.update(1, { evil: 1 }),
      () => window.glassnote.notes.update('1; DROP TABLE notes', { title: 'x' }),
      () => window.glassnote.settings.set('hack', true),
      () => window.glassnote.settings.set('theme', 'neon'),
      () => window.glassnote.categories.create({ name: '', color: '#000000' }),
      () => window.glassnote.app.openExternal('file:///C:/Windows/System32/calc.exe'),
      () => window.glassnote.widget.close(),
    ]) {
      try { await fn(); out.push('kabul edildi'); } catch (e) { out.push(e.message); }
    }
    return out;
  });
  assert.ok(errs.every((e) => e !== 'kabul edildi'), JSON.stringify(errs));
  assert.ok(await ctx(app, () => global.__glassnote.store.notes.list().length === 1));
  await quit(app);
});

test('biçimlendirme: kalın, numaralı liste, görev listesi ve bağlantı gerçekten kaydedilir', T, async () => {
  const { app, win } = await launch(tmpDir());
  await newNoteViaUi(win, 'Biçim', '');
  await win.click('.editor-toolbar [data-cmd="bold"]');
  await win.keyboard.type('kalın');
  await win.click('.editor-toolbar [data-cmd="bold"]');
  await win.keyboard.press('Enter');
  await win.click('.editor-toolbar [data-cmd="checklist"]');
  await win.keyboard.type('görev bir');
  await win.keyboard.press('Enter');
  await win.keyboard.type('görev iki');
  await win.keyboard.press('Enter');
  await win.keyboard.press('Enter'); // listeden çık
  await win.click('.editor-toolbar [data-cmd="numbers"]');
  await win.keyboard.type('madde');
  await win.keyboard.press('Enter');
  await win.keyboard.press('Enter');
  await win.click('.editor-toolbar [data-cmd="link"]');
  await win.fill('dialog input.input', 'ornek.com');
  await win.click('dialog button[type=submit]');
  // Görev listesindeki ilk maddeyi kutucuğundan işaretle.
  const box = await win.locator('.rich ul[data-type="checklist"] > li').first().boundingBox();
  await win.mouse.click(box.x + 6, box.y + box.height / 2);
  await win.waitForSelector('.editor-head .status.saved');
  await waitFor(async () => {
    const html = await ctx(app, () => global.__glassnote.store.notes.list()[0].content);
    return /<b>kalın<\/b>/.test(html) && /<ul data-type="checklist"><li data-checked="true">görev bir<\/li><li data-checked="false">görev iki<\/li><\/ul>/.test(html)
      && /<ol><li>madde<\/li><\/ol>/.test(html) && /<a href="https:\/\/ornek\.com\/">/.test(html);
  }).catch(async (e) => { throw new Error(`${e.message}: ${await ctx(app, () => global.__glassnote.store.notes.list()[0].content)}`); });
  await quit(app);
});

test('başlıklar: H1/H2/H3 düğmeleri, kısayollar ve widget döngüsü kaydedilir', T, async () => {
  const { app, win } = await launch(tmpDir());
  const content = () => ctx(app, () => global.__glassnote.store.notes.list()[0].content);
  await newNoteViaUi(win, 'Başlıklar', '');
  await win.click('.editor-toolbar [data-cmd="h1"]');
  await win.keyboard.type('Ana başlık');
  await win.keyboard.press('Enter');
  await win.keyboard.type('Alt başlık');
  await win.keyboard.press('Control+Alt+Digit2');
  await win.keyboard.press('End');
  await win.keyboard.press('Enter');
  await win.keyboard.type('normal satır');
  await win.waitForSelector('.editor-toolbar [data-cmd="h1"][aria-pressed="false"]');
  await waitFor(async () => /<h1>Ana başlık<\/h1><h2>Alt başlık<\/h2><div>normal satır<\/div>/.test(await content()))
    .catch(async (e) => { throw new Error(`${e.message}: ${await content()}`); });

  // Aynı başlığa tekrar basmak satırı normal metne döndürür.
  await win.click('.rich h2');
  await win.click('.editor-toolbar [data-cmd="h2"]');
  await waitFor(async () => !/<h2>/.test(await content()));

  // Yapıştırılan H4 başlığı H3 olarak korunur; betik temizlenir.
  await win.click('.rich div:last-child');
  await win.keyboard.press('End');
  await win.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h4>Yapıştırılan</h4><script>window.__x=1</script>');
    document.querySelector('.rich').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await waitFor(async () => /<h3>Yapıştırılan<\/h3>/.test(await content()));
  assert.ok(!/script/.test(await content()));

  // Widget: tek "H" düğmesi H1 → H2 → H3 → normal döngüsü yapar.
  const id = await ctx(app, () => global.__glassnote.createNote({ title: 'W', content: '<div>satır</div>' }).id);
  await ctx(app, (_e, nid) => global.__glassnote.widgets.open(nid), id);
  const w = await pageFor(app, `widget.html?id=${id}`);
  await w.waitForSelector('.w-title');
  assert.equal(await w.locator('.w-toolbar [data-cmd="h1"]').count(), 0, 'widget kompakt araç çubuğu kullanmalı');
  await w.click('.rich div');
  const widgetHtml = () => ctx(app, (_e, nid) => global.__glassnote.store.notes.get(nid).content, id);
  for (const tag of ['h1', 'h2', 'h3']) {
    await w.click('.w-toolbar [data-cmd="heading"]');
    await waitFor(async () => (await widgetHtml()).startsWith(`<${tag}>satır`));
  }
  await w.click('.w-toolbar [data-cmd="heading"]');
  await waitFor(async () => (await widgetHtml()).startsWith('<div>satır'));
  await quit(app);
});

test('Windows ile başlatıldığında "tepside başlat" tercihi ana pencereyi açmaz', T, async () => {
  const ud = tmpDir();
  let { app } = await launch(ud);
  await ctx(app, () => global.__glassnote.setSetting('startupMode', 'tray'));
  await quit(app);
  ({ app } = await launch(ud, ['--autostart']));
  await waitFor(() => ctx(app, () => !!global.__glassnote?.tray));
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(await ctx(app, () => global.__glassnote.mainWindow), null, 'ana pencere oluşturulmamalı');
  await ctx(app, () => global.__glassnote.tray.trigger('open'));
  await pageFor(app, 'index.html');
  await quit(app);
  // Kullanıcı uygulamayı kendisi açtığında (autostart yok) pencere her zaman açılır.
  ({ app } = await launch(ud));
  assert.ok(await ctx(app, () => global.__glassnote.mainWindow.isVisible()));
  await quit(app);
});

test('tema: koyu/açık tercih gerçekten uygulanır ve kalıcıdır', T, async () => {
  const ud = tmpDir();
  let { app, win } = await launch(ud);
  await ctx(app, () => global.__glassnote.setSetting('theme', 'dark'));
  await win.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const bg = await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  assert.equal(bg, '#0f1117');
  await quit(app);
  ({ app, win } = await launch(ud));
  assert.equal(await win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), true);
  await ctx(app, () => global.__glassnote.setSetting('theme', 'light'));
  await win.waitForFunction(() => matchMedia('(prefers-color-scheme: light)').matches);
  await quit(app);
});
