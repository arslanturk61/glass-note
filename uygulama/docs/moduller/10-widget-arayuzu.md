# 10 · Widget penceresi arayüzü

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/renderer/widget.html` | 14 | CSP, `styles/widget.css`, `widget.js` |
| `src/renderer/widget.js` | 170 | Widget sayfası: başlık şeridi, başlık alanı, zengin editör (`compact`), kaydetme, olaylar |
| `src/renderer/styles/widget.css` | 53 | Not rengiyle tonlanmış cam kart, gizlenen araç çubuğu |

## Yapı
```
header.w-head (sürükleme alanı: -webkit-app-region: drag)
  ● renk noktası · kategori adı · [masaüstüne sabitle] [her zaman üstte] [⋯ menü] [× kapat]
input.w-title
div.w-body > .rich (editör)
footer.w-toolbar (odakta veya kayıt sürerken görünür) + kaydetme durumu
```
- **Sürükleme yalnızca başlık şeridinden**; metin alanları `no-drag` → yazarken pencere kaymaz. Başlık şeridine çift tıklama notu ana pencerede açar.
- `⋯` menüsü **yerel** (ana süreçte `Menu.popup`) → küçük pencerede kırpılmaz.

## Davranış
- Not kimliği sayfa adresinden değil, `widget:init` ile **ana süreçten** alınır (gönderen penceresinden çözülür).
- Kaydetme ana editörle aynı: 600 ms gecikme, `Ctrl+S`, `beforeunload` → `updateSync`, `app:flush`.
- Başka pencereden gelen güncelleme: kullanıcı widget'ta yazmıyorsa içerik yenilenir; yazıyorsa (veya kaydedilmemiş değişiklik varsa) yalnızca görünüm güncellenir (`look()`).
- `widget:state` olayıyla katman düğmeleri (`aria-pressed`), cam/opak sınıfı güncellenir.
- Not rengi: `note.color ?? kategori rengi ?? vurgu rengi` → `--nc` CSS değişkeni.
- Cam efekti widget başına (`glass`) + genel yoğunluk ayarı; desteklenmiyorsa `.opaque`.

## İlgili testler
e2e: "widget: bağımsız pencere…", "widget masaüstüne sabitlenir…", "başlıklar…" (widget döngüsü ve mikrofon düğmesi).
