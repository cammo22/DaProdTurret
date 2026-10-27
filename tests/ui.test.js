import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (name) =>
  existsSync(new URL(name, root))
    ? readFileSync(new URL(name, root), 'utf8')
    : '';

test('v3 world HUD uses money and heat, without scores, ammo or collectible controls', () => {
  const html = read('index.html');
  for (const id of [
    'viewport',
    'tower-hud',
    'boss-health',
    'upgrade-dock',
    'weapons',
    'heat-bar',
    'cash-value',
    'weather-status',
    'skill-tree',
    'skill-inspector',
    'loadout',
  ])
    assert.ok(html.includes(`id="${id}"`), `Missing ${id}`);
  for (const id of [
    'start-button',
    'wave-button',
    'pause-button',
    'upgrades-button',
    'close-upgrades',
    'buy-skill',
  ])
    assert.ok(html.includes(`data-testid="${id}"`));
  assert.doesNotMatch(
    html,
    /event-targets|score-value|scrap-value|ammo-bar|auto-wave|compass|research|PUNTI|AMMO|RELOAD/,
  );
  assert.match(html, /<noscript\s*>/);
  assert.match(html, /id="upgrade-dock"[^>]*hidden/);
});
test('manual fire stays literal and pinch/wheel never fire extra shots', () => {
  const source = read('src/main.js');
  assert.match(source, /manualFire\(game, point\.x, point\.z\)/);
  assert.match(source, /game\.aim = \{ x: point\.x, z: point\.z \}/);
  for (const event of ['pointerdown', 'pointermove', 'pointercancel', 'wheel'])
    assert.ok(source.includes(event));
  assert.match(source, /pointers\.size >= 2/);
  assert.match(source, /world\??\.adjustZoom/);
  assert.doesNotMatch(source, /\bcollectEvent\b|\bbuyWeaponUpgrade\b/);
});
test('real skill tree exposes prerequisites, branching connectors, purchase and loadout selection', () => {
  const source = read('src/main.js');
  for (const feature of [
    'SKILLS',
    'skillLevel',
    'skillCost',
    'buySkill(game',
    'equipAbility(game',
    'skill-connector',
    'unlockTesla',
    'unlockRail',
    'autofire',
  ])
    assert.ok(source.includes(feature), feature);
  assert.match(source, /setAttribute\('aria-selected'/);
  assert.match(source, /game\.phase === 'combat'/);
  assert.match(source, /game\.loadout/);
  assert.doesNotMatch(source, /unlockWave|game\.ammo|game\.score|game\.scrap/);
});
test('v3 migration and gesture-unlocked default audio preserve QA and PWA hooks', () => {
  const source = read('src/main.js');
  for (const v of [1, 2, 3])
    assert.ok(source.includes(`daprod-turret-save-v${v}`));
  assert.match(source, /let muted = false/);
  assert.match(source, /import '\.\/pwa.js'/);
  for (const name of ['game', 'paused', 'renderer', 'scene', 'camera', 'muted'])
    assert.match(source, new RegExp(`get ${name}\\(\\)`));
  assert.match(source, /visibilitychange/);
  assert.match(source, /pagehide/);
  assert.match(source, /if \(document\.hidden\) return/);
});
test('Hallmark floor: role tokens, no tracked uppercase, focus, reduced motion and horizontal containment', () => {
  const css = read('src/style.css');
  assert.match(css, /^\/\* Hallmark/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /100dvh/);
  assert.doesNotMatch(
    css,
    /transition:\s*all|text-transform:\s*uppercase|letter-spacing:\s*[1-9]/,
  );
});
test('audio remains silent before first gesture and handles missing devices', async () => {
  const { createAudio } = await import('../src/audio.js');
  let constructions = 0;
  const audio = createAudio(() => {
    constructions++;
    throw Error('No device');
  });
  audio.play('shot');
  assert.equal(constructions, 0);
  audio.unlock();
  assert.equal(constructions, 1);
  const source = read('src/audio.js');
  for (const s of [
    'createBufferSource',
    'createBiquadFilter',
    'createDynamicsCompressor',
  ])
    assert.ok(source.includes(s));
});
test('manual visual aim survives quick taps', async () => {
  const R = await import('../src/renderer.js');
  const shot = { x: 12, z: -8, time: 5, manual: true };
  const g = {
    time: 5.1,
    lastShot: shot,
    charge: null,
    pendingManual: null,
    aim: null,
  };
  const enemy = { x: -10, z: 3 };
  assert.equal(R.visualAim(g, enemy), shot);
  g.time = 5.5;
  assert.equal(R.visualAim(g, enemy), enemy);
});
