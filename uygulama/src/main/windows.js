'use strict';

const { BrowserWindow, screen, nativeTheme, Menu } = require('electron');
const path = require('node:path');
const { preloadPath, supportsGlass, loadPage, resourcesDir } = require('./paths');
const { NOTE_PALETTE, APP_NAME } = require('../shared/constants');
const desktopLayer = require('./desktop-layer');

const ICON = path.join(resourcesDir, 'icon.ico');
const HEADER_GRAB = 36; // widget başlık şeridinin yüksekliği (px)

function webPreferences() {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: true,
    backgroundThrottling: true,
  };
}

const isDark = () => nativeTheme.shouldUseDarkColors;
const solidBg = () => (isDark() ? '#0F1117' : '#F4F6FA');

function overlayColors() {
  return isDark()
    ? { color: '#00000000', symbolColor: '#F5F7FB', height: 52 }
    : { color: '#00000000', symbolColor: '#1A1F2B', height: 52 };
}

// Kaydedilmiş bir dikdörtgenin mevcut ekranlarda yakalanabilir olup olmadığını
// kontrol eder; değilse en yakın ekranın çalışma alanına taşır.
function ensureVisible(b, minW = 200, minH = 140) {
  const displays = screen.getAllDisplays();
  const grabbable = displays.some(({ workArea: wa }) => {
    const ix = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x);
    const iy = Math.min(b.y + HEADER_GRAB, wa.y + wa.height) - Math.max(b.y, wa.y);
    return ix >= 80 && iy >= 20;
  });
  if (grabbable) return b;
  const wa = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y) }).workArea;
  const width = Math.max(minW, Math.min(b.width, wa.width));
  const height = Math.max(minH, Math.min(b.height, wa.height));
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(b.x, wa.x), wa.x + wa.width - width)),
    y: Math.round(Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height)),
  };
}

// Kesirli ekran ölçeklemesinde (ör. %125) Electron'un çerçeve dönüşümü birkaç
// piksel kayabiliyor; her yeniden başlatmada pencere büyümesin diye içerik
// sınırları hedefe ulaşana kadar farkı telafi ederek uygulanır.
function placeWindow(win, target) {
  let req = { ...target };
  let got = win.getContentBounds();
  for (let i = 0; i < 4; i++) {
    win.setContentBounds(req);
    got = win.getContentBounds();
    const d = ['x', 'y', 'width', 'height'].map((k) => got[k] - target[k]);
    if (d.every((v) => v === 0)) break;
    req = { x: req.x - d[0], y: req.y - d[1], width: req.width - d[2], height: req.height - d[3] };
  }
  return got;
}

const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = () => { clearTimeout(t); fn(); };
  return d;
}

// ------------------------------------------------------------- main window
function createMainWindow(ctx) {
  const s = ctx.store.settings.all();
  const saved = s.mainWindowBounds;
  const glass = supportsGlass && s.glassIntensity > 0;

  const win = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(),
    backgroundMaterial: glass ? 'acrylic' : 'none',
    backgroundColor: glass ? '#00000000' : solidBg(),
    webPreferences: webPreferences(),
  });
  if (saved) placeWindow(win, ensureVisible(saved, 720, 480));
  else win.center();
  if (saved?.maximized) win.maximize();

  // Ekranı kaplamış/simge durumundaki pencere için son "normal" sınırlar saklanır.
  let normal = saved && !win.isMaximized() ? win.getContentBounds() : saved;
  const saveBounds = debounce(() => {
    if (win.isDestroyed()) return;
    if (!win.isMaximized() && !win.isMinimized()) normal = win.getContentBounds();
    if (!normal) return;
    ctx.store.settings.set('mainWindowBounds', { x: normal.x, y: normal.y, width: normal.width, height: normal.height, maximized: win.isMaximized() });
  }, 500);
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('close', (e) => {
    saveBounds.flush();
    if (ctx.isQuitting) return;
    if (ctx.store.settings.all().closeToTray) {
      e.preventDefault();
      win.webContents.send('app:flush');
      win.hide();
      ctx.onHiddenToTray();
    } else {
      // Pencereyi kapatmak = uygulamadan çıkmak (tepsi ayarı kapalı).
      e.preventDefault();
      ctx.quit();
    }
  });

  loadPage(win, 'index');
  return win;
}

// ---------------------------------------------------------------- widgets
function createWidgetManager(ctx) {
  const wins = new Map(); // noteId -> BrowserWindow
  const byContents = new Map(); // webContents.id -> noteId
  const detachers = new Map(); // noteId -> masaüstü katmanından çıkarma fonksiyonu
  let quitting = false;

  const openIds = () => [...wins.keys()];
  const changed = () => {
    ctx.broadcast('widgets:changed', openIds());
    ctx.onWidgetsChanged?.();
  };

  function placeDefault(width, height) {
    const wa = screen.getPrimaryDisplay().workArea;
    const k = wins.size % 8;
    return ensureVisible({ width, height, x: wa.x + wa.width - width - 40 - k * 28, y: wa.y + 40 + k * 28 });
  }

  function applyLook(win, st) {
    const glass = supportsGlass && st.glass;
    win.setBackgroundMaterial(glass ? 'acrylic' : 'none');
    win.setBackgroundColor(glass ? '#00000000' : solidBg());
    win.setOpacity(st.opacity);
  }

  function sendState(noteId) {
    const win = wins.get(noteId);
    const st = ctx.store.widgets.get(noteId);
    if (win && st) win.webContents.send('widget:state', { ...st, glassSupported: supportsGlass, desktopSupported: desktopLayer.isSupported() });
  }

  function open(noteId, { focus = true } = {}) {
    const existing = wins.get(noteId);
    if (existing) {
      if (!existing.isVisible()) existing.showInactive();
      if (focus) existing.focus();
      return;
    }
    const note = ctx.store.notes.get(noteId);
    if (!note || note.deleted_at) throw new Error('Not bulunamadı');
    const s = ctx.store.settings.all();
    const prev = ctx.store.widgets.get(noteId);
    const st = prev ?? { x: null, y: null, width: s.widgetWidth, height: s.widgetHeight, always_on_top: s.widgetAlwaysOnTop, desktop_pinned: false, opacity: 1, glass: true };
    const b = st.x == null || st.y == null
      ? placeDefault(st.width, st.height)
      : ensureVisible({ x: st.x, y: st.y, width: st.width, height: st.height });
    const glass = supportsGlass && st.glass;

    const win = new BrowserWindow({
      width: b.width,
      height: b.height,
      minWidth: 200,
      minHeight: 140,
      show: false,
      title: note.title || 'Not',
      icon: ICON,
      titleBarStyle: 'hidden',
      backgroundMaterial: glass ? 'acrylic' : 'none',
      backgroundColor: glass ? '#00000000' : solidBg(),
      skipTaskbar: true,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: st.always_on_top && !st.desktop_pinned,
      webPreferences: webPreferences(),
    });
    if (st.opacity < 1) win.setOpacity(st.opacity);
    const placed = placeWindow(win, b);

    wins.set(noteId, win);
    byContents.set(win.webContents.id, noteId);
    ctx.store.widgets.save(noteId, { ...st, ...placed, is_open: true });

    const saveBounds = debounce(() => {
      if (win.isDestroyed()) return;
      const nb = win.getContentBounds();
      ctx.store.widgets.save(noteId, { x: nb.x, y: nb.y, width: nb.width, height: nb.height });
    }, 400);
    win.on('move', saveBounds);
    win.on('resize', saveBounds);

    // Pencerenin gerçek "üstte" durumu dışarıdan değişirse kayıt ve arayüz eşitlenir.
    win.on('always-on-top-changed', (_e, flag) => {
      const cur = ctx.store.widgets.get(noteId);
      if (cur && cur.always_on_top !== flag) {
        ctx.store.widgets.save(noteId, { always_on_top: flag });
        sendState(noteId);
      }
    });

    const wcId = win.webContents.id;
    win.on('close', () => saveBounds.flush());
    if (st.desktop_pinned) {
      const detach = desktopLayer.attach(win);
      if (detach) detachers.set(noteId, detach);
    }
    win.on('closed', () => {
      detachers.delete(noteId);
      wins.delete(noteId);
      byContents.delete(wcId);
      // Uygulamadan çıkarken widget'lar "açık" olarak kalır ki geri yüklenebilsin.
      if (!quitting && ctx.store.notes.get(noteId)) ctx.store.widgets.save(noteId, { is_open: false });
      if (!quitting) changed();
    });
    win.once('ready-to-show', () => {
      if (focus) win.show();
      else win.showInactive();
    });
    loadPage(win, 'widget', { id: noteId });
    changed();
  }

  function close(noteId) {
    const win = wins.get(noteId);
    if (win) {
      win.webContents.send('app:flush');
      win.close();
    }
  }

  // layer: 'normal' | 'top' (her zaman üstte) | 'desktop' (masaüstüne sabitli)
  function setLayer(noteId, layer) {
    if (layer === 'desktop' && !desktopLayer.isSupported()) throw new Error('Masaüstüne sabitleme bu sistemde desteklenmiyor');
    const win = wins.get(noteId);
    ctx.store.widgets.save(noteId, { always_on_top: layer === 'top', desktop_pinned: layer === 'desktop' });
    if (win) {
      if (layer !== 'desktop' && detachers.has(noteId)) {
        detachers.get(noteId)();
        detachers.delete(noteId);
      }
      win.setAlwaysOnTop(layer === 'top');
      if (layer === 'desktop' && !detachers.has(noteId)) {
        const detach = desktopLayer.attach(win);
        if (detach) detachers.set(noteId, detach);
      }
    }
    sendState(noteId);
  }

  const setAlwaysOnTop = (noteId, flag) => setLayer(noteId, flag ? 'top' : 'normal');

  function setLook(noteId, patch) {
    const st = ctx.store.widgets.save(noteId, patch);
    const win = wins.get(noteId);
    if (win) applyLook(win, st);
    sendState(noteId);
  }

  function popupMenu(noteId, win) {
    const note = ctx.store.notes.get(noteId);
    const st = ctx.store.widgets.get(noteId);
    if (!note || !st) return;
    const cats = ctx.store.categories.list();
    const update = (patch) => ctx.updateNote(noteId, patch, null);
    const layer = st.desktop_pinned ? 'desktop' : st.always_on_top ? 'top' : 'normal';
    const menu = Menu.buildFromTemplate([
      { label: 'Normal pencere', type: 'radio', checked: layer === 'normal', click: () => setLayer(noteId, 'normal') },
      { label: 'Her zaman üstte', type: 'radio', checked: layer === 'top', click: () => setLayer(noteId, 'top') },
      {
        label: 'Masaüstüne sabitle (pencerelerin arkasında)', type: 'radio', checked: layer === 'desktop',
        enabled: desktopLayer.isSupported(), click: () => setLayer(noteId, 'desktop'),
      },
      { type: 'separator' },
      {
        label: 'Renk',
        submenu: [
          { label: 'Kategori rengi (otomatik)', type: 'radio', checked: note.color === null, click: () => update({ color: null }) },
          { type: 'separator' },
          ...NOTE_PALETTE.map((c) => ({ label: `${c.name}  ${c.hex}`, type: 'radio', checked: note.color === c.hex, click: () => update({ color: c.hex }) })),
          ...(note.color && !NOTE_PALETTE.some((c) => c.hex === note.color)
            ? [{ label: `Özel  ${note.color}`, type: 'radio', checked: true }] : []),
        ],
      },
      {
        label: 'Kategori',
        submenu: [
          { label: 'Kategorisiz', type: 'radio', checked: note.category_id === null, click: () => update({ category_id: null }) },
          ...(cats.length ? [{ type: 'separator' }] : []),
          ...cats.map((c) => ({ label: c.name, type: 'radio', checked: note.category_id === c.id, click: () => update({ category_id: c.id }) })),
        ],
      },
      {
        label: 'Görünüm',
        submenu: [
          { label: 'Cam efekti', type: 'checkbox', checked: st.glass, enabled: supportsGlass, click: () => setLook(noteId, { glass: !st.glass }) },
          { type: 'separator' },
          ...[1, 0.9, 0.8, 0.7, 0.6].map((o) => ({
            label: `Pencere opaklığı %${Math.round(o * 100)}`, type: 'radio', checked: Math.abs(st.opacity - o) < 0.01, click: () => setLook(noteId, { opacity: o }),
          })),
        ],
      },
      { type: 'separator' },
      { label: 'Uygulamada sabitle', type: 'checkbox', checked: note.is_pinned, click: () => update({ is_pinned: !note.is_pinned }) },
      { label: 'Favori', type: 'checkbox', checked: note.is_favorite, click: () => update({ is_favorite: !note.is_favorite }) },
      { type: 'separator' },
      { label: `${APP_NAME} içinde düzenle…`, click: () => ctx.showMain({ noteId }) },
      { label: "Widget'ı kapat", click: () => close(noteId) },
    ]);
    menu.popup({ window: win });
  }

  return {
    open,
    close,
    openIds,
    noteIdFor: (webContents) => byContents.get(webContents.id) ?? null,
    windowFor: (noteId) => wins.get(noteId) ?? null,
    isOpen: (noteId) => wins.has(noteId),
    setAlwaysOnTop,
    setLayer,
    setLook,
    popupMenu,
    sendState,
    restore() {
      for (const st of ctx.store.widgets.list()) {
        const note = ctx.store.notes.get(st.note_id);
        if (st.is_open && note && !note.deleted_at) {
          try { open(st.note_id, { focus: false }); } catch { /* yoksay */ }
        }
      }
    },
    showAll() {
      for (const [noteId, w] of wins) {
        w.showInactive();
        // Gizle/göster sonrası "her zaman üstte" tercihini yeniden uygula.
        const st = ctx.store.widgets.get(noteId);
        if (!st?.desktop_pinned) w.setAlwaysOnTop(!!st?.always_on_top);
      }
    },
    hideAll() { for (const w of wins.values()) w.hide(); },
    recheckBounds() {
      for (const w of wins.values()) {
        const b = w.getContentBounds();
        const nb = ensureVisible(b);
        if (!sameRect(nb, b)) placeWindow(w, nb);
      }
    },
    refreshLook() {
      for (const [noteId, w] of wins) {
        const st = ctx.store.widgets.get(noteId);
        if (st) applyLook(w, st);
      }
    },
    noteTitleChanged(note) {
      const w = wins.get(note.id);
      if (w) w.setTitle(note.title || 'Not');
    },
    beginQuit() { quitting = true; },
  };
}

module.exports = { createMainWindow, createWidgetManager, ensureVisible, placeWindow, sameRect, overlayColors, solidBg };
