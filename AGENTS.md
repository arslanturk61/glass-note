# GlassNote deposu — yapay zeka ajanları için

Bu depo GlassNote masaüstü uygulamasını içerir:

| Klasör | İçerik | Önce oku |
|---|---|---|
| `uygulama/` | Windows masaüstü uygulaması (Electron, Vanilla JS, SQLite) | `uygulama/CLAUDE.md` → `uygulama/docs/proje-rehberi.md` |

- Yerel `web-sitesi/` klasörü bu depoya **ait değildir**: ayrı ve özel bir depodur (`arslanturk61/glass-note-web`) ve burada `.gitignore` ile yok sayılır. Site üzerinde çalışırken `web-sitesi/` içindeki kendi Git deposunu ve `web-sitesi/frontend/CLAUDE.md`'yi kullan; değişiklikleri bu depoya commit etme.
- Uygulama komutları (`npm …`) `uygulama/` klasöründe çalıştırılır; kökte `package.json` yoktur.
- Uygulama belgelerindeki dosya yolları (`src/…`, `scripts/…`, `test/…`) `uygulama/` klasörüne göredir.
- Kökte yalnızca `README.md` (GitHub sayfası), `LICENSE` (MIT) ve `.gitignore` bulunur.
- Kod yorumları ve kullanıcı metinleri Türkçe.
