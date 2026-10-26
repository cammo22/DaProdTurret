import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (name) => existsSync(new URL(name, root)) ? readFileSync(new URL(name, root), 'utf8') : '';
test('Italian operation surface exposes persistent playable controls and onboarding', () => {
  const html = read('index.html');
  assert.match(html, /lang="it"/, 'Italian document is required');
  for (const id of ['viewport', 'start-wave', 'pulse', 'pause', 'mute', 'fullscreen', 'help', 'priority', 'auto-wave', 'extract', 'onboarding', 'begin', 'defeat', 'restart', 'weapons', 'upgrades']) {
    assert.ok(html.includes(`id="${id}"`), `Missing operational control: ${id}`);
  }
  assert.match(html, /src="\.\/src\/main.js"/);
  assert.doesNotMatch(html, /https?:\/\//, 'No network UI assets');
});
test('Frontend binds engine commands, safe persistence, keyboard controls and QA getter', () => {
  const source = read('src/main.js');
  for (const command of ['startWave', 'buyUpgrade', 'setWeapon', 'setPriority', 'pulse', 'extract', 'serializeGame', 'loadGame', 'upgradeCost']) {
    assert.match(source, new RegExp(`\\b${command}\\(`), `Missing engine command: ${command}`);
  }
  assert.match(source, /window\.__DAPROD__/);
  assert.match(source, /get game\(\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /pagehide/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /try\s*\{/);
  assert.match(source, /keydown/);
  assert.match(source, /pointerdown/);
  assert.match(source, /document\.hidden/);
  assert.doesNotMatch(source, /setInterval\([^]*?innerHTML/);
});
test('PWA integration uses relative install metadata and a progressive install control', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html, /href="\.\/icon-192.png"/);
  assert.match(html, /id="install-button" hidden/);
  assert.match(read('src/main.js'), /import '\.\/pwa.js'/);
  assert.match(read('src/main.js'), /loadMeshyBase\(scene\)/);
});
test('Pulse HUD correctly advertises the engine 60-energy requirement', () => {
  const source = read('src/main.js');
  assert.match(source, /game\.energy < 60/);
  assert.match(source, /60 E · scarica ad area/);
});
test('Keyboard shortcuts remain available after clicking an action button', () => {
  assert.doesNotMatch(read('src/main.js'), /INPUT\|SELECT\|TEXTAREA\|BUTTON/);
});
test('Responsive tactical surface protects touch targets and reduced motion', () => {
  const css = read('src/style.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media[^]*?max-width:\s*\d+px/);
  assert.match(css, /overflow-x:\s*hidden/);
  const source = read('src/main.js');
  assert.match(source, /OrthographicCamera/);
  assert.match(source, /WebGLRenderer/);
  assert.match(source, /setPixelRatio/);
  assert.match(source, /requestAnimationFrame/);
});
