# 01 · Ana süreç (yaşam döngüsü ve servisler)

## Amaç
Electron ana sürecini başlatır, tüm servisleri tek bir `ctx` nesnesinde toplar, güvenlik kancalarını kurar ve uygulamanın açılış/kapanış davranışını yönetir.

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/main/main.js` | 330 | Giriş noktası (`package.json` › `main`). `bootstrap()` → `ctx` kurulumu, servisler, yaşam döngüsü |
| `src/main/paths.js` | 45 | Yollar ve ortam: `isDev`, `devServerUrl`, `resourcesDir`, `preloadPath`, `supportsGlass`, `loadPage()`, `isAppUrl()` |

## `ctx` servis nesnesi (main.js)
Tüm ana süreç modülleri bu nesneyi alır; renderer'dan gelen her değişiklik buradan geçer.

| Üye | Ne yapar |
|---|---|
| `store` | Veritabanı API'si (bkz. [02](02-veritabani.md)) |
| `mainWindow`, `widgets`, `tray`, `reminders`, `updater` | Alt servisler |
| `isQuitting` | `true` ise pencere kapatma = gerçek çıkış (tepsiye gizleme yok) |
| `broadcast(ch, payload)` | Tüm pencerelere olay gönderir |
| `notesChanged({notes, removed}, source)` | `notes:changed` yayını |
| `createNote / updateNote / trashNote / restoreNote / destroyNote / emptyTrash / discardIfEmpty` | Not servisleri: store + yayın + yan etkiler (widget kapatma, hatırlatma denetimi, başlık güncelleme) |
| `categoriesMutated(fn)`, `removeCategory(id, mode, target)` | Kategori servisleri + `categories:changed` |
| `setSetting(key, value)` | Ayar kaydı + yan etkiler: `theme`→`nativeTheme.themeSource`, `glassIntensity`→malzeme, `openAtLogin`→Windows kaydı, `autoUpdate`→updater |
| `showMain({noteId, newNote, settings})` | Ana pencereyi oluşturur/gösterir, yüklenince isteği iletir |
| `quit()` | `isQuitting=true`, widget'ları "açık" olarak bırakıp çıkar |
| `loginItemActive()` | Windows Run kaydı gerçekten var mı (ad + yol + `enabled`) |
| `exportTo / inspectBackup / importBackup` | Yedek işlemleri (bkz. [02](02-veritabani.md)) |

## Açılış sırası (`app.whenReady`)
1. `userData` belirlenir (`GLASSNOTE_USER_DATA` > dev'de `%APPDATA%\GlassNote Dev` > `%APPDATA%\GlassNote`) — **`ready`'den önce**.
2. Tek örnek kilidi (`requestSingleInstanceLock`); ikinci açılış mevcut pencereyi gösterir.
3. `openStore(userData/glassnote.db)`; hata → hata kutusu ve çıkış.
4. Menü kaldırılır, oturum güvenliği kurulur (aşağıda), `nativeTheme.themeSource` uygulanır.
5. `createWidgetManager`, `registerIpc`, `createTray`.
6. Paketliyse ve `openAtLogin` açıksa Windows kaydı yeniden uygulanır (kurulum yolu değişmiş olabilir).
7. `--autostart` + `startupMode:'tray'` değilse ana pencere açılır; `restoreWidgets` ise widget'lar geri yüklenir.
8. `startReminders`, `createUpdater`, `speech.cleanupStale()`.
9. Ekran değişikliklerinde (`display-removed`, `display-metrics-changed`) pencereler görünür alana alınır.
10. `GLASSNOTE_TEST=1` ise `global.__glassnote = ctx` (yalnızca testler için).

## Kapanış
- Ana pencere `close`: `closeToTray` açıksa gizlenir (+ ilk seferde tepsi balonu), değilse `ctx.quit()`.
- `before-quit` → `isQuitting`, `widgets.beginQuit()` (widget'lar `is_open` olarak kalır).
- Pencereler kapanırken renderer `beforeunload` ile kaydedilmemiş içeriği **eşzamanlı** yazar (`notes:update-sync`).
- `will-quit` → hatırlatma/updater durdurulur, tepsi kaldırılır, `store.close()` (WAL checkpoint).
- `window-all-closed` uygulamayı kapatmaz (tepsi modu).

## Güvenlik kancaları (main.js)
- Her `webContents`: `setWindowOpenHandler → deny`, uygulama dışı `will-navigate` engeli, `<webview>` engeli; dev'de F12 = DevTools.
- İzinler: yalnızca uygulama sayfasından ve **yalnızca ses** için `media` (konuşarak yazma); diğer her şey reddedilir.
- **Ağ kilidi** (`session.defaultSession.webRequest.onBeforeRequest`): yalnızca `file:`, `data:`, `devtools:` ve dev'de Vite sunucusu. Güncelleyici kendi oturumunu kullandığı için etkilenmez.
- Yazım denetimi: `tr` + `en-US`, sözlük indirme kapalı.

## Bağımlılıklar
`db.js`, `windows.js`, `ipc.js`, `tray.js`, `reminders.js`, `updater.js`, `speech.js`, `shared/constants.js`.

## Değişiklik yaparken dikkat
- Yeni bir "veriyi değiştiren" işlem → `ctx` üzerinde servis yaz, store'u çağır, sonra yayınla. Renderer'dan doğrudan store'a gitme.
- `app.setPath('userData')` her zaman `ready` öncesinde kalmalı.
- `paths.supportsGlass` = Windows 11 22H2+ (build ≥ 22621); altında akrilik yok, opak yüzey kullanılır.
