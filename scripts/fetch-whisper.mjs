// Çevrimdışı konuşma tanıma için whisper.cpp (Windows x64, CPU) ve Türkçe destekli
// çok dilli modeli indirir: `npm run fetch:whisper`
// Dosyalar sabitlenmiş SHA-256 değerleriyle doğrulanır; uyuşmazlıkta işlem durur.
// Çıktı: resources/whisper/ (git'e girmez, kurulum paketine eklenir)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'resources', 'whisper');

const BIN = {
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-x64.zip',
  sha256: 'c2a4b60edb11f7e11a9191ffb50929535527d4d91c9903dbe3e554583bbbc63d',
};
const MODEL = {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q8_0.bin',
  sha256: 'c577b9a86e7e048a0b7eada054f4dd79a56bbfa911fbdacf900ac5b567cbb7d9',
  file: 'ggml-base-q8_0.bin',
};
const LICENSE = {
  url: 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE',
  file: 'LICENSE-whisper.cpp.txt',
};
// whisper-cli.exe ve çalışması için gereken kütüphaneler (CPU arka uçları dahil).
const KEEP = /^(whisper-cli\.exe|whisper\.dll|ggml\.dll|ggml-base\.dll|ggml-cpu-[\w-]+\.dll)$/i;

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} indirilemedi: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function verify(file, expected) {
  const got = sha256(file);
  if (got !== expected) {
    fs.rmSync(file, { force: true });
    throw new Error(`SHA-256 uyuşmuyor: ${path.basename(file)}\n  beklenen ${expected}\n  gelen    ${got}`);
  }
}

fs.mkdirSync(OUT, { recursive: true });

const modelPath = path.join(OUT, MODEL.file);
if (fs.existsSync(modelPath) && sha256(modelPath) === MODEL.sha256) {
  console.log(`✓ model zaten mevcut: ${MODEL.file}`);
} else {
  console.log(`↓ model indiriliyor (~78 MB): ${MODEL.file}`);
  await download(MODEL.url, modelPath);
  verify(modelPath, MODEL.sha256);
  console.log('✓ model doğrulandı');
}

if (fs.existsSync(path.join(OUT, 'whisper-cli.exe'))) {
  console.log('✓ whisper-cli zaten mevcut');
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glassnote-whisper-'));
  try {
    const zip = path.join(tmp, 'whisper-bin-x64.zip');
    console.log('↓ whisper.cpp indiriliyor');
    await download(BIN.url, zip);
    verify(zip, BIN.sha256);
    const ex = path.join(tmp, 'x');
    fs.mkdirSync(ex);
    // Windows'un yerleşik tar'ı (bsdtar) zip açabilir; PATH'teki GNU tar'a güvenilmez.
    execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', ex]);
    const rel = path.join(ex, 'Release');
    let n = 0;
    for (const f of fs.readdirSync(rel)) {
      if (KEEP.test(f)) {
        fs.copyFileSync(path.join(rel, f), path.join(OUT, f));
        n++;
      }
    }
    console.log(`✓ whisper.cpp doğrulandı, ${n} dosya kopyalandı`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (!fs.existsSync(path.join(OUT, LICENSE.file))) {
  await download(LICENSE.url, path.join(OUT, LICENSE.file));
}
console.log(`Hazır: ${OUT}`);
