# 07 · Konuşarak yazma (çevrimdışı)

## Amaç
Mikrofon düğmesiyle Türkçe konuşmayı yazıya çevirip imlecin bulunduğu yere ekler. **Ses bilgisayardan çıkmaz.**

## Dosyalar
| Dosya | Satır | Görev |
|---|---|---|
| `src/renderer/components/dictation.js` | 70 | `startRecording()` → `{stop(), cancel()}`; `dictationErrorMessage(err)` |
| `src/renderer/components/rich-editor.js` | (413) | Mikrofon düğmesi ve durumları (`dictation` seçeneği) |
| `src/main/speech.js` | 92 | `available()`, `transcribe(wav)`, `cleanupStale()` |
| `scripts/fetch-whisper.mjs` | 89 | whisper.cpp + modeli indirir ve SHA-256 ile doğrular |

## Akış
1. **Kayıt (renderer):** `getUserMedia` (ses) → `AudioContext({sampleRate:16000})` (Chromium yeniden örnekler) → `ScriptProcessor` ile Float32 parçalar → durdurunca **PCM16 mono 16 kHz WAV** (`encodeWav`). 0,4 sn'den kısa kayıt → `null`.
2. **İletim:** `glassnote.speech.transcribe(ArrayBuffer)` → `speech:transcribe`.
3. **Tanıma (ana süreç):** WAV başlığı sıkı doğrulanır (RIFF/WAVE, PCM, mono, 16 kHz, 16 bit, ≤12 MB) → `%TEMP%/glassnote-stt-<uuid>.wav` (0600) → `whisper-cli.exe -m ggml-base-q8_0.bin -l tr -nt -np -t N` (`windowsHide`, 180 sn zaman aşımı) → `finally` içinde dosya silinir. İstekler sıraya alınır (aynı anda tek tanıma).
4. **Ekleme:** Kayıt başlarken saklanan seçime `insertText` ile eklenir; gerekiyorsa önüne boşluk konur.

## Arayüz
- Ana editörde ve widget'ta araç çubuğunun sonunda; durumlar: boşta / kayıtta (kırmızı, süre) / çevriliyor. `Esc` kaydı iptal eder; en fazla 3 dakika.
- Widget'ta kayıt sürerken araç çubuğu açık tutulur (`widget.css` › `:has(.mic-btn.recording)`).
- Bileşenler yoksa (`speech.available()` false) düğme hiç gösterilmez.

## Bileşenler ve dağıtım
- whisper.cpp **b4938** `whisper-bin-x64.zip` (resmî GitHub sürümü) → yalnızca `whisper-cli.exe`, `whisper.dll`, `ggml*.dll`, `ggml-cpu-*.dll`.
- Model `ggml-base-q8_0.bin` (~78 MB, çok dilli). `small` modeline göre ~5 kat hızlı, test örneğinde aynı doğruluk (10 sn ses ≈ 2 sn).
- Konum: `resources/whisper/` (**git'e girmez**, `.gitignore`); paketlemede `extraResources` → `<kurulum>/resources/whisper/`. Ana süreç yolu: paketliyse `process.resourcesPath/whisper`.
- `npm run dist` önce `fetch-whisper.mjs`'i çalıştırır (dosyalar varsa atlar). Zip açma Windows'un `System32\tar.exe`'si ile (Git Bash'in GNU tar'ı `C:` yolunu uzak sunucu sanıyor).

## İzinler
Ana süreç yalnızca uygulama sayfalarına ve yalnızca `audio` için `media` izni verir. Windows mikrofon gizlilik ayarı kapalıysa kullanıcıya yönlendirici mesaj gösterilir.

## Değişiklik yaparken dikkat
- Model/sürüm değişirse `fetch-whisper.mjs`'teki URL **ve** SHA-256 birlikte güncellenmeli; `MODEL` sabiti `speech.js`'te de var.
- Dil `-l tr` sabit; çok dilli destek istenirse ayar + argüman eklenmeli.

## İlgili testler
e2e: "konuşarak yazma…" — Windows "Microsoft Tolga" sesiyle `test/fixtures/tr-speech.ps1` WAV üretir, Chromium sahte ses aygıtı (`--use-file-for-fake-audio-capture`) ile tam zincir test edilir; Türkçe ses yüklü değilse test atlanır.
