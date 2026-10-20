// Geliştirme modu: Vite sunucusunu başlatır, ardından Electron'u ona bağlar.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electron = require('electron');

const server = await createServer({ configFile: new URL('../vite.config.mjs', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1') });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`[dev] renderer: ${url}`);

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
