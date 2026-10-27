import { WEAPONS, UPGRADES, WEAPON_UPGRADES, createGame, tick, startWave, manualFire, pulse, launchMissiles, collectEvent, buyUpgrade, upgradeCost, buyWeaponUpgrade, weaponUpgradeCost, setWeapon, stats, restartGame, serializeGame, loadGame } from './engine.js';
import { createGameRenderer } from './renderer.js';
import { createAudio } from './audio.js';
import './pwa.js';

// Only the engine changes combat state, rewards, cooldowns and save contents.
const $ = id => document.getElementById(id);
const SAVE_KEY = 'daprod-turret-save-v2';
let game = createGame();
try {
  const saved = localStorage.getItem(SAVE_KEY) || localStorage.getItem('daprod-turret-save-v1');
  if (saved) game = loadGame(saved);
} catch { /* Storage failure does not prevent a new game. */ }
let paused = false;
let muted = false;
let started = game.phase !== 'ready';
let upgradesOpen = false;
let pausedBeforeUpgrades = false;
let upgradeTab = 'cannon';
let previousFocus;
let lastFrame = performance.now();
let lastUI = 0;
let lastSave = 0;
let lastPhase = game.phase;
let animation;
let world;
let contextLost = false;
const audio = createAudio();
const weaponButtons = new Map();
const upgradeRows = new Map();
const tabButtons = new Map();
const eventButtons = new Map();
const shortNames = { cannon: 'Cannone', tesla: 'Tesla', rail: 'Railgun' };
const symbols = { cannon: '⏣', tesla: 'ϟ', rail: '⫽' };
const labels = { hull: 'Scafo', reactor: 'Reattore', salvage: 'Recupero', damage: 'Danno', rate: 'Cadenza', magazine: 'Caricatore', bounces: 'Rimbalzi', range: 'Portata', charge: 'Carica', pierce: 'Perforazione' };
const eventNames = { supply: 'Rifornimento', repair: 'Riparazione', ammo: 'Munizioni', salvage: 'Rottami' };
const eventSymbols = { supply: '◇', repair: '+', ammo: '▰', salvage: '◇' };
const text = (id, value) => { const node = $(id); const next = String(value); if (node.textContent !== next) node.textContent = next; };
const percent = (a, b) => `${Math.max(0, Math.min(100, a / Math.max(1, b) * 100))}%`;
const canFight = () => started && !paused && !upgradesOpen && game.phase === 'combat' && !contextLost;

function save() {
  try { localStorage.setItem(SAVE_KEY, serializeGame(game)); } catch { /* Best effort in private browsing. */ }
}
function command(action, click = true) {
  audio.unlock();
  const result = action();
  if (result !== false) { if (click) audio.play('click'); save(); }
  updateUI();
  return result;
}
function start() {
  if (upgradesOpen) closeUpgrades();
  paused = false;
  started = true;
  lastFrame = performance.now();
  return command(() => startWave(game));
}
function restart() {
  if (upgradesOpen) closeUpgrades();
  restartGame(game);
  world?.reset();
  started = true;
  paused = false;
  lastPhase = game.phase;
  start();
}
function togglePause() {
  if (upgradesOpen || !started || game.phase === 'defeat') return;
  paused = !paused;
  releaseAim();
  lastFrame = performance.now();
  updateUI();
}
function openUpgrades() {
  if (upgradesOpen || game.phase === 'defeat') return;
  pausedBeforeUpgrades = paused;
  paused = true;
  upgradesOpen = true;
  releaseAim();
  previousFocus = document.activeElement;
  upgradeTab = game.weapon;
  $('upgrade-dock').hidden = false;
  updateUI();
  positionOverlays();
  $('close-upgrades').focus({ preventScroll: true });
}
function closeUpgrades() {
  if (!upgradesOpen) return;
  upgradesOpen = false;
  paused = pausedBeforeUpgrades;
  $('upgrade-dock').hidden = true;
  lastFrame = performance.now();
  previousFocus?.focus({ preventScroll: true });
  updateUI();
}
function setMuted(value) {
  muted = value;
  audio.setMuted(muted);
  if (!muted) audio.unlock();
  updateUI();
}

for (const [id, weapon] of Object.entries(WEAPONS)) {
  const button = document.createElement('button');
  button.dataset.testid = `weapon-${id}`;
  button.dataset.weapon = id;
  const icon = document.createElement('strong'); icon.textContent = symbols[id]; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = shortNames[id];
  const detail = document.createElement('small');
  button.append(icon, label, detail);
  button.addEventListener('click', () => command(() => setWeapon(game, id)));
  $('weapons').append(button);
  weaponButtons.set(id, { button, detail, weapon });
}
for (const weapon of ['cannon', 'tesla', 'rail', 'tower']) {
  const button = document.createElement('button');
  button.textContent = shortNames[weapon] || 'Torre';
  button.setAttribute('role', 'tab');
  button.dataset.testid = `upgrade-tab-${weapon}`;
  button.addEventListener('click', () => { upgradeTab = weapon; updateUI(); });
  $('upgrade-tabs').append(button);
  tabButtons.set(weapon, button);
  const tree = weapon === 'tower' ? UPGRADES : WEAPON_UPGRADES[weapon];
  for (const [id, upgrade] of Object.entries(tree)) {
    const row = document.createElement('div'); row.className = 'upgrade-row';
    const info = document.createElement('span');
    const name = document.createElement('span'); name.textContent = labels[id] || upgrade.name;
    const level = document.createElement('small'); info.append(name, level);
    const buy = document.createElement('button');
    buy.dataset.testid = weapon === 'tower' ? `upgrade-${id}` : `upgrade-${weapon}-${id}`;
    buy.title = upgrade.description;
    buy.addEventListener('click', () => command(() => weapon === 'tower' ? buyUpgrade(game, id) : buyWeaponUpgrade(game, weapon, id)));
    row.append(info, buy); $('upgrade-list').append(row);
    upgradeRows.set(`${weapon}:${id}`, { weapon, id, row, level, buy });
  }
}

$('begin').addEventListener('click', start);
$('start-wave').addEventListener('click', start);
$('continue-wave').addEventListener('click', () => { const next = game.phase === 'upgrade' || game.phase === 'ready' || game.phase === 'intermission'; closeUpgrades(); if (next) start(); });
$('restart').addEventListener('click', restart);
$('pulse').addEventListener('click', () => { if (canFight()) command(() => pulse(game), false); });
$('missile').addEventListener('click', () => { if (canFight()) command(() => launchMissiles(game), false); });
$('pause').addEventListener('click', togglePause);
$('resume').addEventListener('click', togglePause);
$('mute').addEventListener('click', () => setMuted(!muted));
$('open-upgrades').addEventListener('click', openUpgrades);
$('close-upgrades').addEventListener('click', closeUpgrades);
$('auto-wave').addEventListener('change', event => { game.autoWave = event.target.checked; save(); });
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Browser may refuse fullscreen; viewport stays fitted. */ }
});
window.addEventListener('pointerdown', () => { if (!muted) audio.unlock(); }, { capture: true });
window.addEventListener('keydown', event => {
  if (!muted) audio.unlock();
  if (event.repeat || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (event.code === 'Escape' && upgradesOpen) { closeUpgrades(); return; }
  if (event.code === 'Tab' && upgradesOpen) {
    const focusable = [...$('upgrade-dock').querySelectorAll('button:not(:disabled),input')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (event.code === 'KeyM') setMuted(!muted);
  if (event.code === 'KeyU') { event.preventDefault(); if (upgradesOpen) closeUpgrades(); else openUpgrades(); }
  if (upgradesOpen) return;
  if (event.code === 'KeyP') { event.preventDefault(); togglePause(); }
  if (event.code === 'Space') { event.preventDefault(); if (canFight()) command(() => pulse(game), false); }
  if (event.code === 'KeyX' && canFight()) command(() => launchMissiles(game), false);
  if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) command(() => setWeapon(game, ['cannon', 'tesla', 'rail'][Number(event.code.slice(-1)) - 1]));
});
let pointing = false;
let activePointer = null;
function releaseAim() { pointing = false; activePointer = null; game.aim = null; }
function aim(event, fire) {
  if (!canFight()) return;
  const point = world?.unproject(event.clientX, event.clientY);
  if (!point) return;
  // Never select a nearby ship here. Both reticle and command keep literal sea coordinates.
  game.aim = { x: point.x, z: point.z };
  if (fire) manualFire(game, point.x, point.z);
}
$('viewport').addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== null || !canFight()) return;
  event.preventDefault();
  pointing = true;
  activePointer = event.pointerId;
  $('viewport').setPointerCapture(event.pointerId);
  aim(event, true);
  updateUI();
});
$('viewport').addEventListener('pointermove', event => { if (pointing && event.pointerId === activePointer) aim(event, false); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('viewport').addEventListener(name, event => { if (event.pointerId === activePointer) releaseAim(); });
window.addEventListener('blur', releaseAim);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  releaseAim(); lastFrame = performance.now();
  if (document.hidden) { save(); audio.suspend(); cancelAnimationFrame(animation); animation = undefined; }
  else { if (!muted) audio.resume(); scheduleFrame(); }
});

function updateUI() {
  const s = stats(game);
  text('wave-value', game.wave); text('score-value', Math.floor(game.score));
  text('hp-value', Math.ceil(game.hp)); text('energy-value', Math.floor(game.energy));
  text('ammo-value', game.reloadTimer > 0 ? `${game.reloadTimer.toFixed(1)}s` : `${game.ammo}/${s.maxAmmo}`);
  text('ammo-label', game.reloadTimer > 0 ? 'RELOAD' : 'AMMO');
  $('hp-bar').style.width = percent(game.hp, s.maxHp);
  $('energy-bar').style.width = percent(game.energy, s.maxEnergy);
  $('ammo-bar').style.width = game.reloadTimer > 0 ? percent(s.reloadTime - game.reloadTimer, s.reloadTime) : percent(game.ammo, s.maxAmmo);
  $('ammo-bar').closest('.ammo').classList.toggle('reloading', game.reloadTimer > 0);
  $('tower-hud').dataset.hp = String(game.hp);
  $('tower-hud').dataset.energy = String(game.energy);
  $('tower-hud').dataset.ammo = String(game.ammo);
  $('tower-hud').classList.toggle('critical', game.hp < s.maxHp * .3);
  $('ready-screen').hidden = started || upgradesOpen;
  $('defeat').hidden = game.phase !== 'defeat';
  text('final-score', Math.floor(game.score)); text('final-wave', game.wave);
  text('high-score', Math.floor(game.highScore));
  $('paused-banner').hidden = !paused || upgradesOpen || !started || game.phase === 'defeat';
  text('pause', paused ? '▷' : 'Ⅱ');
  $('pause').setAttribute('aria-pressed', String(paused));
  $('pause').setAttribute('aria-label', paused ? 'Riprendi' : 'Pausa');
  $('mute').setAttribute('aria-pressed', String(!muted));
  $('mute').setAttribute('aria-label', muted ? 'Attiva audio' : 'Disattiva audio');
  $('start-wave').hidden = !started || paused || upgradesOpen || !['ready', 'intermission', 'upgrade'].includes(game.phase);
  text('start-wave', game.phase === 'upgrade' ? 'Continua →' : `Ondata ${game.wave + 1} →`);
  $('pulse').disabled = !canFight() || game.energy < 60 || game.pulseCooldown > 0;
  $('missile').disabled = !canFight() || game.energy < 45 || game.missileCooldown > 0 || !game.enemies.some(enemy => enemy.hp > 0 && !enemy.submerged);
  text('pulse-detail', game.pulseCooldown > 0 ? `${Math.ceil(game.pulseCooldown)}s` : '60 E');
  text('missile-detail', game.missileCooldown > 0 ? `${Math.ceil(game.missileCooldown)}s` : '45 E');
  text('scrap-compact', `${Math.floor(game.scrap)} ◇`); text('scrap-value', Math.floor(game.scrap));
  $('auto-wave').checked = game.autoWave;
  $('open-upgrades').disabled = game.phase === 'defeat';
  for (const [id, { button, detail, weapon }] of weaponButtons) {
    const locked = game.wave < weapon.unlockWave;
    button.disabled = locked || game.phase === 'defeat';
    button.setAttribute('aria-pressed', String(game.weapon === id));
    button.setAttribute('aria-label', locked ? `${shortNames[id]} · Ondata ${weapon.unlockWave}` : shortNames[id]);
    detail.textContent = locked ? `Ondata ${weapon.unlockWave}` : `${weapon.ammoCost} ammo`;
  }
  for (const [id, button] of tabButtons) button.setAttribute('aria-selected', String(upgradeTab === id));
  for (const { weapon, id, row, level, buy } of upgradeRows.values()) {
    row.hidden = weapon !== upgradeTab;
    if (row.hidden) continue;
    const current = weapon === 'tower' ? game.upgrades[id] : game.weaponUpgrades[weapon][id];
    const cost = weapon === 'tower' ? upgradeCost(game, id) : weaponUpgradeCost(game, weapon, id);
    const locked = weapon !== 'tower' && game.wave < WEAPONS[weapon].unlockWave;
    level.textContent = locked ? `Ondata ${WEAPONS[weapon].unlockWave}` : `Livello ${current}`;
    buy.textContent = `${cost} ◇ +`;
    buy.disabled = locked || game.scrap < cost || game.phase === 'defeat' || !Number.isFinite(cost);
    buy.setAttribute('aria-label', `${labels[id] || id}, livello ${current}, ${cost} rottami`);
  }
  text('continue-wave', ['upgrade', 'ready', 'intermission'].includes(game.phase) ? 'Continua →' : 'Riprendi →');
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  $('boss-health').hidden = !boss;
  if (boss) { $('boss-bar').style.width = percent(boss.hp, boss.maxHp); text('boss-value', `${Math.ceil(boss.hp)} / ${boss.maxHp}`); $('boss-health').setAttribute('aria-valuenow', String(Math.round(boss.hp / boss.maxHp * 100))); }
  for (const event of game.events) {
    let button = eventButtons.get(event.id);
    if (!button) {
      button = document.createElement('button'); button.className = 'event-target';
      button.dataset.eventId = String(event.id); button.dataset.testid = `event-${event.id}`;
      button.textContent = eventSymbols[event.type] || '◇'; button.setAttribute('aria-label', eventNames[event.type] || 'Rifornimento');
      const id = event.id;
      button.addEventListener('click', () => { if (canFight()) command(() => collectEvent(game, id)); });
      $('event-targets').append(button); eventButtons.set(id, button);
    }
    button.disabled = !canFight();
  }
  for (const [id, button] of eventButtons) if (!game.events.some(event => event.id === id)) { button.remove(); eventButtons.delete(id); }
}
function positionOverlays() {
  if (!world) return;
  const position = world.project(0, 4.1);
  $('tower-hud').style.left = `${position.x}px`;
  $('tower-hud').style.top = `${position.y + 5}px`;
  if (upgradesOpen) {
    const dock = $('upgrade-dock');
    const width = dock.offsetWidth, height = dock.offsetHeight;
    const anchor = world.project(0, 0);
    // Beside the gun on a wide screen, immediately above it in portrait; clamp inside the playing surface.
    const landscape = innerWidth > innerHeight;
    const x = landscape ? anchor.x + width * .55 + 30 : anchor.x;
    const y = landscape ? anchor.y : anchor.y - height * .5 - 32;
    dock.style.left = `${Math.max(width / 2 + 12, Math.min(innerWidth - width / 2 - 12, x))}px`;
    dock.style.top = `${Math.max(height / 2 + 60, Math.min(innerHeight - height / 2 - 85, y))}px`;
  }
  for (const event of game.events) {
    const button = eventButtons.get(event.id); if (!button) continue;
    const p = world.project(event.x, event.z);
    button.style.left = `${p.x}px`; button.style.top = `${p.y}px`;
  }
}
try {
  world = createGameRenderer($('viewport'), { sound: kind => { if (!muted) audio.play(kind); } });
  world.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; paused = true; $('render-error').hidden = false; updateUI(); });
  world.renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; $('render-error').hidden = true; lastFrame = performance.now(); });
} catch (error) { console.error('WebGL:', error); $('render-error').hidden = false; }
function frame(now) {
  animation = undefined;
  if (document.hidden) return;
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (started && !paused && !upgradesOpen && !contextLost) tick(game, dt);
  if (game.phase !== lastPhase) { lastPhase = game.phase; releaseAim(); save(); updateUI(); }
  if (now - lastUI >= 80) { updateUI(); lastUI = now; }
  if (!contextLost) world?.render(game, paused || !started ? 0 : dt);
  positionOverlays();
  if (now - lastSave >= 5000 && started) { save(); lastSave = now; }
  scheduleFrame();
}
function scheduleFrame() { if (animation === undefined && !document.hidden) animation = requestAnimationFrame(frame); }
window.__DAPROD__ = {
  get game() { return game; },
  get paused() { return paused; },
  get muted() { return muted; },
  get renderer() { return world?.renderer; },
  get scene() { return world?.scene; },
  get camera() { return world?.camera; },
  get assetsReady() { return world?.assetsReady; },
  project: (x, z) => world?.project(x, z),
  start, pause: togglePause, save,
  pulse: () => command(() => pulse(game), false),
  missiles: () => command(() => launchMissiles(game), false),
  openUpgrades, closeUpgrades,
};
updateUI();
scheduleFrame();
