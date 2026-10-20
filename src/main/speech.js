'use strict';

// Çevrimdışı konuşma → metin (whisper.cpp). Ses bilgisayardan çıkmaz: arayüzün
// kaydettiği 16 kHz WAV geçici bir dosyaya yazılır, yerel olarak çözülür ve silinir.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { app } = require('electron');

const MODEL = 'ggml-base-q8_0.bin';
const MAX_BYTES = 12 * 1024 * 1024; // ~6 dakika 16 kHz mono PCM16
const TIMEOUT = 180_000;

const dir = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'whisper')
  : path.join(app.getAppPath(), 'resources', 'whisper'));

function available() {
  return fs.existsSync(path.join(dir(), 'whisper-cli.exe')) && fs.existsSync(path.join(dir(), MODEL));
}

// Yalnızca beklenen biçim kabul edilir: RIFF/WAVE, PCM, mono, 16 kHz, 16 bit.
function validateWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.length > MAX_BYTES) throw new Error('Geçersiz ses verisi');
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Geçersiz ses biçimi');
  const fmt = buf.indexOf('fmt ', 12, 'ascii');
  if (fmt < 0) throw new Error('Geçersiz ses biçimi');
  const audioFormat = buf.readUInt16LE(fmt + 8);
  const channels = buf.readUInt16LE(fmt + 10);
  const rate = buf.readUInt32LE(fmt + 12);
  const bits = buf.readUInt16LE(fmt + 22);
  if (audioFormat !== 1 || channels !== 1 || rate !== 16000 || bits !== 16) throw new Error('Ses 16 kHz mono PCM olmalı');
}

let queue = Promise.resolve();

function run(wavPath, threads) {
  return new Promise((resolve, reject) => {
    execFile(path.join(dir(), 'whisper-cli.exe'), [
      '-m', path.join(dir(), MODEL),
      '-f', wavPath,
      '-l', 'tr',
      '-t', String(threads),
      '-nt', // zaman damgası yok
      '-np', // ilerleme çıktısı yok
    ], { cwd: dir(), windowsHide: true, timeout: TIMEOUT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(new Error(err.killed ? 'Konuşma tanıma zaman aşımına uğradı' : 'Konuşma tanıma başarısız oldu'));
      else resolve(stdout);
    });
  });
}

function transcribe(data) {
  if (!available()) return Promise.reject(new Error('Konuşma tanıma bileşenleri bulunamadı'));
  const buf = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  validateWav(buf);
  const threads = Math.max(2, Math.min(8, os.cpus().length - 2));
  // Aynı anda tek tanıma: CPU'yu boğmamak için istekler sıraya alınır.
  const job = queue.then(async () => {
    const tmp = path.join(os.tmpdir(), `glassnote-stt-${crypto.randomUUID()}.wav`);
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    try {
      const out = await run(tmp, threads);
      return out
        .replace(/\[(?:BLANK_AUDIO|MÜZİK|Müzik|MUSIC|Music)\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
  queue = job.catch(() => {});
  return job;
}

module.exports = { available, transcribe };
