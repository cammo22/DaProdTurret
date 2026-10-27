import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = name => existsSync(new URL(name, root)) ? readFileSync(new URL(name, root), 'utf8') : '';

test('fullscreen game exposes the world HUD and compact in-game controls without a dashboard', () => {
  const html = read('index.html');
  for (const id of ['viewport', 'tower-hud', 'boss-health', 'upgrade-dock', 'weapons', 'event-targets']) {
    assert.ok(html.includes(`id="${id}"`), `Missing game element: ${id}`);
  }
  for (const id of ['start-button', 'wave-button', 'pulse-button', 'missile-button', 'pause-button', 'upgrades-button', 'close-upgrades']) {
    assert.ok(html.includes(`data-testid="${id}"`), `Missing control: ${id}`);
  }
  assert.doesNotMatch(html, /<aside|class="console"|compass|research|extract|Avamposto|SETTORE|PROTOCOLLO/i);
  assert.match(html, /id="boss-health"[^>]*hidden/);
  assert.match(html, /id="upgrade-dock"[^>]*hidden/);
  const css = read('src/style.css');
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /100dvh/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media[^]*max-height/);
});

test('manual shooting uses exact raycast coordinates; release clears only continuous aim', () => {
  const source = read('src/main.js');
  assert.match(source, /manualFire\(game, point\.x, point\.z\)/);
  assert.match(source, /game\.aim = \{ x: point\.x, z: point\.z \}/);
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointercancel/);
  assert.doesNotMatch(source, /pendingManual\s*=\s*null/);
  for (const action of ['launchMissiles', 'collectEvent', 'buyWeaponUpgrade', 'restartGame']) assert.match(source, new RegExp(`${action}\\(game`));
  assert.doesNotMatch(source, /\bextract\b|\bresearch\b/);
});

test('upgrade dock pauses safely, weapon trees have stable selectors and run-wave gating', () => {
  const source = read('src/main.js');
  assert.match(source, /pausedBeforeUpgrades = paused/);
  assert.match(source, /paused = true/);
  assert.match(source, /paused = pausedBeforeUpgrades/);
  assert.match(source, /WEAPON_UPGRADES/);
  assert.match(source, /`upgrade-\$\{weapon\}-\$\{id\}`/);
  assert.match(source, /game\.wave < weapon\.unlockWave/);
  assert.match(source, /Ondata \$\{weapon\.unlockWave\}/);
  assert.match(source, /game\.phase === 'upgrade'/);
});

test('QA hooks, v2 persistence, progressive PWA and default audio survive the rebuild', () => {
  const source = read('src/main.js');
  assert.match(source, /daprod-turret-save-v2/);
  assert.match(source, /daprod-turret-save-v1/);
  assert.match(source, /import '\.\/pwa.js'/);
  assert.match(source, /let muted = false/);
  for (const name of ['game', 'paused', 'renderer', 'scene', 'camera', 'muted']) assert.match(source, new RegExp(`get ${name}\\(\\)`));
  assert.match(source, /project: \(x, z\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /if \(document\.hidden\) return/);
  assert.match(source, /pagehide/);
  assert.match(source, /keydown/);
});

test('audio waits for a user gesture and has filtered noise rather than UI beeps', async () => {
  assert.ok(existsSync(new URL('src/audio.js', root)), 'Missing gesture-unlocked game audio');
  const { createAudio } = await import('../src/audio.js');
  let constructions = 0;
  const audio = createAudio(() => { constructions++; throw new Error('No audio device'); });
  audio.play('shot');
  assert.equal(constructions, 0, 'Rendering must not instantiate audio before a gesture');
  audio.unlock();
  assert.equal(constructions, 1);
  const source = read('src/audio.js');
  assert.match(source, /createBufferSource/);
  assert.match(source, /createBiquadFilter/);
  assert.match(source, /createDynamicsCompressor/);
  assert.doesNotMatch(source, /setInterval/);
});

test('fleet meshes normalize to the sea and replace actors instead of hiding under procedural hulls', async () => {
  assert.ok(existsSync(new URL('src/renderer.js', root)), 'Missing naval renderer');
  const THREE = await import('three');
  const { normalizeModel, replaceActorModel, FLEET_IDS, preloadFleet } = await import('../src/renderer.js');
  assert.deepEqual(FLEET_IDS, ['cannon', 'tesla', 'rail', 'skiff', 'frigate', 'armored', 'boss', 'submarine']);
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(60, 12, 15), new THREE.MeshStandardMaterial()));
  source.position.set(100, -20, 45);
  const prototype = normalizeModel(source, 'frigate');
  const box = new THREE.Box3().setFromObject(prototype), size = box.getSize(new THREE.Vector3());
  assert.ok(size.z > size.x, 'The long hull axis must face +Z');
  assert.ok(Math.abs(box.min.y) < .001, 'The keel rests at the normalized sea level');
  assert.ok(size.z <= 5, 'Meshy scale must not dwarf the playing field');
  assert.equal(prototype.userData.meshyAssetId, 'frigate');
  const holder = new THREE.Group(); const fallback = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); holder.add(fallback);
  const first = replaceActorModel(holder, prototype, 'frigate');
  const secondHolder = new THREE.Group(); const second = replaceActorModel(secondHolder, prototype, 'frigate');
  assert.equal(holder.children.length, 1);
  assert.equal(fallback.parent, null);
  assert.notEqual(first, second);
  let geometryA, geometryB; first.traverse(n => { if (n.isMesh) geometryA = n.geometry; }); second.traverse(n => { if (n.isMesh) geometryB = n.geometry; });
  assert.equal(geometryA, geometryB, 'Cloned boats must share GPU geometry');
  let requests = 0;
  const result = await preloadFleet({ manifestUrl: null, fetcher: () => { requests++; } });
  assert.equal(requests, 0, 'No manifest means no doomed 404 requests');
  assert.equal(result.length, 8, 'All eight preload promises settle even when assets are absent');
});

test('quick manual taps retain visual barrel aim even after the pointer is released',async()=>{
  const R=await import('../src/renderer.js');
  assert.equal(typeof R.visualAim,'function');
  const shot={x:12,z:-8,time:5,manual:true};
  const g={time:5.1,lastShot:shot,charge:null,pendingManual:null,aim:null};
  const enemy={x:-10,z:3};
  assert.equal(R.visualAim(g,enemy),shot);
  g.time=5.5;assert.equal(R.visualAim(g,enemy),enemy);
  g.charge={x:0,z:12};assert.equal(R.visualAim(g,enemy),g.charge);
});

test('renderer covers incoming threats, stun, diving, trails and visible rail charge with bounded DPR', () => {
  const source = read('src/renderer.js');
  for (const feature of ['GLTFLoader', 'Promise.allSettled', 'OrthographicCamera', 'WebGLRenderer', 'enemy-shell', 'torpedo', 'tesla-orb', 'stunnedFor', 'submerged', 'game.charge', 'prefers-reduced-motion']) {
    assert.ok(source.includes(feature), `Missing rendering path: ${feature}`);
  }
  assert.match(source, /Math\.min\([^\n]*1\.5/);
  assert.match(source, /if \(document\.hidden\) return/);
});

test('record is shown after defeat and missile HUD advertises the actual 45-energy cost',()=>{
  const html=read('index.html'),source=read('src/main.js');
  assert.ok(html.includes('id="high-score"'),'visible highscore field is required');
  assert.match(source,/text\('high-score',\s*Math\.floor\(game.highScore\)\)/);
  assert.match(source,/game.energy < 45/);
  assert.match(source,/'45 E'/);
});
