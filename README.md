# GlassNote

Windows için cam efektli, masaüstü widget destekli not uygulaması.
Tamamen çevrimdışı çalışır; notlarınız yalnızca kendi bilgisayarınızda saklanır.

## Özellikler

- Notlar, başlıklar (H1–H3), listeler, kategoriler, renkler, etiketler ve hatırlatmalar
- Notları masaüstünde bağımsız **widget** olarak açma: her zaman üstte veya **masaüstüne sabitli** (pencerelerin arkasında, `Win+D` ile görünür)
- **Konuşarak yazma:** Mikrofon düğmesiyle Türkçe konuşmayı yazıya çevirme — tamamen çevrimdışı, ses bilgisayardan çıkmaz
- Hızlı arama, açık/koyu tema, otomatik kaydetme
- Sistem tepsisi ve Windows ile birlikte başlatma
- JSON olarak yedekleme ve geri yükleme
- Otomatik güncelleme (ayarlardan kapatılabilir)

## Kurulum

1. [Releases](../../releases/latest) sayfasından en son **`GlassNote-Setup-x.y.z.exe`** dosyasını indirin.
2. Dosyayı çalıştırın ve kurulumu tamamlayın.
3. Windows "bilgisayarınız korundu" uyarısı verirse: **Ek bilgi › Yine de çalıştır**.

Gereksinim: Windows 10 veya 11 (64 bit). Cam efekti Windows 11'de görünür.

Yeni sürümler uygulama içinden otomatik indirilir ve uygulamadan çıkarken kurulur. Notlarınız güncellemelerde korunur.

## Kullanım

- **Yeni not:** `Ctrl + N`
- **Başlık:** Araç çubuğundaki H1/H2/H3 veya `Ctrl + Alt + 1/2/3`
- **Widget yap:** Not kartına sağ tıklayın › *Masaüstünde widget olarak aç*
- **Widget'ı taşı:** Üst şeritten sürükleyin
- **Masaüstüne sabitle:** Widget'taki ekran simgesi veya `⋯` menüsü
- **Konuşarak yaz:** Mikrofon düğmesine basın, konuşun, bitince tekrar basın (`Esc` iptal)
- **Tamamen çıkış:** Sistem tepsisindeki simgeye sağ tıklayın › *Uygulamadan çık*

## Geliştiriciler için

```bash
npm install
npm run fetch:whisper   # konuşma tanıma bileşenlerini indirir (~90 MB, SHA-256 doğrulamalı)
npm run dev     # geliştirme modu
npm test        # testler
npm run dist    # kurulum paketi (release/ klasörüne)
```

## Lisans

[MIT](LICENSE) © 2026 Abdullah. Üçüncü taraf bileşenler için: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
