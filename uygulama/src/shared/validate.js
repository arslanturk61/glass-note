'use strict';

const { LIMITS, DEFAULT_SETTINGS } = require('./constants');

class ValidationError extends Error {}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function fail(msg) {
  throw new ValidationError(msg);
}

function isHexColor(v) {
  return typeof v === 'string' && HEX_RE.test(v);
}

function id(v, name = 'id') {
  if (!Number.isSafeInteger(v) || v <= 0) fail(`Geçersiz ${name}`);
  return v;
}

function optionalId(v, name) {
  return v === null || v === undefined ? null : id(v, name);
}

function str(v, max, name) {
  if (typeof v !== 'string') fail(`${name} metin olmalı`);
  if (v.length > max) fail(`${name} çok uzun`);
  return v;
}

function bool(v, name) {
  if (typeof v !== 'boolean') fail(`${name} true/false olmalı`);
  return v;
}

function color(v, name = 'renk') {
  if (v === null) return null;
  if (!isHexColor(v)) fail(`Geçersiz ${name}`);
  return v.toUpperCase();
}

function isoDate(v, name) {
  if (v === null) return null;
  if (typeof v !== 'string' || v.length > 40 || Number.isNaN(Date.parse(v))) fail(`Geçersiz ${name}`);
  return new Date(v).toISOString();
}

function normalizeTag(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.tagName);
}

function tags(v) {
  if (!Array.isArray(v)) fail('Etiketler liste olmalı');
  const seen = new Set();
  const out = [];
  for (const t of v) {
    const n = normalizeTag(t);
    const key = n.toLocaleLowerCase('tr');
    if (n && !seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  if (out.length > LIMITS.tagsPerNote) fail('Çok fazla etiket');
  return out;
}

// Not güncelleme yaması: yalnızca bilinen alanlar kabul edilir.
function notePatch(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('Geçersiz not verisi');
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    switch (k) {
      case 'title': out.title = str(v, LIMITS.title, 'Başlık'); break;
      case 'content': out.content = str(v, LIMITS.content, 'İçerik'); break;
      case 'category_id': out.category_id = optionalId(v, 'kategori'); break;
      case 'color': out.color = color(v); break;
      case 'is_favorite': out.is_favorite = bool(v, k); break;
      case 'is_pinned': out.is_pinned = bool(v, k); break;
      case 'is_archived': out.is_archived = bool(v, k); break;
      case 'reminder_at': out.reminder_at = isoDate(v, 'hatırlatma tarihi'); break;
      case 'tags': out.tags = tags(v); break;
      default: fail(`Bilinmeyen alan: ${k}`);
    }
  }
  return out;
}

function categoryName(v) {
  const n = str(v, LIMITS.categoryName * 2, 'Kategori adı').replace(/\s+/g, ' ').trim();
  if (!n) fail('Kategori adı boş olamaz');
  if (n.length > LIMITS.categoryName) fail('Kategori adı çok uzun');
  return n;
}

// Her ayar için izin verilen değer kuralı.
const SETTING_RULES = {
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  accentColor: isHexColor,
  defaultNoteColor: (v) => v === null || isHexColor(v),
  widgetWidth: (v) => Number.isInteger(v) && v >= 200 && v <= 1200,
  widgetHeight: (v) => Number.isInteger(v) && v >= 160 && v <= 1200,
  cardStyle: (v) => ['comfortable', 'compact'].includes(v),
  fontSize: (v) => ['small', 'medium', 'large'].includes(v),
  glassIntensity: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  openAtLogin: (v) => typeof v === 'boolean',
  closeToTray: (v) => typeof v === 'boolean',
  startupMode: (v) => ['window', 'tray'].includes(v),
  restoreWidgets: (v) => typeof v === 'boolean',
  autosave: (v) => typeof v === 'boolean',
  autoUpdate: (v) => typeof v === 'boolean',
  widgetAlwaysOnTop: (v) => typeof v === 'boolean',
  restoreLastView: (v) => typeof v === 'boolean',
  sidebarCollapsed: (v) => typeof v === 'boolean',
  viewMode: (v) => ['grid', 'list'].includes(v),
  sortBy: (v) => ['updated', 'created', 'title', 'category'].includes(v),
  pinnedFirst: (v) => typeof v === 'boolean',
  lastView: (v) => v === null || (typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length < 2000),
  mainWindowBounds: (v) => v === null || (typeof v === 'object' && ['x', 'y', 'width', 'height'].every((k) => Number.isInteger(v[k]))),
  trayHintShown: (v) => typeof v === 'boolean',
};

function setting(key, value) {
  if (typeof key !== 'string' || !Object.hasOwn(DEFAULT_SETTINGS, key)) fail(`Bilinmeyen ayar: ${key}`);
  if (!SETTING_RULES[key](value)) fail(`Geçersiz değer: ${key}`);
  if (key === 'accentColor' || (key === 'defaultNoteColor' && value)) return value.toUpperCase();
  return value;
}

module.exports = {
  ValidationError,
  isHexColor,
  id,
  optionalId,
  str,
  bool,
  color,
  isoDate,
  tags,
  normalizeTag,
  notePatch,
  categoryName,
  setting,
  SETTING_RULES,
};
