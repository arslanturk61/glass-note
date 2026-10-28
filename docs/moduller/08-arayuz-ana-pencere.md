# 08 · Ana pencere arayüzü

## Amaç
Not yönetim merkezi: kenar çubuğu, arama/filtre/sıralama, kart ızgarası/listesi, düzenleyici paneli ve ayarlar. Vanilla JS (ES modülleri), Vite ile paketlenir; framework yok.

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/renderer/index.html` | 14 | Katı CSP, `styles/main.css`, `main.js` |
| `src/renderer/main.js` | 284 | Giriş: veriyi yükler, yerleşimi kurar, üst çubuk, olay dinleyicileri, kısayollar |
| `modules/state.js` | 58 | Tek durum kaynağı `state`, `render()` (rAF ile toplu), `subscribe`, `upsertNotes`, `setCategories`, `VIEW_LABELS` |
| `modules/filter.js` | 65 | Saf fonksiyonlar: `fold` (Türkçe katlama), `VIEWS`, `matchesView`, `matchesSearch`, `filterNotes`, `sortNotes`, `effectiveColor` |
| `modules/actions.js` | 97 | Ortak not işlemleri: `patchNote`, `trashNote` (geri al), `restoreNote`, `destroyNote` (onaylı), `toggleWidget`, `toggleArchive`, `noteMenuItems`, `reportError` |
| `modules/sidebar.js` | 155 | Görünümler + sayılar, kategori listesi (sürükle-bırak sıralama, karta bırakarak taşıma), daraltma |
| `modules/categories.js` | 138 | Kategori diyalogları: oluştur, yeniden adlandır, renk, **sil (notlara ne olacağını sorar)**, sırala |
| `modules/notes-view.js` | 191 | Başlık satırı, kartlar (ızgara/liste), sabitlenen grubu, boş durumlar, 120'lik parçalar hâlinde çizim |
| `modules/editor-panel.js` | 371 | Not düzenleyici: başlık, meta (kategori/renk/hatırlatma), etiketler, zengin editör, otomatik kaydetme |
| `modules/settings-view.js` | 253 | Ayarlar sayfası: Görünüm, Davranış, Veriler (yedek), Güncellemeler, Hakkında |
| `modules/theme.js` | 15 | `applyAppearance(settings, {glassEnabled})` → CSS değişkenleri |

## Durum ve çizim modeli
- `state`: `info, settings, notes (Map), categories, categoriesById, widgetIds, view {type|category id}, search, color, selectedId, page ('notes'|'settings'), update`.
- Her değişiklik `render()` çağırır → bir sonraki karede tüm aboneler (kenar çubuğu, üst çubuk, not/ayar görünümü) yeniden çizilir. Klavye odağı `data-key`/`data-id`/`aria-label` ile korunur; kart giriş animasyonu yalnızca ilk görünen kartta oynar.
- Veri değişiklikleri ana süreçten olay olarak gelir (`notes:changed` vb.) ve `upsertNotes` ile uygulanır; tek doğru kaynak ana süreçtir.

## Görünümler ve arama
- Görünümler: `all, pinned, favorites, reminders, archive, trash, category`.
- Arama: başlık + içerik + kategori adı + etiketler; `fold()` ile büyük/küçük harf ve aksan duyarsız ("sirket" → "Şirket"); `#etiket` öneki yalnızca etiketlerde arar.
- Renk filtresi `effectiveColor` (not rengi, yoksa kategori rengi) üzerinden.
- Sıralama: son düzenlenen / oluşturulma / başlık (Türkçe alfabe) / kategori; "sabitlenenler önce" ayrı bayrak.

## Düzenleyici paneli (otomatik kaydetme)
- Değişiklikler `pending` yamada birikir; 600 ms sonra `notes.update`. Durum: "Kaydediliyor… / Kaydedildi / Kaydedilemedi" (hata → yama geri eklenir, "Tekrar dene").
- `autosave` kapalıysa `Ctrl+S`; not değiştirilirken/pencere gizlenirken/kapanırken yine kaydedilir.
- `beforeunload` → `flushSync()` (eşzamanlı IPC) → kapanışta veri kaybı yok.
- Yeni oluşturulup hiç yazılmadan kapatılan not `discardIfEmpty` ile silinir.
- Başka pencereden (widget) gelen güncelleme: kullanıcı bu notu düzenlemiyorsa içerik yenilenir, düzenliyorsa yalnızca meta.

## Kısayollar
`Ctrl+N` yeni not, `Ctrl+F` ara, `Ctrl+S` kaydet, `Ctrl+,` ayarlar, `Esc` düzenleyiciyi/ayarları kapat. Kartta `Enter` aç, `Delete` çöpe; sağ tık = bağlam menüsü.

## Değişiklik yaparken dikkat
- Kullanıcı verisini DOM'a her zaman `h()` ile metin olarak ekle (bkz. [09](09-arayuz-bilesenler.md)).
- Arama/sıralama mantığı `filter.js`'te saf kalmalı (birim testli).
- Yeni ayar arayüzü → `settings-view.js` içindeki `row()`/`toggle()`/`segmented()` yardımcılarını kullan.

## İlgili testler
`test/filter.test.js`; e2e: kalıcılık, çöp kutusu, kategoriler, arama, biçimlendirme, başlıklar, tema.
