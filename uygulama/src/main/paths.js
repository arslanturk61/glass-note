'use strict';

const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || null;

// İkonlar asar dışına açılır; Windows (tepsi/bildirim) gerçek dosya yolu ister.
const resourcesDir = path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'resources');
const rendererDir = path.join(app.getAppPath(), 'dist', 'renderer');
const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');

// backgroundMaterial (akrilik) Windows 11 22H2 (build 22621) ve sonrasında desteklenir.
const supportsGlass = process.platform === 'win32' && Number(os.release().split('.')[2] || 0) >= 22621;

function pageUrl(page) {
  return devServerUrl ? new URL(`${page}.html`, devServerUrl).href : null;
}

function loadPage(win, page, query = {}) {
  const url = pageUrl(page);
  if (url) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
    return win.loadURL(u.href);
  }
  return win.loadFile(path.join(rendererDir, `${page}.html`), { query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) });
}

// Renderer'ın yüklenmesine izin verilen tek kaynak: uygulamanın kendi sayfaları.
function isAppUrl(raw) {
  try {
    const u = new URL(raw);
    if (devServerUrl) return u.origin === new URL(devServerUrl).origin;
    if (u.protocol !== 'file:') return false;
    const p = path.normalize(decodeURIComponent(u.pathname).replace(/^\/([a-zA-Z]:)/, '$1'));
    return p.toLowerCase().startsWith(rendererDir.toLowerCase());
  } catch {
    return false;
  }
}

module.exports = { isDev, devServerUrl, resourcesDir, preloadPath, supportsGlass, loadPage, isAppUrl };
