// Mikrofondan 16 kHz mono kayıt alır ve whisper.cpp'nin beklediği PCM16 WAV'a çevirir.
// Ses yalnızca bellekte tutulur ve yerel tanıma için ana sürece verilir.

const RATE = 16000;

function encodeWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  // Chromium, mikrofonu bu bağlamın örnekleme hızına (16 kHz) kendisi dönüştürür.
  const ctx = new AudioContext({ sampleRate: RATE });
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(proc);
  proc.connect(ctx.destination); // çıkış sessizdir; yalnızca işlemenin çalışması için gerekli

  const release = () => {
    proc.onaudioprocess = null;
    source.disconnect();
    proc.disconnect();
    for (const t of stream.getTracks()) t.stop();
    ctx.close();
  };

  return {
    // Kaydı bitirir; çok kısa kayıtlarda null döner.
    stop() {
      release();
      const len = chunks.reduce((n, c) => n + c.length, 0);
      if (len < RATE * 0.4) return null;
      const all = new Float32Array(len);
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      return encodeWav(all);
    },
    cancel: release,
  };
}

export function dictationErrorMessage(err) {
  if (err?.name === 'NotAllowedError') return 'Mikrofon erişimi reddedildi. Windows Ayarlar › Gizlilik ve güvenlik › Mikrofon bölümünden masaüstü uygulamalarına izin verin.';
  if (err?.name === 'NotFoundError') return 'Mikrofon bulunamadı.';
  return err?.message ?? String(err);
}
