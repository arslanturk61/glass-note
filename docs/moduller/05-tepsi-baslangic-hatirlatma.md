# 05 · Sistem tepsisi, Windows başlangıcı ve hatırlatmalar

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/main/tray.js` | 42 | `createTray(ctx)` → `rebuild, items, trigger(id), balloon, destroy` |
| `src/main/reminders.js` | 47 | `startReminders(ctx)` → `check, stop` |
| `src/main/main.js` | — | Windows başlangıç kaydı (`loginItemOptions`, `applyLoginItem`, `ctx.loginItemActive`) |

## Sistem tepsisi
- Menü öğe kimlikleri: `open`, `new`, `show-widgets`, `hide-widgets`, `settings`, `quit`. Widget sayısı değişince menü yeniden kurulur (`ctx.onWidgetsChanged`).
- Sol tık → ana pencere. "Pencereyi kapat" (tepsiye gizle) ile "Uygulamadan çık" ayrı işlemler.
- İlk tepsiye gizlemede bir kez bilgi balonu (`trayHintShown`).
- İkonlar `resources/tray*.png` (16/24/32 px; asar dışına açılır çünkü Windows gerçek dosya yolu ister).

## Windows ile başlatma
- `app.setLoginItemSettings` → `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Kayıt adı: paketli `GlassNote`, dev `GlassNote Dev`; argüman `--autostart` (dev'de ayrıca uygulama yolu).
- **Tuzak:** `getLoginItemSettings().openAtLogin` `--` ile başlayan argümanları geri okurken düşürdüğü için hep `false` döner. Doğrulama `launchItems` içinde **ad + yol + `enabled`** ile yapılır. Kullanıcı Windows "Başlangıç uygulamaları"ndan kapatırsa `enabled=false` olur.
- `--autostart` ile açılışta `startupMode:'tray'` ise ana pencere oluşturulmaz. Elle açılışta pencere her zaman açılır.

## Hatırlatmalar
- 15 sn'de bir ve `powerMonitor` `resume`/`unlock-screen` olaylarında `store.notes.dueReminders(now)`.
- **Önce** `markReminderDone`, sonra bildirim → bir hatırlatma asla iki kez tetiklenmez.
- 5 dakikadan geç kalanlar "Kaçırılan hatırlatma" başlığıyla gösterilir (uygulama kapalıyken geçenler).
- Bildirime tıklama → `ctx.showMain({noteId})`. Uygulama tamamen kapalıyken bildirim yok; bu bilinçli bir sınır.
- Windows bildirimleri için `app.setAppUserModelId('com.glassnote.app')`.

## İlgili testler
e2e: "sistem tepsisi…", "tepsi ayarı kapalıyken…", "Windows başlangıç kaydı…" (kayıt defterini gerçekten okur ve temizler), "hatırlatma zamanında tetiklenir…", "Windows ile başlatıldığında 'tepside başlat'…".
