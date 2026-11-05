# 11 · Stil sistemi (CSS)

## Dosyalar
| Dosya | Satır | İçerik |
|---|---|---|
| `src/renderer/styles/tokens.css` | 134 | Inter yazı tipi (yerel, `@fontsource-variable/inter`), renk/gölge/yarıçap token'ları, açık/koyu tema, cam alfa değişkenleri, reset, odak, kaydırma çubuğu, `prefers-reduced-motion` |
| `src/renderer/styles/components.css` | 229 | İkon, buton, giriş, anahtar, segment, çip, popover/menü, diyalog, toast, renk seçici, zengin metin (`.rich`, başlıklar, görev listesi), araç çubuğu, mikrofon durumları |
| `src/renderer/styles/app.css` | 289 | Ana pencere düzeni: kenar çubuğu, üst çubuk, kartlar (ızgara/liste/kompakt), boş durumlar, düzenleyici paneli, ayarlar, dar pencere (<1080 px) |
| `src/renderer/styles/widget.css` | 53 | Widget kartı |
| `src/renderer/styles/main.css` | 3 | `tokens + components + app` içe aktarımı |

## Tema
- Açık/koyu seçimi ana süreçte `nativeTheme.themeSource` ile yapılır; CSS yalnızca `@media (prefers-color-scheme: light)` ile token'ları değiştirir. Renderer'da tema kodu yok.
- Varsayılan palet: arka plan `#0F1117`, yüzey `#171B24`, vurgu `#0C60FC`, ikincil `#37B9F3`, metin `#F5F7FB` / `#A7B0C0`.

## Cam efekti
- Pencere: Windows 11 akrilik malzemesi (gerçek bulanıklık ana süreçte).
- CSS: `--glass` (0–1, `applyAppearance` ayarlar) → `--a-window`, `--a-panel`, `--a-card`, `--a-reading` (`color-mix` ile alfa). Okuma alanları her zaman ≥%90 opak → metin kontrastı korunur.
- `html.no-glass` → tamamen opak (Windows 10 veya yoğunluk 0).

## Ayarlardan gelen değişkenler (`modules/theme.js`)
`--accent`, `--on-accent` (vurgu rengine göre okunaklı metin rengi, `readableOn`), `html[data-font=small|large]` (`--fs`), `.compact` kart yoğunluğu.

## Sürükleme bölgeleri
`.drag` (`-webkit-app-region: drag`); içindeki `button/input` otomatik `no-drag`. Üst çubuk sağda 152 px Windows pencere düğmelerine ayrılır.

## Değişiklik yaparken dikkat
- Sabit renk yazma; token kullan (`var(--text)`, `var(--surface)` …) → iki tema otomatik çalışır.
- Kart giriş animasyonu `.card.enter` sınıfında; her çizimde oynamaması için yalnızca yeni kartlara eklenir.
