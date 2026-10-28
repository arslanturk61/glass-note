# 12 · Testler, betikler ve dağıtım

## Komutlar (`package.json`)
| Komut | Ne yapar |
|---|---|
| `npm run dev` | `scripts/dev.mjs`: Vite sunucusu (127.0.0.1:5173) + Electron |
| `npm run lint` | ESLint (`eslint.config.mjs`) |
| `npm test` | Birim testleri: `test/*.test.js` (`node --test`) |
| `npm run test:e2e` | `vite build` + `test/e2e/*.e2e.js` (Playwright ile gerçek Electron) |
| `npm run fetch:whisper` | Konuşma tanıma bileşenlerini indirir/doğrular |
| `npm run icons` | `scripts/make-icons.js`: SVG'den `resources/icon.png`, `resources/icon.ico`, `resources/tray*.png` |
| `npm run dist` | fetch:whisper → vite build → `electron-builder --win nsis --x64 --publish never` → `release/` |

## Birim testleri (Node, Electron gerekmez)
- `test/db.test.js` — store, migration (v1→v2 dahil), yedek, doğrulama, `htmlToText`.
- `test/filter.test.js` — Türkçe katlama, arama, görünümler, renk, sıralama (ESM modülü `import()` ile).

## Uçtan uca testler (`test/e2e/app.e2e.js`, 17 test)
- Her test geçici `GLASSNOTE_USER_DATA` + `GLASSNOTE_TEST=1` (→ `global.__glassnote` = `ctx`) ile çalışır; gerçek kullanıcı verisine dokunmaz.
- Test başlatıcısı Chromium'a örtme kısıtlamasını kapatan anahtarlar verir (`NO_THROTTLE`); aksi hâlde başka pencerelerin arkasında kalan test penceresi çizilmez.
- `GLASSNOTE_E2E_EXE=release\win-unpacked\GlassNote.exe` → testler **paketlenmiş** uygulamaya karşı çalışır.
- `GLASSNOTE_E2E_WIND=1` → masaüstüne sabitleme testinde gerçek `Win+D` (ekrandaki pencereleri bir an küçültür).
- Windows başlangıç testi gerçek `HKCU\…\Run` kaydını yazar/okur ve `finally`'de temizler.
- Konuşma testi Türkçe Windows sesi yoksa atlanır.

## Paketleme (`package.json` › `build`)
- NSIS, x64, kullanıcı başına (yönetici izni yok), klasör seçilebilir, Türkçe (`language: 1055`), ad `GlassNote-Setup-${version}.exe`, kaldırmada veri silinmez.
- `files`: yalnızca `src/main`, `src/preload`, `src/shared`, `dist/renderer`, ikonlar, `LICENSE`, `THIRD_PARTY_NOTICES.md`.
- `asarUnpack` ikonlar (tepsi/bildirim gerçek dosya yolu ister); `extraResources` `resources/whisper` → `whisper/`.
- `electronLanguages: ['tr','en-US']` (boyut).
- Çalışma zamanı bağımlılıkları yalnızca `electron-updater` ve `koffi`.

## Sürüm yayınlama kontrol listesi
1. `package.json` › `version` artır (semver; şema değiştiyse migration ekle).
2. `npm run lint && npm test && npm run test:e2e`
3. `npm run dist` → `release/` altında `.exe`, `.exe.blockmap`, `latest.yml`.
4. (Önerilir) `GLASSNOTE_E2E_EXE=release\win-unpacked\GlassNote.exe` ile e2e.
5. Commit + `git push`.
6. `gh release create vX.Y.Z --target main --title "GlassNote vX.Y.Z" --notes-file notlar.md --latest release/GlassNote-Setup-X.Y.Z.exe release/GlassNote-Setup-X.Y.Z.exe.blockmap release/latest.yml`
   (`gh` yolu: `C:\Program Files\GitHub CLI\gh.exe`; hesap `arslanturk61`.)

## Diğer betikler
- `scripts/dev.mjs` — Vite + Electron (`VITE_DEV_SERVER_URL`).
- `scripts/make-icons.js` — Electron ile ekran dışı SVG çizimi, PNG gömülü ICO üretimi.
- `scripts/fetch-whisper.mjs` — bkz. [07](07-konusma-tanima.md).
