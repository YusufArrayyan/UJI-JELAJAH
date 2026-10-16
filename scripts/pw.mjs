// Pemuat Playwright bersama (uji antarmuka dan perekam video demo). Proyek tetap tanpa dependensi:
// playwright/playwright-core dicari di proyek, PLAYWRIGHT_CORE_PATH, lalu instalasi global npm.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE_PATH, 'playwright', 'playwright-core'];
  const prefix = dirname(process.execPath);
  for (const root of [join(prefix, 'node_modules'), join(prefix, '..', 'lib', 'node_modules')]) {
    candidates.push(join(root, 'playwright'), join(root, 'playwright-core'), join(root, '@playwright', 'cli', 'node_modules', 'playwright-core'), join(root, '@playwright', 'cli', 'node_modules', 'playwright'));
  }
  for (const c of candidates.filter(Boolean)) {
    try {
      if ((c.includes('/') || c.includes('\\')) && !existsSync(c)) continue;
      const m = require(c);
      if (m.chromium) return m;
    } catch { /* coba berikutnya */ }
  }
  return null;
}

/** Chromium bawaan Playwright; bila revisinya belum terunduh, pakai Chrome/Edge sistem atau Chromium lama yang ada. */
export async function launchBrowser(pw, extra = {}) {
  const tries = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'ms-playwright') : join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright'));
  try {
    for (const d of readdirSync(cache).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const exe of ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, d, exe))) tries.push({ executablePath: join(cache, d, exe) });
      }
    }
  } catch { /* tidak ada cache peramban */ }
  let last;
  for (const opt of tries) {
    try { return await pw.chromium.launch({ headless: true, ...opt, ...extra }); } catch (err) { last = err; }
  }
  throw last;
}
