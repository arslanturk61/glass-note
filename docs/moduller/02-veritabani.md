# 02 · Veritabanı, doğrulama ve yedekleme

## Amaç
Tüm kalıcı veri (notlar, kategoriler, etiketler, ayarlar, widget durumları) yerel SQLite'ta. Electron'dan bağımsızdır; düz Node ile birim testlenir.

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/main/db.js` | 543 | `openStore(path)` → store API; `MIGRATIONS` |
| `src/shared/constants.js` | 65 | `APP_NAME`, `APP_ID`, `LIMITS`, `NOTE_PALETTE`, `DEFAULT_SETTINGS`, yedek formatı |
| `src/shared/validate.js` | 147 | Girdi doğrulama: `notePatch`, `categoryName`, `color`, `tags`, `setting`, `SETTING_RULES`, `ValidationError` |
| `src/shared/text.js` | 26 | `htmlToText()` — arama/önizleme için düz metin |

## Teknoloji
- `node:sqlite` (`DatabaseSync`), Electron 44 / Node 24 içinde gömülü → **native modül derlemesi yok**.
- `PRAGMA journal_mode=WAL; synchronous=FULL; foreign_keys=ON`.
- Tarihler ISO 8601 UTC metin (`new Date().toISOString()`).

## Şema (`PRAGMA user_version` = migration sayısı, şu an **2**)
| Tablo | Önemli sütunlar |
|---|---|
| `notes` | `title, content (temizlenmiş HTML), content_text (arama), category_id, color (null=kategori rengi), is_favorite, is_pinned, is_archived, deleted_at (çöp), created_at, updated_at, reminder_at, reminder_done` |
| `categories` | `name, color, sort_order` |
| `tags` / `note_tags` | Etiketler (çok-çok); sahipsiz etiketler otomatik silinir |
| `settings` | `key, value (JSON)` |
| `widget_states` | `note_id, x, y, width, height (içerik sınırları), is_open, always_on_top, desktop_pinned (v2), opacity, glass` |

**Migration kuralı:** `MIGRATIONS` dizisindeki yayımlanmış bir eleman **asla düzenlenmez**; yeni değişiklik sona yeni eleman olarak eklenir. Daha yeni bir şemayla açılırsa store veri bozulmasın diye hata verir ("Lütfen güncelleyin").

## Store API (`openStore` dönüşü)
- `notes`: `list, get, create, update(id, patch), trash, restore, destroy` (yalnızca çöpteyken), `discardIfEmpty, emptyTrash, dueReminders(iso), markReminderDone`
- `categories`: `list, create({name,color}), update, remove(id, mode, targetId)` (`mode`: `uncategorize | move | trash` — notlar asla sessizce silinmez), `reorder(ids)`
- `settings`: `all()` (varsayılanlarla birleşik, bozuk değer → varsayılan), `set(key, value)`
- `widgets`: `get, list, save(noteId, kısmiDurum)`
- Yedek: `exportData()`, `validateBackup(data)`, `importData(data, 'merge'|'replace', safetyPath)`, `snapshot(path)` (`VACUUM INTO`)
- `path`, `schemaVersion`, `close()`

## Davranış kuralları
- `update`: başlık/içerik/etiket/kategori/renk/hatırlatma değişince `updated_at` güncellenir; sabitleme/favori/arşiv güncellemez.
- Yeni `reminder_at` → `reminder_done=0` (yeniden kurulur).
- Her yama `validate.notePatch` ile doğrulanır; bilinmeyen alan → hata.

## Yedek formatı
`{ app, format: 'glassnote-backup', version: 1, exported_at, categories[], notes[] (etiketlerle), settings }`
- Doğrulama tüm dosyayı kontrol eder, ilk 20 hatayı döndürür; geçersizse **hiçbir veri değişmez**.
- `merge`: aynı adlı kategoriler birleşir, notlar yeni kimlikle eklenir.
- `replace`: önce `userData/backups/ice-aktarma-oncesi-<zaman>.db` anlık kopyası, sonra tek işlem (transaction) içinde değiştirme. Makineye özel ayarlar (pencere sınırları, `openAtLogin` vb.) içe aktarılmaz.

## Değişiklik yaparken dikkat
- **Yeni ayar:** `DEFAULT_SETTINGS` + `SETTING_RULES` (ikisi de şart), yan etki varsa `ctx.setSetting`.
- **Yeni not alanı:** migration + `rowToNote` + `notePatch` + `insertNote`/`update` + yedek doğrulama/içe aktarma.
- **Yeni widget alanı:** migration + `rowToWidget` + `widgets.save` SQL'i (bkz. v2 `desktop_pinned` örneği).

## İlgili testler
`test/db.test.js` (14 test: migration, v1→v2 yükseltme, Türkçe metin, çöp kutusu, kategori silme modları, ayarlar, widget, hatırlatma, yedek).
