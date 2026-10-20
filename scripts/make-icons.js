'use strict';

// Uygulama ikonlarını SVG kaynağından üretir: `npx electron scripts/make-icons.js`
// Çıktılar: resources/icon.png (512), resources/icon.ico (16–256), resources/tray*.png
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const OUT = path.join(__dirname, '..', 'resources');

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#37B9F3"/>
      <stop offset="0.55" stop-color="#0C60FC"/>
      <stop offset="1" stop-color="#0A3FB8"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".98"/>
      <stop offset="1" stop-color="#E6EEFF" stop-opacity=".92"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bg)"/>
  <path d="M24 136 Q24 24 136 24 H376 Q488 24 488 136 V200 Q256 150 24 236Z" fill="url(#sheen)"/>
  <rect x="24.5" y="24.5" width="463" height="463" rx="111.5" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
  <path d="M150 128 H318 L374 184 V368 Q374 392 350 392 H150 Q126 392 126 368 V152 Q126 128 150 128Z" fill="url(#paper)"/>
  <path d="M318 128 V168 Q318 184 334 184 H374Z" fill="#9CC0FF"/>
  <rect x="162" y="214" width="176" height="20" rx="10" fill="#0C60FC" opacity=".9"/>
  <rect x="162" y="262" width="150" height="16" rx="8" fill="#7C9BD6" opacity=".7"/>
  <rect x="162" y="304" width="118" height="16" rx="8" fill="#7C9BD6" opacity=".55"/>
</svg>`;

// Tepsi ikonu: küçük boyutta okunaklı, sade siluet.
const TRAY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37B9F3"/><stop offset="1" stop-color="#0C60FC"/></linearGradient></defs>
  <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#g)"/>
  <path d="M10 8 H19 L23 12 V23 Q23 24.5 21.5 24.5 H10 Q8.5 24.5 8.5 23 V9.5 Q8.5 8 10 8Z" fill="#fff"/>
  <rect x="11" y="14" width="9" height="1.8" rx=".9" fill="#0C60FC"/>
  <rect x="11" y="18" width="7" height="1.6" rx=".8" fill="#7C9BD6"/>
</svg>`;

// Küçük pencerelerde yakalama güvenilir olmadığından her zaman 512px'te
// render edilir ve hedef boyuta yüksek kaliteyle küçültülür.
function render(svg, size) {
  const base = 512;
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: base, height: base, show: false, transparent: true, frame: false,
      webPreferences: { offscreen: true },
    });
    const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${base}" height="${base}" `)}</body></html>`;
    win.webContents.setFrameRate(1);
    win.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 150));
        const img = await win.webContents.capturePage({ x: 0, y: 0, width: base, height: base });
        win.destroy();
        resolve(img.resize({ width: size, height: size, quality: 'best' }).toPNG());
      } catch (e) { reject(e); }
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

// PNG gömülü ICO (Windows Vista+).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // render pencereleri arasında çıkma
process.on('unhandledRejection', (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.png'), await render(ICON_SVG, 512));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await render(size <= 24 ? TRAY_SVG : ICON_SVG, size) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs));
  fs.writeFileSync(path.join(OUT, 'tray.png'), await render(TRAY_SVG, 16));
  fs.writeFileSync(path.join(OUT, 'tray@1.5x.png'), await render(TRAY_SVG, 24));
  fs.writeFileSync(path.join(OUT, 'tray@2x.png'), await render(TRAY_SVG, 32));
  console.log('Icons written to', OUT);
  app.quit();
});
