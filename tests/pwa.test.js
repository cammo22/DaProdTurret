import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
test('PWA can be installed under a GitHub Pages subdirectory without remote assets', () => {
  const manifestURL = new URL('public/manifest.webmanifest', root);
  assert.ok(existsSync(manifestURL), 'PWA manifest must exist');
  const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
  assert.equal(manifest.name, 'DaProdTurret');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.type === 'image/png'));
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), 'icon path must remain relative');
    const bytes = readFileSync(new URL('public/' + icon.src, root));
    assert.equal(bytes.readUInt32BE(0), 0x89504e47, 'valid PNG signature');
  }
});

test('offline worker precaches relative build files and isolates its cache by deployment scope', async () => {
  const generator = new URL('scripts/sw-template.js', root);
  assert.ok(existsSync(generator), 'offline worker generator must exist');
  const { buildServiceWorker } = await import(generator.href);
  const worker = buildServiceWorker(['index.html', 'assets/main.js', 'manifest.webmanifest'], 'test-v1');
  assert.ok(worker.includes('assets/main.js'));
  assert.ok(worker.includes('self.registration.scope'));
  assert.ok(worker.includes("event.request.mode === 'navigate'"));
  assert.ok(worker.includes('caches.open(CACHE)'));
  assert.ok(worker.includes('ignoreVary: true'), 'static cache must tolerate preview/CDN Vary: Origin on module requests');
  assert.throws(() => buildServiceWorker(['/root.js'], 'v1'), /relative/);
  assert.throws(() => buildServiceWorker(['../outside.js'], 'v1'), /relative/);
});
