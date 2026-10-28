# 06 · Otomatik güncelleme

## Dosya
`src/main/updater.js` (104 satır) — `createUpdater(ctx)` → `status(), check(), setEnabled(bool), install(), stop()`.

## Nasıl çalışır
- `electron-updater` + GitHub Releases (`package.json` › `build.publish`: `arslanturk61/glass-note`). Paket içinde `resources/app-update.yml` olarak gömülür.
- Yalnızca **paketli** uygulamada aktif; dev'de `{state:'unsupported'}`.
- Açılıştan 20 sn sonra ve 6 saatte bir denetler (`autoUpdate` ayarı kapalıysa denetlemez; elle "Şimdi denetle" yine çalışır).
- `autoDownload` + `autoInstallOnAppQuit`: arka planda indirir, çıkışta sessizce kurar. "Yeniden başlat ve kur" → `quitAndInstall(true, true)`.
- Durumlar (`app:update-status` olayı): `idle | checking | none | downloading (percent) | ready (version) | error (message) | disabled | unsupported`. Hata mesajları kullanıcı dostu Türkçeye çevrilir.
- İndirme bitince Windows bildirimi + ana pencerede "Yeniden başlat" düğmeli uyarı (`src/renderer/main.js`); durum **Ayarlar › Güncellemeler**'de.

## Gizlilik / ağ
`electron-updater` kendi oturumunu (`session.fromPartition('electron-updater')`) kullanır; bu yüzden ana oturumdaki ağ kilidi arayüz için aynen geçerli kalır. İnternete yalnızca sürüm bilgisi ve kurulum dosyası için çıkılır.

## Yayın gereksinimi
Her Release'e **üç dosya** yüklenmeli: `GlassNote-Setup-<sürüm>.exe`, `.exe.blockmap` (farklı/kısmi indirme için), `latest.yml` (sürüm bilgisi; yoksa güncelleme çalışmaz). Adımlar: [12-test-ve-dagitim.md](12-test-ve-dagitim.md).

## Bilinen sınırlar
- v1.0.0'da güncelleyici yok; o sürümdeki cihazlar bir kez elle kurmalı.
- Kod imzası yok → `publisherName` doğrulaması kapalı; SmartScreen uyarısı görülebilir.
