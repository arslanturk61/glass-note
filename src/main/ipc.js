'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron');
const { isAppUrl, supportsGlass, isDev } = require('./paths');
const { APP_NAME, LIMITS, NOTE_PALETTE } = require('../shared/constants');
const v = require('../shared/validate');

function registerIpc(ctx) {
  const { store } = ctx;
  const pendingImports = new Map(); // token -> doğrulanmış yedek verisi

  function assertSender(e) {
    if (!e.senderFrame || !isAppUrl(e.senderFrame.url)) throw new Error('Yetkisiz istek kaynağı');
  }

  function handle(channel, fn) {
    ipcMain.handle(channel, (e, ...args) => {
      assertSender(e);
      return fn(e, ...args);
    });
  }

  // Bir widget penceresinden gelen isteğin hangi nota ait olduğu gönderenden
  // çıkarılır; renderer'ın iddia ettiği kimliğe güvenilmez.
  function widgetNote(e) {
    const id = ctx.widgets.noteIdFor(e.sender);
    if (!id) throw new Error('Bu istek yalnızca widget penceresinden yapılabilir');
    return id;
  }

  // ------------------------------------------------------------------ notes
  handle('notes:list', () => store.notes.list());
  handle('notes:get', (e, id) => store.notes.get(v.id(id)));
  handle('notes:create', (e, input) => ctx.createNote(input ?? {}, e.sender.id));
  handle('notes:update', (e, id, patch) => ctx.updateNote(id, patch, e.sender.id));
  handle('notes:trash', (e, id) => ctx.trashNote(id));
  handle('notes:restore', (e, id) => ctx.restoreNote(id));
  handle('notes:destroy', (e, id) => ctx.destroyNote(id));
  handle('notes:emptyTrash', () => ctx.emptyTrash());
  handle('notes:discardIfEmpty', (e, id) => ctx.discardIfEmpty(id));

  // Pencere kapanırken (beforeunload) kaydedilmemiş içeriği eşzamanlı yazar.
  ipcMain.on('notes:update-sync', (e, id, patch) => {
    try {
      assertSender(e);
      ctx.updateNote(id, patch, e.sender.id);
      e.returnValue = { ok: true };
    } catch (err) {
      e.returnValue = { ok: false, error: err.message };
    }
  });

  // ------------------------------------------------------------- categories
  handle('categories:list', () => store.categories.list());
  handle('categories:create', (e, input) => ctx.categoriesMutated(() => store.categories.create(input ?? {})));
  handle('categories:update', (e, id, patch) => ctx.categoriesMutated(() => store.categories.update(id, patch)));
  handle('categories:reorder', (e, ids) => ctx.categoriesMutated(() => store.categories.reorder(ids)));
  handle('categories:remove', (e, id, mode, targetId) => ctx.removeCategory(id, mode, targetId ?? null));

  // --------------------------------------------------------------- settings
  handle('settings:get', () => store.settings.all());
  handle('settings:set', (e, key, value) => ctx.setSetting(key, value));

  // ---------------------------------------------------------------- widgets
  handle('widgets:open', (e, id) => { ctx.widgets.open(v.id(id)); return ctx.widgets.openIds(); });
  handle('widgets:close', (e, id) => { ctx.widgets.close(v.id(id)); return true; });
  handle('widgets:openIds', () => ctx.widgets.openIds());

  handle('widget:init', (e) => {
    const noteId = widgetNote(e);
    return { noteId, state: store.widgets.get(noteId), glassSupported: supportsGlass };
  });
  handle('widget:menu', (e) => ctx.widgets.popupMenu(widgetNote(e), BrowserWindow.fromWebContents(e.sender)));
  handle('widget:close', (e) => ctx.widgets.close(widgetNote(e)));
  handle('widget:setAlwaysOnTop', (e, flag) => ctx.widgets.setAlwaysOnTop(widgetNote(e), v.bool(flag, 'alwaysOnTop')));

  // -------------------------------------------------------------------- app
  handle('app:info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    dbPath: store.path,
    dataDir: app.getPath('userData'),
    schemaVersion: store.schemaVersion,
    supportsGlass,
    isDev,
    palette: NOTE_PALETTE,
    openAtLoginActual: ctx.loginItemActive(),
  }));

  handle('app:updateStatus', () => ctx.updater.status());
  handle('app:checkUpdates', () => ctx.updater.check());
  handle('app:installUpdate', () => ctx.updater.install());

  handle('app:showMain', (e, opts) => {
    const noteId = opts?.noteId == null ? null : v.id(opts.noteId);
    ctx.showMain({ noteId });
  });

  handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));

  handle('app:openExternal', async (e, url) => {
    let u;
    try { u = new URL(String(url)); } catch { throw new Error('Geçersiz bağlantı'); }
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) throw new Error('Bu bağlantı türü açılamaz');
    const win = BrowserWindow.fromWebContents(e.sender);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Aç', 'Vazgeç'],
      defaultId: 0,
      cancelId: 1,
      title: 'Bağlantıyı aç',
      message: 'Bu bağlantı varsayılan tarayıcınızda açılsın mı?',
      detail: u.href.slice(0, 500),
    });
    if (response === 0) await shell.openExternal(u.href);
    return response === 0;
  });

  handle('app:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Yedeği dışa aktar',
      defaultPath: path.join(app.getPath('documents'), `${APP_NAME}-yedek-${stamp}.json`),
      filters: [{ name: 'JSON yedeği', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    return { canceled: false, ...ctx.exportTo(filePath) };
  });

  handle('app:pickImport', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Yedekten içe aktar',
      properties: ['openFile'],
      filters: [{ name: 'JSON yedeği', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return { canceled: true };
    return ctx.inspectBackup(filePaths[0]);
  });

  handle('app:import', (e, token, mode) => {
    const data = pendingImports.get(token);
    if (!data) throw new Error('İçe aktarma oturumu bulunamadı. Lütfen dosyayı yeniden seçin.');
    pendingImports.delete(token);
    return ctx.importBackup(data, mode);
  });

  ctx.registerPendingImport = (data) => {
    const token = crypto.randomUUID();
    pendingImports.clear();
    pendingImports.set(token, data);
    return token;
  };
}

// Yedek dosyasını okur, ayrıştırır ve doğrular; hiçbir veriyi değiştirmez.
function readBackupFile(filePath) {
  const st = fs.statSync(filePath);
  if (st.size > LIMITS.backupBytes) return { ok: false, errors: ['Dosya çok büyük (en fazla 100 MB).'] };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, errors: ['Dosya geçerli bir JSON değil veya bozuk.'] };
  }
  return { ok: true, data };
}

module.exports = { registerIpc, readBackupFile };
