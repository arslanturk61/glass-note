'use strict';

// Uygulama adı tek yerden yönetilir; yeniden adlandırma için burası ve
// package.json (productName/build) yeterlidir.
const APP_NAME = 'GlassNote';
const APP_ID = 'com.glassnote.app';

const BACKUP_FORMAT = 'glassnote-backup';
const BACKUP_VERSION = 1;

const LIMITS = {
  title: 500,
  content: 2_000_000,
  tagName: 40,
  tagsPerNote: 30,
  categoryName: 60,
  backupBytes: 100 * 1024 * 1024,
};

const NOTE_PALETTE = [
  { name: 'Okyanus', hex: '#0C60FC' },
  { name: 'Gökyüzü', hex: '#37B9F3' },
  { name: 'Nane', hex: '#2BC39A' },
  { name: 'Limon', hex: '#E8C547' },
  { name: 'Mercan', hex: '#FF7A59' },
  { name: 'Gül', hex: '#F25C8A' },
  { name: 'Lavanta', hex: '#9B7BF7' },
  { name: 'Grafit', hex: '#7C8798' },
];

const DEFAULT_SETTINGS = {
  theme: 'system', // system | light | dark
  accentColor: '#0C60FC',
  defaultNoteColor: null, // null => kategori rengi / nötr
  widgetWidth: 300,
  widgetHeight: 320,
  cardStyle: 'comfortable', // comfortable | compact
  fontSize: 'medium', // small | medium | large
  glassIntensity: 60, // 0 = opak, 100 = en saydam
  openAtLogin: false,
  closeToTray: true,
  startupMode: 'window', // window | tray (yalnızca Windows ile başlatıldığında)
  restoreWidgets: true,
  autosave: true,
  widgetAlwaysOnTop: false,
  restoreLastView: true,
  sidebarCollapsed: false,
  viewMode: 'grid', // grid | list
  sortBy: 'updated', // updated | created | title | category
  pinnedFirst: true,
  lastView: null,
  mainWindowBounds: null,
  trayHintShown: false,
};

module.exports = {
  APP_NAME,
  APP_ID,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  LIMITS,
  NOTE_PALETTE,
  DEFAULT_SETTINGS,
};
