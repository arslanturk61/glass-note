# 03 · IPC ve preload köprüsü

## Amaç
Renderer'ın ana sürece erişebildiği **tek** yüzey. Renderer'da Node/veritabanı erişimi yoktur (`contextIsolation`, `sandbox`, `nodeIntegration:false`).

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/preload/preload.js` | 88 | `contextBridge.exposeInMainWorld('glassnote', …)`; kanal beyaz listesi, olay beyaz listesi, hata mesajı temizleme |
| `src/main/ipc.js` | 186 | `registerIpc(ctx)`: tüm `ipcMain.handle` tanımları, gönderen doğrulaması, yedek okuma |

## Güvenlik kuralları
- Her istek `assertSender`: `senderFrame.url` uygulama sayfası olmalı (`paths.isAppUrl`).
- Parametreler ana süreçte doğrulanır (`shared/validate.js`).
- **Widget kanalları** (`widget:*`) not kimliğini renderer'dan almaz; `ctx.widgets.noteIdFor(e.sender)` ile gönderenden çözer.
- Preload, ana süreç hatalarını `"Error invoking remote method…"` önekinden temizleyip `Error(message)` olarak fırlatır.

## `window.glassnote` API'si → kanal
| Grup | Metotlar (kanal adı `grup:metot`) |
|---|---|
| `notes` | `list, get, create, update, trash, restore, destroy, emptyTrash, discardIfEmpty`; `updateSync(id, patch)` → `ipcMain.on('notes:update-sync')` (**eşzamanlı**, yalnızca `beforeunload`'da) |
| `categories` | `list, create, update, reorder, remove(id, mode, targetId)` |
| `settings` | `get, set(key, value)` |
| `widgets` | `open(id), close(id), openIds()` (ana pencereden) |
| `widget` | `init, menu, close, setAlwaysOnTop(bool), setLayer('normal'|'top'|'desktop')` (yalnızca widget penceresinden) |
| `speech` | `available(), transcribe(wavArrayBuffer)` |
| `app` | `info, showMain({noteId}), openDataFolder, openExternal(url)` (onay sorar; yalnızca http/https/mailto), `exportBackup, pickImport, importBackup(token, mode), updateStatus, checkUpdates, installUpdate` |
| `on(event, cb)` | Olay dinleme; abonelikten çıkma fonksiyonu döndürür |

`app:info` döndürür: `name, version, dbPath, dataDir, schemaVersion, supportsGlass, speechAvailable, isDev, palette, openAtLoginActual`.

## Olaylar (ana → renderer)
| Olay | Yük | Gönderen |
|---|---|---|
| `notes:changed` | `{notes[], removed[], source}` | Her not servisi |
| `notes:reload` | — | İçe aktarma sonrası |
| `categories:changed` | kategori listesi | Kategori servisleri |
| `settings:changed` | tüm ayarlar | `setSetting` (`lastView`/`mainWindowBounds` hariç) |
| `widgets:changed` | açık widget kimlikleri | Widget yöneticisi |
| `widget:state` | widget durumu + `glassSupported`, `desktopSupported` | Yalnızca ilgili widget'a |
| `app:open-note`, `app:new-note`, `app:show-settings` | not kimliği / — | `ctx.showMain` (tepsi, bildirim, widget) |
| `app:flush` | — | Pencere gizlenirken/kapanırken bekleyen kaydı yaz |
| `app:update-status` | `{state, version, percent, message}` | Güncelleyici |

## İçe aktarma akışı (iki adım)
`app:pickImport` → ana süreç dosyayı okur, ayrıştırır, doğrular, veriyi bellekte tutar ve **token** döndürür → kullanıcı modu seçer → `app:import(token, mode)`. Büyük veri renderer'a gidip gelmez.

## Değişiklik yaparken dikkat
Yeni kanal eklemek **üç yer** gerektirir: `ipc.js` (`handle` + doğrulama) → `preload.js` (API) → renderer kullanımı. Yeni olay için `preload.js` › `EVENTS` listesine ekle, yoksa `on()` reddeder.

## İlgili testler
e2e: "güvenlik: zararlı HTML temizlenir, geçersiz IPC parametreleri reddedilir".
