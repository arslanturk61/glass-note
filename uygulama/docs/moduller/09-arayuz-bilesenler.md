# 09 · Ortak arayüz bileşenleri

Ana pencere ve widget tarafından paylaşılır (`src/renderer/components/`).

| Dosya | Satır | Dışa aktarılanlar | Not |
|---|---|---|---|
| `dom.js` | 63 | `h(tag, props, ...children)`, `append`, `clear(el, ...children)`, `debounce`, `readableOn(hex)` | `h` kullanıcı verisini **metin düğümü** olarak ekler; `null/false` çocukları atlar. Yerel `Element.append()` `null`'u "null" yazar — onun yerine `clear()`/`append()` kullan |
| `icons.js` | 55 | `icon(name, cls)` | Sabit SVG yolları (24×24 çizgi). Yeni ikon = `PATHS`'e ekle |
| `sanitize.js` | 96 | `sanitizeHtml`, `safeHref`, `plainTextToHtml` | Beyaz liste temizleyici (aşağıda) |
| `rich-editor.js` | 413 | `createRichEditor({placeholder, onChange, askLink, openLink, compact, dictation})` → `{el, toolbar(), setHTML, getHTML, focus, hasFocus, cancelDictation, destroy}` | Aşağıda |
| `dictation.js` | 70 | `startRecording`, `dictationErrorMessage` | Bkz. [07](07-konusma-tanima.md) |
| `popover.js` | 86 | `openPopover(anchor, content, opts)`, `openMenu(anchor, items)`, `closePopover`, `isPopoverOpen` | Dışarı tıklama/Esc ile kapanır; ok tuşlarıyla menü gezintisi |
| `dialog.js` | 60 | `openDialog(build)`, `confirmDialog`, `promptDialog` | Yerel `<dialog>` (odak hapsi, Esc). Electron'da `window.prompt` yok |
| `toast.js` | 24 | `toast(msg, {type, action, duration})` | "Geri al" gibi eylem düğmesi destekler |
| `color-picker.js` | 48 | `colorPicker({value, palette, allowAuto, autoLabel, onChange})` | Palet + yerel seçici + HEX; `null` = otomatik |
| `format.js` | 30 | `relativeTime`, `shortDateTime`, `fullDateTime`, `toLocalInput`, `fromLocalInput` | `tr-TR`; DB'de UTC, giriş alanında yerel saat |

## Zengin metin editörü (`rich-editor.js`)
- `contenteditable` + `document.execCommand` (bilinçli olarak sade; belge editörü değil).
- Araç çubuğu: H1/H2/H3 (`compact:true` iken tek döngülü "H" düğmesi) · Kalın/İtalik/Altı çizili · Madde/Numaralı/**Görev listesi** · Bağlantı · Mikrofon (`dictation` verilirse).
- Kısayollar: `Ctrl+B/I/U`, `Ctrl+K` bağlantı, `Ctrl+Alt+1/2/3` başlık, `Ctrl+Alt+0` normal metin (`e.code` ile, klavye düzeninden bağımsız). Aynı başlığa tekrar basmak normal metne döndürür.
- Görev listesi: `<ul data-type="checklist"><li data-checked="true|false">`; kutucuğa tıklama (`mousedown` sol 1.5em) durumu değiştirir.
- Bağlantılar `Ctrl+tıklama` ile `openLink` → ana süreç onay sorup tarayıcıda açar.
- Yapıştırma: HTML → `sanitizeHtml`, düz metin → `plainTextToHtml`; dosya bırakma engellenir.
- `getHTML()` her zaman temizlenmiş HTML döndürür; boşsa `''`.

## HTML temizleyici (`sanitize.js`) — XSS savunması
- `DOMParser` ile etkisiz belgede ayrıştırır, çıktıyı **sıfırdan** kurar.
- İzinli etiketler: `b strong i em u s strike p div br h1–h6 ul ol li a`; `strong→b`, `em→i`, `p→div`, `h4–h6→h3`.
- İzinli öznitelikler yalnızca: `a[href]` (http/https/mailto, `safeHref`), `ul[data-type=checklist]`, `li[data-checked]`.
- `script, style, iframe, img, svg, form…` içerikleriyle atılır; diğer bilinmeyen etiketler açılır (içerik korunur).
- İkinci savunma hattı: sayfaların CSP'si satır içi betikleri zaten engeller.

## İlgili testler
e2e: "güvenlik: zararlı HTML temizlenir…", "biçimlendirme…", "başlıklar…".
