# GlassNote — yapay zeka ajanları için

Kaynağı taramadan önce **`docs/proje-rehberi.md`** dosyasını oku; ihtiyacın olan ayrıntı `docs/moduller/` altındaki ilgili belgededir (rehberdeki "Hızlı harita" tablosu hangi dosyaya bakacağını söyler).

Kısa kurallar:
- Veriyi değiştiren her işlem ana süreçteki `ctx` servisinden geçer (`src/main/main.js`); renderer veriye doğrudan erişmez.
- Yeni IPC kanalı: `src/main/ipc.js` + `src/preload/preload.js`. Yeni ayar: `DEFAULT_SETTINGS` + `SETTING_RULES`.
- Veritabanı migration'ları (`src/main/db.js` › `MIGRATIONS`) asla düzenlenmez, yalnızca eklenir.
- Kod yorumları ve kullanıcı metinleri Türkçe.
- Değişiklikten sonra: `npm run lint && npm test && npm run test:e2e`; ilgili `docs/` belgesini de güncelle.
