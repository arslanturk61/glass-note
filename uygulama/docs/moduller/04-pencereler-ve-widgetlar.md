# 04 · Pencereler ve masaüstü widget'ları

## Amaç
Ana pencereyi ve not başına bağımsız widget pencerelerini oluşturur; konum/boyut kaydı, çoklu ekran güvenliği, "her zaman üstte" ve "masaüstüne sabitle" katmanlarını yönetir.

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/main/windows.js` | 385 | `createMainWindow(ctx)`, `createWidgetManager(ctx)`, `ensureVisible`, `placeWindow`, `overlayColors`, `solidBg` |
| `src/main/desktop-layer.js` | 81 | `isSupported()`, `attach(win)` → geri alma fonksiyonu (koffi ile Win32) |

## Pencere yapılandırması
- Her iki pencere: `titleBarStyle:'hidden'`, Windows 11'de `backgroundMaterial:'acrylic'` + şeffaf arka plan; desteklenmiyorsa opak `solidBg()`.
- Ana pencere: `titleBarOverlay` (yerel küçült/büyüt/kapat düğmeleri, 52 px), min 720×480.
- Widget: `skipTaskbar`, `maximizable/minimizable:false`, min 200×140; sayfa `widget.html?id=<noteId>`.
- `transparent:true` **kullanılmaz**: Windows'ta yeniden boyutlandırmayı bozar.

## Sınır kaydı ve DPI kayması (önemli)
Kesirli ölçeklemede (%125 vb.) Electron'un çerçeve dönüşümü her `setBounds`/oluşturmada birkaç piksel kayıyor → pencere her açılışta büyüyordu. Çözüm:
- **İçerik sınırları** saklanır (`getContentBounds`).
- `placeWindow(win, hedef)` `setContentBounds` uygular, okur, farkı telafi edip en fazla 4 kez tekrarlar → ilk seferde ≤1 px düzeltme, sonra sabit.
- Ana pencere büyütülmüşse son "normal" sınırlar ayrıca tutulur (`mainWindowBounds.maximized`).

## Görünürlük (`ensureVisible`)
Kaydedilmiş dikdörtgenin üst 36 px'lik tutma şeridi herhangi bir ekranın çalışma alanında ≥80×20 px görünmüyorsa, en yakın ekrana sığdırılır. Açılışta ve ekran değişikliklerinde çalışır (çıkarılan monitör senaryosu).

## Widget yöneticisi API'si
`open(noteId, {focus})`, `close(noteId)` (kullanıcı kapatması → `is_open=false`), `openIds`, `noteIdFor(webContents)`, `windowFor`, `isOpen`, `setLayer(noteId, layer)`, `setAlwaysOnTop(noteId, bool)`, `setLook(noteId, {glass, opacity})`, `popupMenu` (yerel bağlam menüsü: katman, renk, kategori, görünüm, sabitleme, favori), `sendState`, `restore()`, `showAll/hideAll` (tepsi), `recheckBounds`, `refreshLook`, `noteTitleChanged`, `beginQuit`.

- Uygulamadan çıkarken (`beginQuit`) widget'lar `is_open=true` kalır → sonraki açılışta geri yüklenir.
- Not çöpe gidince widget kapanır (`ctx.trashNote`).
- `always-on-top-changed` dinleyicisi gerçek pencere durumunu veritabanı ve arayüzle eşitler.

## Katman modları (`setLayer`) — birbirini dışlar
| Mod | Uygulama |
|---|---|
| `normal` | Varsayılan |
| `top` | `win.setAlwaysOnTop(true)` |
| `desktop` | `desktopLayer.attach(win)`: sahip (owner) = masaüstü penceresi `Progman` (`SetWindowLongPtrW(GWLP_HWNDPARENT)`) + `SetWindowPos(HWND_BOTTOM)` |

Masaüstü katmanı ölçümle seçildi: yalnızca en alta itmek `Win+D`'de pencereyi masaüstünün arkasına düşürüyor; Progman'a sahiplenmek masaüstünün hemen üstünde tutuyor.
- Etkinleşince Windows pencereyi **olaydan sonra** öne alıyor → `focus`/`show`'da alta itme 0 ve 120 ms gecikmeyle tekrarlanır.
- Geri alma sonrası bekleyen gecikmeli itmeler `active` bayrağıyla iptal edilir (aksi hâlde `HWND_BOTTOM` "üstte" durumunu siliyordu).
- Gezgin yeniden başlarsa (`TaskbarCreated` mesajı) yeniden sahiplenir.

## Değişiklik yaparken dikkat
- Pencere boyutunu/konumunu her zaman `placeWindow` + `getContentBounds` ile yönet; `setBounds`/`getBounds` kullanma.
- `koffi` yalnızca `desktop-layer.js`'te; yüklenemezse özellik devre dışı kalır (`isSupported()` false), uygulama çalışmaya devam eder.

## İlgili testler
e2e: "widget: bağımsız pencere, her zaman üstte…", "widget masaüstüne sabitlenir…" (gerçek z-sırası ölçümü; `GLASSNOTE_E2E_WIND=1` ile gerçek `Win+D` de test edilir).
