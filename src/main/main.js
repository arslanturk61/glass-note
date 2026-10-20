'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, nativeTheme, Menu, screen, session, dialog } = require('electron');
const { APP_NAME, APP_ID } = require('../shared/constants');

// Kullanıcı veri dizini 'ready' öncesinde belirlenmelidir.
if (process.env.GLASSNOTE_USER_DATA) app.setPath('userData', process.env.GLASSNOTE_USER_DATA);
else if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), `${APP_NAME} Dev`));

const { isDev, isAppUrl, supportsGlass } = require('./paths');
const { openStore } = require('./db');
const { createMainWindow, createWidgetManager, ensureVisible, placeWindow, sameRect, overlayColors, solidBg } = require('./windows');
const { registerIpc, readBackupFile } = require('./ipc');
const { createTray } = require('./tray');
const { startReminders } = require('./reminders');

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

function bootstrap() {
  const ctx = {
    store: null,
    mainWindow: null,
    widgets: null,
    tray: null,
    reminders: null,
    isQuitting: false,
  };

  // -------------------------------------------------------------- helpers
  ctx.broadcast = (channel, payload) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    }
  };

  ctx.notesChanged = ({ notes = [], removed = [] }, source = null) => {
    ctx.broadcast('notes:changed', { notes, removed, source });
  };

  const loginItemOptions = () => ({
    name: isDev ? `${APP_NAME} Dev` : APP_NAME,
    path: process.execPath,
    args: isDev ? [app.getAppPath(), '--autostart'] : ['--autostart'],
  });
  // Not: getLoginItemSettings().openAtLogin, "--" ile başlayan argümanları geri
  // okurken düşürdüğü için güvenilir değil; kayıt girdisi ad + yol ile doğrulanır.
  // Kullanıcı Windows "Başlangıç uygulamaları"ndan kapatırsa enabled=false olur.
  ctx.loginItemActive = () => {
    const o = loginItemOptions();
    const item = app.getLoginItemSettings(o).launchItems?.find((i) => i.name === o.name);
    return !!item && item.enabled && item.path.toLowerCase() === o.path.toLowerCase();
  };
  function applyLoginItem(flag) {
    app.setLoginItemSettings({ openAtLogin: flag, ...loginItemOptions() });
    return ctx.loginItemActive() === flag;
  }

  ctx.showMain = ({ noteId = null, newNote = false, settings = false } = {}) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow = createMainWindow(ctx);
      ctx.mainWindow.once('ready-to-show', () => ctx.mainWindow.show());
    } else {
      if (ctx.mainWindow.isMinimized()) ctx.mainWindow.restore();
      ctx.mainWindow.show();
      ctx.mainWindow.focus();
    }
    const wc = ctx.mainWindow.webContents;
    const send = () => {
      if (noteId) wc.send('app:open-note', noteId);
      if (newNote) wc.send('app:new-note');
      if (settings) wc.send('app:show-settings');
    };
    if (wc.isLoading()) wc.once('did-finish-load', send);
    else send();
  };

  ctx.quit = () => {
    ctx.isQuitting = true;
    ctx.widgets?.beginQuit();
    app.quit();
  };

  ctx.onHiddenToTray = () => {
    const s = ctx.store.settings.all();
    if (!s.trayHintShown) {
      ctx.tray?.balloon(APP_NAME, `${APP_NAME} sistem tepsisinde çalışmaya devam ediyor. Tamamen çıkmak için tepsi menüsünden "Uygulamadan çık"ı seçin.`);
      ctx.store.settings.set('trayHintShown', true);
    }
  };

  ctx.onWidgetsChanged = () => ctx.tray?.rebuild();

  function updateMainMaterial() {
    const w = ctx.mainWindow;
    if (!w || w.isDestroyed()) return;
    const glass = supportsGlass && ctx.store.settings.all().glassIntensity > 0;
    w.setBackgroundMaterial(glass ? 'acrylic' : 'none');
    w.setBackgroundColor(glass ? '#00000000' : solidBg());
    w.setTitleBarOverlay(overlayColors());
  }

  // -------------------------------------------------------------- services
  ctx.createNote = (input, source) => {
    const s = ctx.store.settings.all();
    const data = { ...input };
    if (data.color === undefined && s.defaultNoteColor) data.color = s.defaultNoteColor;
    const n = ctx.store.notes.create(data);
    ctx.notesChanged({ notes: [n] }, source);
    return n;
  };

  ctx.updateNote = (id, patch, source) => {
    const n = ctx.store.notes.update(id, patch);
    ctx.notesChanged({ notes: [n] }, source);
    if (patch && 'title' in patch) ctx.widgets.noteTitleChanged(n);
    if (patch && 'reminder_at' in patch) ctx.reminders?.check();
    return n;
  };

  ctx.trashNote = (id) => {
    const n = ctx.store.notes.trash(id);
    if (!n) throw new Error('Not bulunamadı');
    ctx.widgets.close(id);
    ctx.notesChanged({ notes: [n] });
    return n;
  };

  ctx.restoreNote = (id) => {
    const n = ctx.store.notes.restore(id);
    if (!n) throw new Error('Not bulunamadı');
    ctx.notesChanged({ notes: [n] });
    return n;
  };

  ctx.destroyNote = (id) => {
    const ok = ctx.store.notes.destroy(id);
    if (ok) ctx.notesChanged({ removed: [id] });
    return ok;
  };

  ctx.emptyTrash = () => {
    const removed = ctx.store.notes.emptyTrash();
    ctx.notesChanged({ removed });
    return removed.length;
  };

  ctx.discardIfEmpty = (id) => {
    const removed = ctx.store.notes.discardIfEmpty(id);
    if (removed) {
      ctx.widgets.close(id);
      ctx.notesChanged({ removed: [id] });
    }
    return removed;
  };

  ctx.categoriesMutated = (fn) => {
    const result = fn();
    ctx.broadcast('categories:changed', ctx.store.categories.list());
    return result;
  };

  ctx.removeCategory = (id, mode, targetId) => {
    const affected = ctx.store.categories.remove(id, mode, targetId);
    ctx.broadcast('categories:changed', ctx.store.categories.list());
    const notes = affected.map((nid) => ctx.store.notes.get(nid)).filter(Boolean);
    if (mode === 'trash') notes.forEach((n) => ctx.widgets.close(n.id));
    ctx.notesChanged({ notes });
    return affected.length;
  };

  ctx.setSetting = (key, value) => {
    if (key === 'openAtLogin') {
      if (typeof value !== 'boolean') throw new Error('Geçersiz değer: openAtLogin');
      if (!applyLoginItem(value)) {
        throw new Error('Windows başlangıç ayarı uygulanamadı. Windows Ayarlar > Uygulamalar > Başlangıç bölümünden izinleri kontrol edin.');
      }
    }
    const val = ctx.store.settings.set(key, value);
    if (key === 'theme') nativeTheme.themeSource = val;
    if (key === 'glassIntensity') updateMainMaterial();
    if (key !== 'lastView' && key !== 'mainWindowBounds') ctx.broadcast('settings:changed', ctx.store.settings.all());
    return val;
  };

  ctx.exportTo = (filePath) => {
    const data = ctx.store.exportData();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return { filePath, notes: data.notes.length, categories: data.categories.length };
  };

  ctx.inspectBackup = (filePath) => {
    const read = readBackupFile(filePath);
    if (!read.ok) return { canceled: false, ok: false, errors: read.errors, fileName: path.basename(filePath) };
    const check = ctx.store.validateBackup(read.data);
    if (!check.ok) return { canceled: false, ok: false, errors: check.errors, fileName: path.basename(filePath) };
    return { canceled: false, ok: true, summary: check.summary, fileName: path.basename(filePath), token: ctx.registerPendingImport(read.data) };
  };

  ctx.importBackup = (data, mode) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safety = path.join(app.getPath('userData'), 'backups', `ice-aktarma-oncesi-${stamp}.db`);
    if (mode === 'replace') {
      for (const id of ctx.widgets.openIds()) ctx.widgets.close(id);
    }
    const result = ctx.store.importData(data, mode, mode === 'replace' ? safety : null);
    nativeTheme.themeSource = ctx.store.settings.all().theme;
    ctx.broadcast('categories:changed', ctx.store.categories.list());
    ctx.broadcast('settings:changed', ctx.store.settings.all());
    ctx.broadcast('notes:reload');
    return { ...result, safetyBackup: mode === 'replace' ? safety : null };
  };

  // -------------------------------------------------------------- lifecycle
  app.on('second-instance', () => ctx.showMain());

  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e, url) => { if (!isAppUrl(url)) e.preventDefault(); });
    wc.on('will-attach-webview', (e) => e.preventDefault());
    if (isDev) {
      wc.on('before-input-event', (_ev, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools();
      });
    }
  });

  app.on('before-quit', () => {
    ctx.isQuitting = true;
    ctx.widgets?.beginQuit();
  });

  // Tepsi modunda tüm pencereler kapansa bile uygulama çalışmaya devam eder.
  app.on('window-all-closed', () => {
    if (ctx.isQuitting) app.quit();
  });

  app.on('will-quit', () => {
    ctx.reminders?.stop();
    ctx.tray?.destroy();
    try { ctx.store?.close(); } catch { /* yoksay */ }
  });

  app.whenReady().then(() => {
    try {
      ctx.store = openStore(path.join(app.getPath('userData'), 'glassnote.db'));
    } catch (err) {
      dialog.showErrorBox(`${APP_NAME} başlatılamadı`, `Veritabanı açılamadı:\n${err.message}`);
      app.exit(1);
      return;
    }

    Menu.setApplicationMenu(null);
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    // Ağ kilidi: uygulama yalnızca kendi yerel dosyalarını (ve geliştirmede Vite
    // sunucusunu) yükleyebilir. Notlar hiçbir koşulda dışarı gönderilmez.
    const devOrigin = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL) : null;
    ses.webRequest.onBeforeRequest((details, cb) => {
      const u = new URL(details.url);
      const local = ['file:', 'data:', 'devtools:', 'chrome-extension:'].includes(u.protocol)
        || (devOrigin && u.host === devOrigin.host && ['http:', 'ws:'].includes(u.protocol));
      cb({ cancel: !local });
    });

    // Yazım denetimi Windows'un yerel denetleyicisiyle; sözlük indirilmez.
    ses.setSpellCheckerDictionaryDownloadURL('file:///');
    const langs = ['tr', 'tr-TR', 'en-US'].filter((l) => ses.availableSpellCheckerLanguages.includes(l));
    if (langs.length) ses.setSpellCheckerLanguages(langs);

    const s = ctx.store.settings.all();
    nativeTheme.themeSource = s.theme;
    ctx.widgets = createWidgetManager(ctx);
    registerIpc(ctx);
    ctx.tray = createTray(ctx);

    // Kurulum yolu güncellemeyle değişmiş olabilir: tercihi yeniden uygula.
    if (s.openAtLogin && app.isPackaged) applyLoginItem(true);

    const autostart = process.argv.includes('--autostart');
    if (!(autostart && s.startupMode === 'tray')) ctx.showMain();
    if (s.restoreWidgets) ctx.widgets.restore();

    ctx.reminders = startReminders(ctx);

    let t;
    const recheck = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        ctx.widgets.recheckBounds();
        const w = ctx.mainWindow;
        if (w && !w.isDestroyed() && !w.isMaximized()) {
          const b = w.getContentBounds();
          const nb = ensureVisible(b, 720, 480);
          if (!sameRect(nb, b)) placeWindow(w, nb);
        }
      }, 500);
    };
    screen.on('display-removed', recheck);
    screen.on('display-metrics-changed', recheck);

    nativeTheme.on('updated', () => {
      updateMainMaterial();
      ctx.widgets.refreshLook();
    });

    if (process.env.GLASSNOTE_TEST === '1') global.__glassnote = ctx;
  });
}
