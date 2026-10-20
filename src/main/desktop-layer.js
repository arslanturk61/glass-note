'use strict';

// "Masaüstüne sabitle": widget, masaüstü penceresine (Progman) sahiplenilir ve
// pencere sırasının en altında tutulur. Böylece diğer pencerelerin arkasında kalır,
// ama masaüstünün üstünde durur ve "Masaüstünü göster" (Win+D) sırasında görünür.
// Electron bunu sunmadığı için birkaç Win32 çağrısı koffi ile yapılır.

let api = null;
let loadError = null;

function load() {
  if (api || loadError) return api;
  if (process.platform !== 'win32') {
    loadError = new Error('Yalnızca Windows');
    return null;
  }
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    api = {
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const char16_t *, const char16_t *)'),
      SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t, intptr_t, int, int, int, int, uint32_t)'),
      SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t, int, intptr_t)'),
      RegisterWindowMessageW: user32.func('uint32_t __stdcall RegisterWindowMessageW(const char16_t *)'),
    };
  } catch (e) {
    loadError = e;
  }
  return api;
}

const GWLP_HWNDPARENT = -8;
const HWND_BOTTOM = 1;
const SWP_FLAGS = 0x0001 | 0x0002 | 0x0010; // NOSIZE | NOMOVE | NOACTIVATE

const hwndOf = (win) => Number(win.getNativeWindowHandle().readBigUInt64LE(0));

function isSupported() {
  return !!load();
}

// Pencereyi masaüstü katmanına bağlar; geri alma fonksiyonu döndürür.
function attach(win) {
  if (!load()) return null;
  const hwnd = hwndOf(win);
  let active = true;
  const sinkNow = () => {
    if (active && !win.isDestroyed()) api.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_FLAGS);
  };
  // Windows etkinleştirmeyi odak olayından sonra tamamlayıp pencereyi öne alır;
  // bu yüzden alta itme etkinleştirme bittikten sonra da tekrarlanır.
  const sink = () => {
    sinkNow();
    setTimeout(sinkNow, 0);
    setTimeout(sinkNow, 120);
  };
  const own = () => {
    const progman = api.FindWindowW('Progman', null);
    if (progman) api.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, progman);
    sink();
  };
  own();
  // Tıklanınca öne gelmesin; gösterilince yine en alta insin.
  win.on('focus', sink);
  win.on('show', sink);
  // Windows Gezgini yeniden başlarsa masaüstü penceresi değişir: yeniden sahiplen.
  const taskbarCreated = api.RegisterWindowMessageW('TaskbarCreated');
  win.hookWindowMessage(taskbarCreated, () => setTimeout(own, 1500));

  return () => {
    active = false; // bekleyen gecikmeli alta itmeler artık çalışmaz
    if (win.isDestroyed()) return;
    win.off('focus', sink);
    win.off('show', sink);
    win.unhookWindowMessage(taskbarCreated);
    api.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0);
    win.moveTop();
  };
}

module.exports = { isSupported, attach };
