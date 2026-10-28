# GlassNote — Proje Rehberi

> **Yapay zeka ajanları ve geliştiriciler için giriş noktası.** Bu dosyayı ve ihtiyacın olan `moduller/` belgesini oku; kaynağın tamamını taramana gerek yok. Belgeler v1.2.0 (şema v2) itibarıyla günceldir.

## 1. Özet
GlassNote, Windows 10/11 için **çevrimdışı** çalışan, cam efektli (Windows 11 akrilik) bir masaüstü not uygulamasıdır. Notlar bağımsız **masaüstü widget'ları** olarak açılabilir (normal / her zaman üstte / masaüstüne sabitli). Kategoriler, renkler, etiketler, başlıklar, görev listeleri, hatırlatmalar, Türkçe **çevrimdışı konuşarak yazma**, sistem tepsisi, Windows ile başlatma, JSON yedek ve GitHub üzerinden otomatik güncelleme vardır.

Temel ilkeler: veri yalnızca yerel SQLite'ta; hesap/telemetri yok; arayüz internete çıkamaz (yalnızca güncelleyici çıkar); her buton gerçek işlev görür; özellikler gerçek Electron üzerinde uçtan uca test edilir.

- Depo: https://github.com/arslanturk61/glass-note · Lisans: MIT · Yazar: Abdullah (arslanturk61)
- Yığın: Electron 44 (Node 24), Vanilla JS + Vite 8, `node:sqlite`, electron-builder (NSIS), electron-updater, koffi, whisper.cpp

## 2. Hızlı harita — "şunu değiştireceğim, nereye bakayım?"
| İş | Dosya(lar) | Belge |
|---|---|---|
| Yeni ayar | `src/shared/constants.js` (`DEFAULT_SETTINGS`) + `src/shared/validate.js` (`SETTING_RULES`) + yan etki için `src/main/main.js` (`ctx.setSetting`) + arayüz `src/renderer/modules/settings-view.js` | [02](moduller/02-veritabani.md), [08](moduller/08-arayuz-ana-pencere.md) |
| Yeni not/widget alanı (şema) | `src/main/db.js` (`MIGRATIONS`'a **ekle**, `rowToNote`/`rowToWidget`, kaydetme SQL'i) + `validate.notePatch` | [02](moduller/02-veritabani.md) |
| Yeni IPC kanalı / olay | `src/main/ipc.js` → `src/preload/preload.js` (API + `EVENTS`) → renderer | [03](moduller/03-ipc-ve-preload.md) |
| Not kaydetme/silme mantığı | `src/main/main.js` (`ctx.*Note`), `src/main/db.js` | [01](moduller/01-ana-surec.md) |
| Widget davranışı / katmanlar / pencere konumu | `src/main/windows.js`, `src/main/desktop-layer.js` | [04](moduller/04-pencereler-ve-widgetlar.md) |
| Widget arayüzü | `src/renderer/widget.js`, `src/renderer/styles/widget.css` | [10](moduller/10-widget-arayuzu.md) |
| Editör araç çubuğu, biçimlendirme, kısayollar | `src/renderer/components/rich-editor.js` (+ izinli HTML: `sanitize.js`) | [09](moduller/09-arayuz-bilesenler.md) |
| Arama, filtre, sıralama | `src/renderer/modules/filter.js` (saf, birim testli) | [08](moduller/08-arayuz-ana-pencere.md) |
| Kartlar, kenar çubuğu, düzenleyici paneli | `src/renderer/modules/notes-view.js`, `sidebar.js`, `editor-panel.js` | [08](moduller/08-arayuz-ana-pencere.md) |
| Renkler, tema, cam yoğunluğu | `src/renderer/styles/tokens.css`, `src/renderer/modules/theme.js` | [11](moduller/11-stil-sistemi.md) |
| Tepsi menüsü, başlangıç, hatırlatma | `src/main/tray.js`, `src/main/reminders.js`, `src/main/main.js` | [05](moduller/05-tepsi-baslangic-hatirlatma.md) |
| Güncelleme | `src/main/updater.js`, `package.json` › `build.publish` | [06](moduller/06-guncelleme.md) |
| Konuşarak yazma | `src/main/speech.js`, `src/renderer/components/dictation.js`, `scripts/fetch-whisper.mjs` | [07](moduller/07-konusma-tanima.md) |
| Paketleme / sürüm yayınlama | `package.json` › `build`, `scripts/` | [12](moduller/12-test-ve-dagitim.md) |

## 3. Mimari
```
┌──────────────── Ana süreç (Node, CommonJS) ────────────────┐
│ main.js ── ctx {store, widgets, tray, reminders, updater,  │
│              *Note servisleri, setSetting, showMain, quit} │
│   ├─ db.js (node:sqlite)        ├─ windows.js + desktop-layer.js (koffi)
│   ├─ ipc.js (handle + doğrulama)├─ tray.js / reminders.js / updater.js
│   └─ speech.js → whisper-cli.exe (yerel)                   │
└───────────────▲─────────────────────────┬──────────────────┘
     invoke     │ preload.js              │ olaylar (broadcast)
  (beyaz liste) │ window.glassnote        ▼
┌───────────────┴──────────┐   ┌──────────────────────────────┐
│ index.html → main.js     │   │ widget.html → widget.js       │
│ state + modules/*        │   │ (not başına bir pencere)      │
│ components/* (ortak)     │   │ components/* (ortak)          │
└──────────────────────────┘   └──────────────────────────────┘
```
**Veri akışı (tek yön):** renderer → `glassnote.notes.update()` → `ipc.js` (gönderen + parametre doğrulama) → `ctx.updateNote()` → `store` → `broadcast('notes:changed')` → **tüm** pencereler (`upsertNotes` → `render()`). Ana pencere ile widget aynı notu bu yayınla eşitler. Renderer hiçbir zaman doğrudan veriye erişmez.

## 4. Teknoloji kararları
| Karar | Neden | Reddedilen |
|---|---|---|
| `node:sqlite` | Electron 44'e gömülü; native derleme/paketleme riski yok | better-sqlite3 (rebuild), sql.js (tüm dosyayı yeniden yazar) |
| Vanilla JS + Vite, framework yok | İstek gereği; küçük ve bağımlılıksız arayüz | React/Vue |
| `titleBarStyle:'hidden'` + `backgroundMaterial:'acrylic'` | Gerçek sistem bulanıklığı, yerel yeniden boyutlandırma ve köşeler | `transparent:true` (Windows'ta boyutlandırma bozuk) |
| `contenteditable` + beyaz liste temizleyici | Sade biçimlendirme, XSS'e karşı iki katman (temizleyici + CSP) | Ağır belge editörleri |
| koffi (yalnızca masaüstü katmanı) | Electron'da "pencerelerin arkasında dur" API'si yok; hazır derlenmiş, derleme gerektirmez | native C++ eklentisi |
| whisper.cpp `base-q8_0` + extraResources | Tamamen çevrimdışı, hızlı (10 sn ≈ 2 sn), 78 MB | Windows sesle yazma (ses Microsoft'a gider), Web Speech API (çalışmaz/çevrimiçi), `small` model (5× yavaş) |
| electron-updater + GitHub Releases | Standart, kısmi indirme (blockmap), ayrı oturum | Elle güncelleme |
| Playwright `_electron` e2e | Gerçek pencereler, IPC, kayıt defteri, sahte mikrofon test edilebilir | Yalnızca birim test |

## 5. Nasıl yapıldı (geliştirme süreci)
Proje boş bir klasörde, aşamalı ve her aşamada gerçek testle geliştirildi:
1. **Analiz:** Electron içinde `node:sqlite` denendi ve Türkçe karakterlerle doğrulandı → native modül riski baştan elendi.
2. **Veri katmanı:** `db.js` + migration + doğrulama; Electron'suz birim testleri.
3. **Ana süreç + güvenlik:** `ctx` servis nesnesi, beyaz listeli preload/IPC, CSP, gezinme/izin kilitleri.
4. **Arayüz:** tasarım token'ları, ana pencere modülleri, zengin editör, ayarlar.
5. **Widget'lar:** bağımsız pencereler, her zaman üstte, konum kaydı, çoklu ekran güvenliği.
6. **Windows entegrasyonu:** tepsi, başlangıç kaydı, bildirimli hatırlatmalar.
7. **Test ve dağıtım:** Playwright e2e (geliştirme + paketlenmiş exe), NSIS kurulum, gerçek kurulum/kaldırma doğrulaması.

Sürümler:
- **v1.0.0** — temel uygulama (yukarıdaki her şey).
- **v1.1.0** — not içinde H1–H3 başlıklar; GitHub üzerinden otomatik güncelleme; boşluksuz kurulum dosyası adı.
- **v1.2.0** — masaüstüne sabitleme (koffi, ölçümle seçilen yöntem); çevrimdışı konuşarak yazma (whisper.cpp); şema v2.
- **v1.2.0 sonrası (main dalında, henüz yayımlanmadı)** — çökme sonrası kalan geçici ses dosyalarının açılışta temizlenmesi.

## 6. Kodlama kuralları ve kalıplar
- **Ana süreç CommonJS** (`require`), **renderer ES modülü** (`import`); `src/shared` yalnızca ana süreçte kullanılır.
- Kod yorumları ve kullanıcı metinleri **Türkçe**; tanımlayıcılar İngilizce.
- Veriyi değiştiren her işlem bir `ctx` servisinden geçer ve sonucu yayınlar.
- Kullanıcı verisi DOM'a yalnızca `h()` ile (metin düğümü) eklenir; `innerHTML` yalnızca `sanitizeHtml` çıktısı ve sabit ikon SVG'leri için.
- Yerel `Element.append()` yerine `clear(el, ...)`/`append(el, ...)` (null güvenli).
- Migration'lar asla düzenlenmez, yalnızca eklenir.
- Pencere boyutu/konumu: `placeWindow` + `getContentBounds` (asla `setBounds`/`getBounds`).
- Arama/sıralama gibi saf mantık DOM'dan ayrı (`filter.js`) ve birim testli.
- Bir özellik arayüzde varsa gerçek işlevi ve testi de olmalı.

## 7. Güvenlik ve gizlilik modeli
- `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`; renderer yalnızca `window.glassnote` görür.
- IPC: gönderen URL kontrolü + her parametre doğrulaması; widget kanallarında kimlik gönderenden çözülür.
- Katı CSP (`script-src 'self'`), yeni pencere/gezinme/webview engelli.
- Not HTML'i beyaz liste temizleyiciden geçer; bağlantılar onayla ve yalnızca http/https/mailto ile açılır.
- **Ağ kilidi:** varsayılan oturumda yalnızca yerel kaynaklar (+ dev'de Vite). İstisna yalnızca `electron-updater` (kendi oturumu).
- İzinler: yalnızca uygulama sayfasına, yalnızca mikrofon (ses). Ses kaydı geçici dosya olarak yerelde işlenip hemen silinir.
- Not içerikleri loglanmaz.

## 8. Veri konumları ve ortam değişkenleri
| Ne | Nerede |
|---|---|
| Veritabanı (kurulu) | `%APPDATA%\GlassNote\glassnote.db` (+ `-wal`, `-shm`) |
| Veritabanı (geliştirme) | `%APPDATA%\GlassNote Dev\glassnote.db` |
| "Değiştir" ile içe aktarma öncesi yedek | `<userData>\backups\ice-aktarma-oncesi-<zaman>.db` |
| Güncelleme önbelleği | `%LOCALAPPDATA%\glassnote-updater` |
| Konuşma tanıma bileşenleri | kaynakta `resources\whisper\` (git dışı), kurulumda `<kurulum>\resources\whisper\` |
| `GLASSNOTE_USER_DATA` | Veri klasörünü değiştirir (testler) |
| `GLASSNOTE_TEST=1` | `global.__glassnote = ctx` (testler) |
| `GLASSNOTE_E2E_EXE`, `GLASSNOTE_E2E_WIND` | e2e: paketli exe'ye karşı test / gerçek Win+D |

## 9. Bilinen tuzaklar ve öğrenilen dersler
1. **DPI kayması:** %125 ölçeklemede `setBounds`/oluşturma her seferinde birkaç px büyütüyordu → içerik sınırları + `placeWindow` telafisi.
2. **Başlangıç kaydı okuma hatası:** `getLoginItemSettings().openAtLogin` `--autostart` argümanı yüzünden hep `false` → `launchItems` ile ad+yol+`enabled` kontrolü.
3. **`transparent:true`** Windows'ta yeniden boyutlandırmayı bozar → akrilik malzeme kullan.
4. **Örtülü pencerede `requestAnimationFrame` durur:** arka plandaki ana pencere görünür olunca çizer (normal); testlerde `NO_THROTTLE` anahtarları şart.
5. **Masaüstü katmanı:** etkinleşme olaydan sonra tamamlanıyor → gecikmeli alta itme; mod değişince bekleyen itmeler `active` bayrağıyla iptal (yoksa "üstte" durumu siliniyor).
6. **Win+D testi:** arka plandan `Shell.Application.ToggleDesktop` yok sayılır → gerçek tuş vuruşu (`keybd_event`).
7. **Pencere kapanırken veri kaybı:** asenkron IPC yetişmez → `beforeunload`'da `sendSync` (`notes:update-sync`).
8. **Yerel `Element.append(null)`** "null" metni yazar → `clear()`/`append()` yardımcıları.
9. **Büyük ikililer git'e girmez** (GitHub 100 MB sınırı) → whisper bileşenleri SHA-256 sabitli betikle indirilir.
10. **Git Bash'in `tar`'ı** Windows yollarını bozar → `System32\tar.exe`.
11. **Electron'da `window.prompt` yok** → `promptDialog` (`<dialog>`).

## 10. Komutlar
```bash
npm install
npm run fetch:whisper   # konuşma tanıma bileşenleri (dist bunu kendisi de çalıştırır)
npm run dev             # geliştirme
npm run lint
npm test                # birim
npm run test:e2e        # uçtan uca (gerçek Electron)
npm run dist            # release/GlassNote-Setup-<sürüm>.exe
```
Sürüm yayınlama adımları: [12-test-ve-dagitim.md](moduller/12-test-ve-dagitim.md#sürüm-yayınlama-kontrol-listesi).

## 11. Modül belgeleri
| Belge | Kapsam |
|---|---|
| [01-ana-surec.md](moduller/01-ana-surec.md) | Yaşam döngüsü, `ctx` servisleri, güvenlik kancaları, ağ kilidi |
| [02-veritabani.md](moduller/02-veritabani.md) | Şema, migration, store API, doğrulama, yedek formatı |
| [03-ipc-ve-preload.md](moduller/03-ipc-ve-preload.md) | Tüm kanallar ve olaylar, güvenlik kuralları |
| [04-pencereler-ve-widgetlar.md](moduller/04-pencereler-ve-widgetlar.md) | Pencereler, widget yöneticisi, katman modları, DPI telafisi |
| [05-tepsi-baslangic-hatirlatma.md](moduller/05-tepsi-baslangic-hatirlatma.md) | Tepsi, Windows başlangıcı, hatırlatmalar |
| [06-guncelleme.md](moduller/06-guncelleme.md) | Otomatik güncelleme |
| [07-konusma-tanima.md](moduller/07-konusma-tanima.md) | Çevrimdışı konuşarak yazma |
| [08-arayuz-ana-pencere.md](moduller/08-arayuz-ana-pencere.md) | Ana pencere modülleri, durum/çizim modeli, otomatik kaydetme |
| [09-arayuz-bilesenler.md](moduller/09-arayuz-bilesenler.md) | Ortak bileşenler, zengin editör, HTML temizleyici |
| [10-widget-arayuzu.md](moduller/10-widget-arayuzu.md) | Widget sayfası |
| [11-stil-sistemi.md](moduller/11-stil-sistemi.md) | CSS token'ları, tema, cam efekti |
| [12-test-ve-dagitim.md](moduller/12-test-ve-dagitim.md) | Testler, betikler, paketleme, sürüm yayınlama |

> Kodda bir şey değiştirdiğinde ilgili belgeyi de güncelle; belgelerle kod çelişirse **kod doğrudur**.
