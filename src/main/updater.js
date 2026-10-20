'use strict';

const path = require('node:path');
const { app, Notification } = require('electron');
const { resourcesDir } = require('./paths');
const { APP_NAME } = require('../shared/constants');

const FIRST_CHECK_DELAY = 20_000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

// GitHub Releases üzerinden otomatik güncelleme. Yalnızca sürüm bilgisi ve kurulum
// dosyası indirilir (electron-updater'ın kendi oturumuyla); notlar hiçbir zaman gönderilmez.
function createUpdater(ctx) {
  let status = { state: 'idle' };
  let timer = null;
  let first = null;
  let notified = null;

  const set = (s) => {
    status = { ...s, at: new Date().toISOString() };
    ctx.broadcast('app:update-status', status);
  };

  if (!app.isPackaged) {
    status = { state: 'unsupported', message: 'Geliştirme modunda güncelleme denetlenmez.' };
    return { status: () => status, check: async () => status, install: () => {}, setEnabled: () => {}, stop: () => {} };
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    set({ state: 'ready', version: i.version });
    if (notified !== i.version && Notification.isSupported()) {
      notified = i.version;
      const n = new Notification({
        title: `${APP_NAME} ${i.version} hazır`,
        body: 'Güncelleme indirildi. Uygulamadan çıktığınızda veya yeniden başlattığınızda kurulacak.',
        icon: path.join(resourcesDir, 'icon.png'),
      });
      n.on('click', () => ctx.showMain({ settings: true }));
      n.show();
    }
  });
  autoUpdater.on('error', (e) => {
    const msg = String(e?.message ?? e);
    const friendly = /latest\.yml|404|HttpError: 4/i.test(msg)
      ? 'Yayımlanmış güncelleme bilgisi bulunamadı.'
      : /net::|ENOTFOUND|ETIMEDOUT|ECONN/i.test(msg)
        ? 'Güncelleme sunucusuna ulaşılamadı (internet bağlantısı yok olabilir).'
        : 'Güncelleme denetlenemedi.';
    set({ state: 'error', message: friendly });
  });

  async function check() {
    if (['checking', 'downloading', 'ready'].includes(status.state)) return status;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // 'error' olayı durumu zaten günceller
    }
    return status;
  }

  function setEnabled(on) {
    clearTimeout(first);
    clearInterval(timer);
    timer = null;
    if (!on) {
      if (status.state !== 'ready') set({ state: 'disabled' });
      return;
    }
    if (status.state === 'disabled') set({ state: 'idle' });
    first = setTimeout(check, FIRST_CHECK_DELAY);
    timer = setInterval(check, CHECK_INTERVAL);
  }

  setEnabled(ctx.store.settings.all().autoUpdate);

  return {
    status: () => status,
    check,
    setEnabled,
    install() {
      if (status.state !== 'ready') return;
      ctx.isQuitting = true;
      ctx.widgets?.beginQuit();
      // Sessiz kurulum, ardından uygulamayı yeniden başlat.
      autoUpdater.quitAndInstall(true, true);
    },
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}

module.exports = { createUpdater };
