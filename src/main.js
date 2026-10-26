import * as THREE from 'three';
import { WEAPONS, UPGRADES, createGame, tick, startWave, buyUpgrade, upgradeCost, setWeapon, setPriority, pulse, extract, stats, serializeGame, loadGame } from './engine.js';
import './pwa.js';
import { loadMeshyBase } from './meshy-base.js';

// The simulation owns every reward and hit. This layer only issues commands and renders.
const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'daprod-turret-save-v1';
let game = createGame();
let hasSave = false;
try {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) { game = loadGame(saved); hasSave = true; }
} catch { /* Storage can be unavailable in private browsing. The expedition still works. */ }
let paused = false;
let muted = true;
let audioContext;
let lastSound = 0;
let lastFrame = performance.now();
let lastUI = 0;
let lastSave = 0;
let lastPhase = game.phase;
let confirmation = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs = ['onboarding', 'help-dialog', 'defeat', 'confirm-dialog'].map($);
const modalOpen = () => dialogs.some((dialog) => dialog.open);
const pad = (value) => String(Math.floor(value)).padStart(2, '0');
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const text = (id, value) => { const node = $(id); if (node.textContent !== String(value)) node.textContent = value; };

function save() {
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(game));
    text('save-status', 'PROGRESSI SALVATI · SU QUESTO DISPOSITIVO');
  } catch { text('save-status', 'SALVATAGGIO NON DISPONIBILE'); }
}
function sound(kind = 'click') {
  if (muted || document.hidden) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    if (kind === 'shot' && now - lastSound < .075) return;
    lastSound = now;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const settings = { click: [660, 440, .07, .025], shot: [160, 45, .13, .04], tesla: [900, 130, .19, .025], explosion: [85, 26, .4, .065], pulse: [220, 35, .65, .075], wave: [330, 660, .3, .045] }[kind] || [660, 440, .07, .025];
    oscillator.type = kind === 'tesla' ? 'sawtooth' : kind === 'shot' || kind === 'explosion' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(settings[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
    gain.gain.setValueAtTime(settings[3], now);
    gain.gain.exponentialRampToValueAtTime(.001, now + settings[2]);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + settings[2]);
  } catch { muted = true; updateMute(); }
}
function command(action) {
  if (action() !== false) { sound(); save(); }
  updateUI();
}
function confirmAction(title, description, action) {
  confirmation = action;
  text('confirm-title', title); text('confirm-description', description);
  $('confirm-dialog').showModal();
}
function resetVisualState() {
  game.aim = null;
  lastPhase = game.phase;
  lastFrame = performance.now();
  updateUI(); save();
}
function restart() { extract(game); paused = false; $('defeat').close(); resetVisualState(); }
function togglePause() {
  paused = !paused; game.aim = null; lastFrame = performance.now();
  $('pause').setAttribute('aria-label', paused ? 'Riprendi' : 'Pausa');
  $('pause').setAttribute('aria-pressed', String(paused));
  $('pause').textContent = paused ? '▷' : 'Ⅱ';
  $('paused-banner').hidden = !paused;
  updateUI();
}
function updateMute() {
  $('mute').setAttribute('aria-label', muted ? 'Attiva audio' : 'Disattiva audio');
  $('mute').setAttribute('aria-pressed', String(!muted));
  $('mute').querySelector('.mute-slash').hidden = !muted;
}

// Persistent controls are created once, then only their values and disabled states change.
const weaponButtons = new Map();
const upgradeButtons = new Map();
const descriptions = { cannon: 'Affidabile · nessun consumo', tesla: 'Catena elettrica · energia', rail: 'Perforante · alto danno' };
const symbols = { cannon: '⏣', tesla: 'ϟ', rail: '⫽' };
Object.entries(WEAPONS).forEach(([id, weapon], index) => {
  const button = document.createElement('button');
  button.className = 'weapon-card'; button.dataset.weapon = id;
  button.setAttribute('data-testid', `weapon-${id}`);
  button.title = weapon.description;
  const icon = document.createElement('span'); icon.className = 'weapon-symbol'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = symbols[id];
  const label = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = weapon.name;
  const hotkey = document.createElement('span'); hotkey.className = 'hotkey'; hotkey.textContent = `[${index + 1}]`; title.append(hotkey);
  const description = document.createElement('small'); description.textContent = descriptions[id] || weapon.description;
  label.append(title, description);
  const cost = document.createElement('span'); cost.className = 'weapon-cost';
  button.append(icon, label, cost);
  button.addEventListener('click', () => command(() => setWeapon(game, id)));
  $('weapons').append(button); weaponButtons.set(id, { button, cost });
});
Object.entries(UPGRADES).forEach(([id, upgrade]) => {
  const row = document.createElement('div'); row.className = 'upgrade-row';
  const info = document.createElement('div'); info.className = 'upgrade-info';
  const title = document.createElement('strong'); title.textContent = upgrade.name;
  const level = document.createElement('span'); level.className = 'upgrade-level';
  title.append(level);
  const description = document.createElement('small');
  description.textContent = ({ damage: 'Più potenza per colpo', rate: 'Meno attesa tra i colpi', hull: 'Scafo rinforzato', reactor: 'Capacità e rigenerazione', salvage: 'Più rottami recuperati' })[id] || upgrade.description;
  info.append(title, description);
  const button = document.createElement('button'); button.className = 'upgrade-buy'; button.dataset.upgrade = id;
  button.setAttribute('data-testid', `upgrade-${id}`);
  button.title = upgrade.description;
  button.addEventListener('click', () => command(() => buyUpgrade(game, id)));
  row.append(info, button); $('upgrades').append(row);
  upgradeButtons.set(id, { button, level });
});

for (const [id, testId] of Object.entries({ begin: 'start-button', 'start-wave': 'wave-button', pulse: 'pulse-button', pause: 'pause-button', extract: 'extract-button' })) $(id).setAttribute('data-testid', testId);
$('start-wave').addEventListener('click', () => command(() => { const started = startWave(game); if (started) sound('wave'); return started; }));
$('pulse').addEventListener('click', () => command(() => pulse(game)));
$('pause').addEventListener('click', togglePause);
$('mute').addEventListener('click', () => { muted = !muted; updateMute(); sound(); });
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { game.notice = 'Schermo intero non disponibile su questo browser.'; updateUI(); }
});
$('priority').addEventListener('change', (event) => command(() => setPriority(game, event.target.value)));
$('auto-wave').addEventListener('change', (event) => { game.autoWave = event.target.checked; save(); updateUI(); });
$('help').addEventListener('click', () => { game.aim = null; $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => { $('help-dialog').close(); lastFrame = performance.now(); });
$('begin').addEventListener('click', () => { $('onboarding').close(); command(() => startWave(game)); lastFrame = performance.now(); });
$('restart').addEventListener('click', restart);
$('extract').addEventListener('click', () => {
  const action = () => { command(() => extract(game)); resetVisualState(); };
  if (game.pendingResearch > 0) confirmAction('Rientrare alla base?', `Porterai a casa ${number.format(game.pendingResearch)} ricerca. Rottami e potenziamenti della spedizione saranno azzerati. La ricerca estratta rafforza il danno in modo permanente.`, action);
  else confirmAction('Interrompere la spedizione?', 'Ricomincerai senza rottami e potenziamenti. La ricerca già acquisita e il record resteranno al sicuro.', action);
});
$('reset').addEventListener('click', () => confirmAction('Cancellare tutti i progressi?', 'Questo comando cancella anche ricerca e record su questo dispositivo. Non può essere annullato.', () => { game = createGame(); paused = false; resetVisualState(); }));
$('confirm-cancel').addEventListener('click', () => { confirmation = null; $('confirm-dialog').close(); });
$('confirm-accept').addEventListener('click', () => { const action = confirmation; confirmation = null; $('confirm-dialog').close(); action?.(); });
$('onboarding').addEventListener('cancel', (event) => event.preventDefault());
$('defeat').addEventListener('cancel', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  if (event.repeat || modalOpen() || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); if (!paused) command(() => pulse(game)); }
  else if (event.code === 'KeyP') { event.preventDefault(); togglePause(); }
  else if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) command(() => setWeapon(game, ['cannon', 'tesla', 'rail'][Number(event.code.slice(-1)) - 1]));
});
document.addEventListener('visibilitychange', () => { game.aim = null; lastFrame = performance.now(); if (document.hidden) { save(); audioContext?.suspend().catch(() => {}); } else if (!muted) audioContext?.resume().catch(() => {}); });
window.addEventListener('pagehide', save);
window.addEventListener('blur', () => { game.aim = null; });
dialogs.forEach((dialog) => dialog.addEventListener('close', () => { lastFrame = performance.now(); }));

function updateUI() {
  const s = stats(game);
  text('pause', paused ? '▷' : 'Ⅱ');
  $('pause').setAttribute('aria-label', paused ? 'Riprendi' : 'Pausa');
  $('pause').setAttribute('aria-pressed', String(paused));
  text('wave-value', pad(game.wave));
  text('phase-value', ({ ready: 'IN ATTESA', combat: game.wave % 5 === 0 ? 'CORAZZATA' : 'IN COMBATTIMENTO', intermission: 'SETTORE LIBERO', defeat: 'SEGNALE PERSO' })[game.phase]);
  text('hp-value', `${Math.ceil(game.hp)} / ${Math.ceil(s.maxHp)}`);
  text('energy-value', `${Math.floor(game.energy)} / ${Math.ceil(s.maxEnergy)}`);
  $('hp-bar').style.width = `${Math.max(0, game.hp / s.maxHp * 100)}%`;
  $('energy-bar').style.width = `${Math.max(0, game.energy / s.maxEnergy * 100)}%`;
  $('hp-value').closest('.meter-block').classList.toggle('critical', game.hp < s.maxHp * .3);
  text('scrap-value', number.format(game.scrap));
  const researchNode = $('research-value');
  if (researchNode.dataset.value !== `${game.research}/${game.pendingResearch}`) {
    researchNode.dataset.value = `${game.research}/${game.pendingResearch}`;
    researchNode.replaceChildren(document.createTextNode(`${number.format(game.research)} `));
    const pending = document.createElement('small'); pending.textContent = `+${number.format(game.pendingResearch)}`; researchNode.append(pending);
  }
  text('contacts', `${pad(game.enemies.length)} CONTATTI${game.spawnRemaining ? ` · ${game.spawnRemaining} IN ARRIVO` : ''}`);
  text('best-value', `RECORD ${pad(game.bestWave)}`);
  text('combat-stats', `DANNO ${Math.round(s.damage)} · CADENZA ${s.fireRate.toFixed(1)}/s`);
  text('extract-value', `+${number.format(game.pendingResearch)}`);
  text('start-label', game.phase === 'combat' ? `Ondata ${pad(game.wave)} in corso` : `Avvia ondata ${pad(game.wave + 1)}`);
  $('start-wave').disabled = paused || !['ready', 'intermission'].includes(game.phase);
  $('pulse').disabled = paused || game.phase !== 'combat' || game.energy < 60 || game.pulseCooldown > 0;
  text('pulse-detail', game.pulseCooldown > 0 ? `Ricarica ${Math.ceil(game.pulseCooldown)}s` : game.energy < 60 ? 'Energia insufficiente · 60 E' : '60 E · scarica ad area');
  $('extract').disabled = game.phase === 'defeat' || paused;
  $('priority').value = game.priority;
  $('auto-wave').checked = game.autoWave;
  for (const [id, { button, cost }] of weaponButtons) {
    const selected = game.weapon === id;
    const unlocked = game.unlocked.includes(id);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${WEAPONS[id].name}, ${selected ? 'equipaggiato' : unlocked ? 'disponibile' : `${WEAPONS[id].cost} rottami`}`);
    button.disabled = game.phase === 'defeat' || (!unlocked && game.scrap < WEAPONS[id].cost);
    cost.textContent = selected ? 'EQUIPAGGIATO' : unlocked ? 'SELEZIONA' : `${WEAPONS[id].cost} ◇`;
  }
  for (const [id, { button, level }] of upgradeButtons) {
    const cost = upgradeCost(game, id);
    level.textContent = `LV ${game.upgrades[id]}`;
    button.textContent = `${number.format(cost)} +`;
    button.disabled = game.scrap < cost || game.phase === 'defeat' || game.upgrades[id] >= 50;
    button.setAttribute('aria-label', `Potenzia ${UPGRADES[id].name}, livello ${game.upgrades[id]}, costo ${cost} rottami`);
  }
  if ($('notice').textContent !== game.notice) {
    text('notice', game.notice || 'Sistemi operativi.');
    $('notice').classList.remove('changed');
    requestAnimationFrame(() => $('notice').classList.add('changed'));
  }
  $('paused-banner').hidden = !paused;
  if (game.phase === 'defeat' && !$('defeat').open) {
    text('defeat-wave', pad(game.wave)); text('defeat-kills', number.format(game.kills));
    dialogs.filter((dialog) => dialog.open).forEach((dialog) => dialog.close());
    $('defeat').showModal(); save();
  }
}

// Procedural naval diorama: no remote assets or expensive postprocessing.
let renderer, scene, camera, ocean, turret, gun, energyRing, radar, targetMarker;
let currentWeapon = null;
let visualTime = 0;
let lastHp = game.hp;
const enemyViews = new Map();
const effectViews = new Map();
const prototypes = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const metal = new THREE.MeshStandardMaterial({ color: 0x526979, roughness: .55, metalness: .65, flatShading: true });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x192f3e, roughness: .65, metalness: .55, flatShading: true });
const edgeMetal = new THREE.MeshStandardMaterial({ color: 0x9bb2b8, roughness: .45, metalness: .7 });
const amber = new THREE.MeshStandardMaterial({ color: 0xf2b45d, emissive: 0xf19b32, emissiveIntensity: .35, roughness: .6, metalness: .3 });
const cyan = new THREE.MeshBasicMaterial({ color: 0x65e4ee });
const enemyRed = new THREE.MeshStandardMaterial({ color: 0xb44b39, roughness: .7, metalness: .4, flatShading: true });
const enemyDark = new THREE.MeshStandardMaterial({ color: 0x4a3940, roughness: .8, metalness: .4, flatShading: true });
const wakeMaterial = new THREE.MeshBasicMaterial({ color: 0x91d4d6, transparent: true, opacity: .15, side: THREE.DoubleSide, depthWrite: false });
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); parent.add(object); return object;
}
function box(parent, width, height, depth, material, x = 0, y = 0, z = 0) { return mesh(new THREE.BoxGeometry(width, height, depth), material, parent, x, y, z); }
function cylinder(parent, top, bottom, height, material, x = 0, y = 0, z = 0, segments = 12) { return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material, parent, x, y, z); }
function ring(parent, radius, tube, material, y = 0) { const object = mesh(new THREE.TorusGeometry(radius, tube, 5, 64), material, parent, 0, y); object.rotation.x = Math.PI / 2; return object; }
function makeTower() {
  const station = new THREE.Group(); station.scale.setScalar(1.1); scene.add(station);
  cylinder(station, 3.15, 3.45, .6, darkMetal, 0, .05, 0, 12);
  cylinder(station, 3.1, 3.1, .2, edgeMetal, 0, .42, 0, 12);
  cylinder(station, 2.95, 3.05, .3, metal, 0, .65, 0, 12);
  cylinder(station, 2.55, 2.55, .1, darkMetal, 0, .87, 0, 12);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const x = Math.sin(angle), z = Math.cos(angle);
    const panel = box(station, .48, .06, .5, i % 3 === 0 ? amber : metal, x * 2.8, .84, z * 2.8); panel.rotation.y = angle;
    if (i % 2 === 0) {
      cylinder(station, .1, .13, .5, edgeMetal, x * 2.9, 1.03, z * 2.9, 6);
      box(station, .17, .08, .2, cyan, x * 2.9, 1.32, z * 2.9);
      cylinder(station, .31, .4, .85, darkMetal, x * 2.8, -.25, z * 2.8, 6);
    }
  }
  cylinder(station, 1.15, 1.5, 1.2, darkMetal, 0, 1.45, 0, 10);
  cylinder(station, 1.35, 1.35, .2, amber, 0, 1.98, 0, 12);
  cylinder(station, 1.1, 1.3, .4, metal, 0, 2.2, 0, 12);
  energyRing = ring(station, 1.23, .045, cyan, 2.05);
  for (let i = 0; i < 4; i++) { const plate = box(station, .5, .8, .18, metal, Math.sin(i * Math.PI / 2) * 1.1, 1.35, Math.cos(i * Math.PI / 2) * 1.1); plate.rotation.y = i * Math.PI / 2; }
  turret = new THREE.Group(); turret.position.y = 2.65; station.add(turret);
  cylinder(turret, .8, 1.15, .55, darkMetal, 0, 0, 0, 10);
  box(turret, 1.8, .8, 1.6, metal, 0, .32);
  box(turret, 1.1, .15, 1.5, edgeMetal, 0, .8);
  box(turret, .3, .2, .4, cyan, 0, .45, -.9);
  cylinder(turret, .045, .045, 1.3, edgeMetal, -.75, 1.05, -.55, 5);
  mesh(new THREE.SphereGeometry(.1, 8, 6), amber, turret, -.75, 1.73, -.55);
  radar = new THREE.Group(); radar.position.set(.6, 1.0, -.45); turret.add(radar);
  const dish = mesh(new THREE.SphereGeometry(.43, 10, 6, 0, Math.PI * 2, 0, .7), darkMetal, radar); dish.rotation.x = -Math.PI / 3;
  ring(station, 4.0, .018, new THREE.MeshBasicMaterial({ color: 0x6aa3ac, transparent: true, opacity: .24 }), .08);
  ring(station, 13.0, .015, new THREE.MeshBasicMaterial({ color: 0x5f929f, transparent: true, opacity: .12 }), .04);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xf5bb67, transparent: true, opacity: .8 });
  targetMarker = new THREE.Group(); scene.add(targetMarker);
  ring(targetMarker, 1.2, .035, markerMaterial, .2);
  for (let i = 0; i < 4; i++) { const mark = box(targetMarker, .055, .025, .5, markerMaterial, Math.sin(i * Math.PI / 2) * 1.4, .2, Math.cos(i * Math.PI / 2) * 1.4); mark.rotation.y = i * Math.PI / 2; }
  targetMarker.visible = false;
}
function equipGun() {
  if (currentWeapon === game.weapon) return;
  if (gun) { turret.remove(gun); gun.traverse((object) => object.geometry?.dispose()); }
  currentWeapon = game.weapon;
  gun = new THREE.Group(); turret.add(gun);
  if (game.weapon === 'tesla') {
    for (const x of [-.48, .48]) {
      const barrel = cylinder(gun, .18, .27, 2.1, darkMetal, x, .3, 1.0, 8); barrel.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) { const coil = mesh(new THREE.TorusGeometry(.29, .075, 5, 14), i % 2 ? cyan : edgeMetal, gun, x, .3, .35 + i * .33); }
    }
    box(gun, .65, .25, .35, cyan, 0, .85, .2);
  } else if (game.weapon === 'rail') {
    for (const x of [-.42, .42]) { box(gun, .25, .4, 3.3, darkMetal, x, .3, 1.75); box(gun, .07, .13, 2.9, cyan, x * .72, .4, 1.8); box(gun, .35, .15, .5, edgeMetal, x, .55, 3.15); }
    box(gun, 1.0, .5, .9, metal, 0, .3, .2);
  } else {
    for (const x of [-.48, .48]) {
      const barrel = cylinder(gun, .17, .26, 2.8, darkMetal, x, .3, 1.65, 8); barrel.rotation.x = Math.PI / 2;
      const collar = cylinder(gun, .3, .3, .45, metal, x, .3, 2.7, 8); collar.rotation.x = Math.PI / 2;
      const muzzle = cylinder(gun, .19, .19, .05, amber, x, .3, 2.94, 8); muzzle.rotation.x = Math.PI / 2;
      box(gun, .4, .09, .85, amber, x, .58, .7);
    }
  }
}
function makeBoat(type) {
  if (prototypes.has(type)) return prototypes.get(type).clone(true);
  const boat = new THREE.Group();
  const size = ({ skiff: [1, 2.3, .45], frigate: [1.35, 3.3, .65], armored: [1.7, 3.8, .8], boss: [3.2, 6.5, 1.1] })[type] || [1, 2.3, .45];
  const [width, length, height] = size;
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-width / 2, -length * .44); hullShape.lineTo(width / 2, -length * .44); hullShape.lineTo(width * .55, length * .2); hullShape.lineTo(0, length * .57); hullShape.lineTo(-width * .55, length * .2); hullShape.closePath();
  const geometry = new THREE.ExtrudeGeometry(hullShape, { depth: height, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 1, steps: 1 });
  const hull = mesh(geometry, type === 'armored' ? enemyDark : enemyRed, boat, 0, .32 + height, 0); hull.rotation.x = Math.PI / 2;
  box(boat, width * .65, height * .9, length * .36, darkMetal, 0, .6 + height, -length * .07);
  box(boat, width * .6, .15, length * .15, edgeMetal, 0, height * 1.9 + .45, -length * .08);
  box(boat, width * .5, .12, .1, amber, 0, height * 1.6 + .45, length * .12);
  cylinder(boat, .045, .05, width * 1.2, darkMetal, 0, height * 2.3 + .25, -length * .2, 5);
  mesh(new THREE.SphereGeometry(.07, 5, 4), amber, boat, 0, height * 2.9 + .25, -length * .2);
  const deckGun = cylinder(boat, .2, .32, .25, metal, 0, height + .52, length * .26, 8);
  const barrel = cylinder(deckGun, .07, .1, width * .8, darkMetal, 0, .12, .4, 6); barrel.rotation.x = Math.PI / 2;
  if (type === 'armored' || type === 'boss') {
    for (const side of [-1, 1]) { box(boat, .18, .45, length * .6, metal, side * width * .49, height * .6 + .4, -.1); box(boat, .21, .1, length * .2, amber, side * width * .5, height * .7 + .6, .1); }
  }
  if (type === 'boss') {
    for (const z of [-1.5, 1.7]) {
      const mount = cylinder(boat, .5, .65, .4, enemyDark, 0, height + .7, z, 8);
      for (const x of [-.2, .2]) { const barrel = cylinder(mount, .13, .17, 1.5, metal, x, .3, .7, 6); barrel.rotation.x = Math.PI / 2; }
    }
    for (const x of [-.65, .65]) cylinder(boat, .25, .3, 1.1, darkMetal, x, height + 1.0, -.6, 8);
    box(boat, 1.5, .2, .4, amber, 0, height + 1.35, .2);
  }
  // A subtle V-shaped wake, shared geometry between all boats of this class.
  const wake = new THREE.Group(); wake.name = 'wake';
  for (const side of [-1, 1]) { const strip = mesh(new THREE.PlaneGeometry(.14, length * 1.5), wakeMaterial, wake, side * width * .8, .02, -length * .6); strip.rotation.x = -Math.PI / 2; strip.rotation.z = side * .18; }
  boat.add(wake);
  const health = new THREE.Group(); health.name = 'health'; health.position.set(0, height * 2 + 1.2, 0);
  const background = box(health, width * 1.3, .075, .08, darkMetal);
  const bar = box(health, width * 1.3, .08, .09, amber, 0, 0, .02); bar.name = 'bar';
  background.name = 'background'; boat.add(health);
  boat.userData.width = width;
  prototypes.set(type, boat);
  return boat.clone(true);
}
function makeEffect(effect) {
  const group = new THREE.Group(); group.userData.kind = effect.kind;
  const color = effect.kind === 'tesla' || effect.kind === 'pulse' ? 0x7cffff : effect.kind === 'rail' ? 0xe8ffff : 0xffbb67;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
  if (effect.kind === 'explosion') {
    group.position.set(effect.tx ?? effect.x, .6, effect.tz ?? effect.z);
    for (let i = 0; i < 8; i++) { const particle = mesh(new THREE.IcosahedronGeometry(.2 + (i % 3) * .1, 0), material, group); const angle = i / 8 * Math.PI * 2; particle.userData.direction = new THREE.Vector3(Math.cos(angle), .35 + (i % 3) * .3, Math.sin(angle)); }
    ring(group, .7, .07, material, -.4);
  } else if (effect.kind === 'pulse') {
    group.position.set(effect.x || 0, .13, effect.z || 0);
    ring(group, 1, .045, material); ring(group, .85, .018, material);
  } else {
    const source = new THREE.Vector3(effect.x ?? 0, 3.05, effect.z ?? 0);
    const destination = new THREE.Vector3(effect.tx ?? 0, .9, effect.tz ?? 0);
    if (effect.kind === 'tesla') {
      const points = [];
      for (let i = 0; i <= 10; i++) { const p = source.clone().lerp(destination, i / 10); if (i > 0 && i < 10) p.y += Math.sin(i * 7.3 + effect.id) * .7; points.push(p); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 })); group.add(line);
    } else {
      const length = source.distanceTo(destination);
      const beam = mesh(new THREE.CylinderGeometry(effect.kind === 'rail' ? .065 : .035, effect.kind === 'rail' ? .065 : .035, length, 5), material, group);
      beam.position.copy(source).add(destination).multiplyScalar(.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), destination.clone().sub(source).normalize());
    }
    mesh(new THREE.SphereGeometry(effect.kind === 'rail' ? .32 : .22, 6, 4), material, group, destination.x, destination.y, destination.z);
  }
  scene.add(group);
  sound(effect.kind === 'rail' ? 'shot' : effect.kind);
  return group;
}
function disposeEffect(view) {
  const materials = new Set();
  view.traverse((object) => { object.geometry?.dispose(); if (object.material) materials.add(object.material); });
  materials.forEach((material) => material.dispose()); scene.remove(view);
}
function initScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x102d3b);
  scene.fog = new THREE.FogExp2(0x102d3b, .009);
  camera = new THREE.OrthographicCamera(-30, 30, 25, -25, .1, 220);
  camera.position.set(29, 40, 43); camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 761 ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.domElement.setAttribute('aria-label', 'Avamposto e flotta nemica in tre dimensioni');
  $('viewport').append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xc1eafa, 0x193d50, 2.3));
  const sun = new THREE.DirectionalLight(0xffd7a1, 3.8); sun.position.set(-15, 30, 12); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5fbee3, 1.7); rim.position.set(15, 8, -20); scene.add(rim);
  const oceanMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec3 vWorld; varying float vRipple;
      void main(){vec3 p=position; float a=sin(p.x*.46+uTime*.7)*cos(p.y*.37-uTime*.5);p.z+=a*.12;vRipple=a;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float uTime; varying vec3 vWorld; varying float vRipple;
      void main(){vec2 p=vWorld.xz;float dist=length(p);float ripple=sin(p.x*1.35+p.y*.53+sin(p.y*.68+uTime*.35)*1.4-uTime*.9);float line=smoothstep(.88,1.,ripple)*.035;
      vec3 sea=mix(vec3(.027,.10,.145),vec3(.075,.21,.25),clamp(vRipple*.35+.5,0.,1.));sea+=line*vec3(.45,.85,.9);float gridX=1.-smoothstep(.015,.04,abs(fract(p.x/5.-.5)-.5));float gridZ=1.-smoothstep(.015,.04,abs(fract(p.y/5.-.5)-.5));sea+=max(gridX,gridZ)*.013*vec3(.5,.85,1.);sea=mix(sea,vec3(.063,.176,.23),smoothstep(25.,95.,dist));gl_FragColor=vec4(sea,1.);}`,
  });
  ocean = mesh(new THREE.PlaneGeometry(180, 180, 85, 85), oceanMaterial, scene); ocean.rotation.x = -Math.PI / 2; ocean.position.y = -.18;
  makeTower(); equipGun();
  // Parent-owned optional GLB decoration. A missing/unavailable asset never replaces the procedural station.
  Promise.resolve(loadMeshyBase(scene)).catch(() => {});
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.39996; const distance = 57 + (i % 4) * 8;
    const island = mesh(new THREE.ConeGeometry(4 + i % 5, 5 + i % 7, 5), new THREE.MeshStandardMaterial({ color: 0x193440, roughness: 1, flatShading: true }), scene, Math.cos(angle) * distance, -1.5, Math.sin(angle) * distance);
    island.scale.set(1.8, 1, 1.2);
  }
  const resize = () => {
    const { width, height } = $('viewport').getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(20, 23 / aspect);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 761 ? 1.5 : 2));
  };
  new ResizeObserver(resize).observe($('viewport')); resize();
  let pointing = false;
  const focus = (event) => {
    if (paused || modalOpen()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(seaPlane, aimPoint)) game.aim = { x: aimPoint.x, z: aimPoint.z };
  };
  renderer.domElement.addEventListener('pointerdown', (event) => { pointing = true; renderer.domElement.setPointerCapture(event.pointerId); focus(event); });
  renderer.domElement.addEventListener('pointermove', (event) => { if (pointing) focus(event); });
  const release = () => { pointing = false; game.aim = null; };
  renderer.domElement.addEventListener('pointerup', release);
  renderer.domElement.addEventListener('pointercancel', release);
  renderer.domElement.addEventListener('lostpointercapture', release);
  renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (!paused) togglePause(); $('render-error').hidden = false; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { $('render-error').hidden = true; });
}
function renderWorld(dt) {
  if (!renderer) return;
  equipGun();
  if (!paused && !modalOpen() && !document.hidden) visualTime += reducedMotion ? 0 : dt;
  ocean.material.uniforms.uTime.value = visualTime;
  radar.rotation.y = visualTime * .8;
  energyRing.scale.setScalar(.99 + Math.sin(visualTime * 2) * .015);
  const alive = new Set();
  let nearest = null; let distance = Infinity;
  for (const enemy of game.enemies) {
    alive.add(enemy.id);
    let view = enemyViews.get(enemy.id);
    if (!view) { view = makeBoat(enemy.type); view.scale.setScalar(1.2); enemyViews.set(enemy.id, view); scene.add(view); }
    view.position.set(enemy.x, reducedMotion ? 0 : Math.sin(visualTime * 2.1 + enemy.id) * .055, enemy.z);
    view.rotation.y = Math.atan2(-enemy.x, -enemy.z);
    view.rotation.z = reducedMotion ? 0 : Math.sin(visualTime * 1.8 + enemy.id) * .025;
    const hp = Math.max(0, enemy.hp / enemy.maxHp);
    const health = view.getObjectByName('health');
    health.visible = hp < .99 || enemy.type === 'boss' || !!game.aim;
    const bar = health.getObjectByName('bar'); bar.scale.x = hp; bar.position.x = -(1 - hp) * view.userData.width * .65;
    const d = game.aim ? Math.hypot(enemy.x - game.aim.x, enemy.z - game.aim.z) : game.priority === 'strongest' ? -enemy.hp : game.priority === 'weakest' ? enemy.hp : Math.hypot(enemy.x, enemy.z);
    if (d < distance) { distance = d; nearest = enemy; }
  }
  for (const [id, view] of enemyViews) if (!alive.has(id)) { scene.remove(view); enemyViews.delete(id); }
  const targetAngle = nearest ? Math.atan2(nearest.x, nearest.z) : Math.sin(visualTime * .17) * .55 + .4;
  turret.rotation.y += Math.atan2(Math.sin(targetAngle - turret.rotation.y), Math.cos(targetAngle - turret.rotation.y)) * Math.min(1, dt * 8);
  targetMarker.visible = !!game.aim;
  if (game.aim) { targetMarker.position.set(nearest?.x ?? game.aim.x, .02, nearest?.z ?? game.aim.z); targetMarker.rotation.y = visualTime * .4; }
  const activeEffects = new Set();
  for (const effect of game.effects) {
    activeEffects.add(effect.id);
    let view = effectViews.get(effect.id);
    if (!view) { view = makeEffect(effect); effectViews.set(effect.id, view); }
    const life = Math.min(1, Math.max(0, effect.ttl / (effect.maxTtl || .3)));
    view.traverse((object) => { if (object.material) object.material.opacity = life; });
    if (effect.kind === 'explosion') {
      const progress = 1 - life;
      view.children.forEach((child) => { if (child.userData.direction) child.position.copy(child.userData.direction).multiplyScalar(progress * 3); });
      view.scale.setScalar(.7 + progress * 2);
    } else if (effect.kind === 'pulse') view.scale.setScalar(.5 + (1 - life) * 12);
  }
  for (const [id, view] of effectViews) if (!activeEffects.has(id)) { disposeEffect(view); effectViews.delete(id); }
  if (game.hp < lastHp) { $('hp-value').closest('.meter-block').animate([{ opacity: .4 }, { opacity: 1 }], { duration: reducedMotion ? 1 : 350 }); }
  lastHp = game.hp;
  renderer.render(scene, camera);
}
try { initScene(); } catch (error) { console.error('Rendering non disponibile:', error); $('render-error').hidden = false; }
function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (!document.hidden && !paused && !modalOpen()) {
    tick(game, dt);
    if (lastPhase !== game.phase) { if (game.phase === 'intermission') sound('wave'); lastPhase = game.phase; save(); }
  }
  if (!document.hidden) renderWorld(dt);
  if (now - lastUI > 100) { updateUI(); lastUI = now; }
  if (now - lastSave > 5000 && !$('onboarding').open) { save(); lastSave = now; }
  requestAnimationFrame(frame);
}
window.__DAPROD__ = {
  get game() { return game; },
  get paused() { return paused; },
  get renderer() { return renderer; },
  start: () => command(() => startWave(game)),
  pulse: () => command(() => pulse(game)),
  pause: togglePause,
  save,
};
updateMute(); updateUI();
if (!hasSave && game.phase !== 'defeat') $('onboarding').showModal();
requestAnimationFrame(frame);
