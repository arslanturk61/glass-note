# GlassNote

Windows için cam efektli, masaüstü widget destekli not uygulaması.
Tamamen çevrimdışı çalışır; notlarınız yalnızca kendi bilgisayarınızda saklanır.

## Özellikler

- Notlar, kategoriler, renkler, etiketler ve hatırlatmalar
- Notları masaüstünde bağımsız **widget** olarak açma (her zaman üstte seçeneğiyle)
- Hızlı arama, açık/koyu tema, otomatik kaydetme
- Sistem tepsisi ve Windows ile birlikte başlatma
- JSON olarak yedekleme ve geri yükleme

## Kurulum

1. [Releases](../../releases/latest) sayfasından **`GlassNote-Setup-1.0.0.exe`** dosyasını indirin.
2. Dosyayı çalıştırın ve kurulumu tamamlayın.
3. Windows "bilgisayarınız korundu" uyarısı verirse: **Ek bilgi › Yine de çalıştır**.

Gereksinim: Windows 10 veya 11 (64 bit). Cam efekti Windows 11'de görünür.

## Kullanım

- **Yeni not:** `Ctrl + N`
- **Widget yap:** Not kartına sağ tıklayın › *Masaüstünde widget olarak aç*
- **Widget'ı taşı:** Üst şeritten sürükleyin
- **Tamamen çıkış:** Sistem tepsisindeki simgeye sağ tıklayın › *Uygulamadan çık*

## Geliştiriciler için

```bash
npm install
npm run dev     # geliştirme modu
npm test        # testler
npm run dist    # kurulum paketi (release/ klasörüne)
```

## Lisans

[MIT](LICENSE) © 2026 Abdullah. Üçüncü taraf bileşenler için: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
