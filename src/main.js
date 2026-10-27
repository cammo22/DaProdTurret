import {
  WEAPONS,
  ABILITIES,
  SKILLS,
  createGame,
  tick,
  startWave,
  manualFire,
  useAbility,
  skillLevel,
  skillCost,
  buySkill,
  equipAbility,
  setWeapon,
  stats,
  restartGame,
  serializeGame,
  loadGame,
} from './engine.js';
import { createGameRenderer } from './renderer.js';
import { layoutSkillTree } from './skill-tree.js';
import { createAudio } from './audio.js';
import './pwa.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'daprod-turret-save-v3';
let game = createGame();
try {
  const saved =
    localStorage.getItem(SAVE_KEY) ||
    localStorage.getItem('daprod-turret-save-v2') ||
    localStorage.getItem('daprod-turret-save-v1');
  if (saved) game = loadGame(saved);
} catch {
  /* Storage may be unavailable. */
}
let paused = false;
let muted = false;
let started = game.phase !== 'ready';
let upgradesOpen = false;
let pausedBeforeUpgrades = false;
let upgradeTab = 'cannon';
let selectedSkill = 'cannonDamage';
let previousFocus;
let lastFrame = performance.now(),
  lastUI = 0,
  lastSave = 0,
  lastPhase = game.phase;
let animation,
  world,
  contextLost = false,
  treeBranch = '';
const audio = createAudio();
const weaponButtons = new Map(),
  abilityButtons = new Map(),
  tabButtons = new Map(),
  skillNodes = new Map();
const branches = {
  cannon: 'Cannone',
  tesla: 'Tesla',
  rail: 'Railgun',
  tower: 'Torre',
  abilities: 'Abilità',
};
const unlocks = {
  cannon: null,
  tesla: 'unlockTesla',
  rail: 'unlockRail',
  emp: 'unlockEmp',
  missiles: 'unlockMissiles',
  airstrike: 'unlockAirstrike',
};
const cooldowns = {
  emp: 'pulseCooldown',
  missiles: 'missileCooldown',
  airstrike: 'airstrikeCooldown',
};
const weather = {
  fog: 'Nebbia: portata ridotta',
  storm: 'Tempesta: calore e rischio fulmini',
  current: 'Correnti: deriva delle imbarcazioni',
};
const money = (value) => `${Math.floor(value || 0).toLocaleString('it-IT')} $`;
const text = (id, value) => {
  const node = $(id),
    next = String(value);
  if (node.textContent !== next) node.textContent = next;
};
const percent = (a, b) =>
  `${Math.round(Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100)))}%`;
const owned = (id) => !unlocks[id] || skillLevel(game, unlocks[id]) > 0;
const capacity = () =>
  1 +
  Number(skillLevel(game, 'slot2') > 0) +
  Number(skillLevel(game, 'slot3') > 0);
const canFight = () =>
  started &&
  !paused &&
  !upgradesOpen &&
  game.phase === 'combat' &&
  !contextLost;
const canShop = () => game.phase !== 'combat' && game.phase !== 'defeat';
const missingParents = (skill) =>
  (skill.parents || []).filter((id) => skillLevel(game, id) < 1);

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const paths = {
    cannon: 'M5 19h14M7 19v-5h10v5M10 14V4h4v10M8 4h8',
    tesla: 'M13 2L5 13h6l-1 9 9-13h-6z',
    rail: 'M7 21V3m10 18V3M10 18l2-13 2 13',
    emp: 'M8 5a8 8 0 1 0 8 0M12 2v11',
    missiles: 'M12 2l4 7v9H8V9zM8 13l-3 5h3m8-5 3 5h-3m-6 1v3m4-3v3',
    airstrike: 'M12 2v20m0-15L3 13v2l9-3 9 3v-2L12 7m0 10-4 3m4-3 4 3',
  };
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[id] || paths.cannon);
  svg.append(path);
  return svg;
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(game));
  } catch {
    /* Best effort. */
  }
}
function command(action, click = true) {
  audio.unlock();
  const result = action();
  if (result !== false) {
    if (click) audio.play('click');
    save();
  }
  updateUI();
  return result;
}
function start() {
  if (!canShop()) return false;
  closeUpgrades();
  paused = false;
  started = true;
  releaseAim();
  lastFrame = performance.now();
  return command(() => startWave(game));
}
function restart() {
  closeUpgrades();
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
  if (upgradesOpen || !canShop()) return false;
  pausedBeforeUpgrades = paused;
  paused = true;
  upgradesOpen = true;
  releaseAim();
  previousFocus = document.activeElement;
  $('upgrade-dock').hidden = false;
  updateUI();
  $('close-upgrades').focus({ preventScroll: true });
  return true;
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
function activate(id) {
  if (id && canFight()) return command(() => useAbility(game, id), false);
  return false;
}

for (const [id, weapon] of Object.entries(WEAPONS)) {
  const button = document.createElement('button');
  button.dataset.testid = `weapon-${id}`;
  const label = document.createElement('span');
  label.textContent = branches[id] || weapon.name;
  button.append(icon(id), label);
  button.addEventListener('click', () => command(() => setWeapon(game, id)));
  $('weapons').append(button);
  weaponButtons.set(id, button);
}
for (const [id, ability] of Object.entries(ABILITIES)) {
  const button = document.createElement('button');
  button.dataset.testid = `ability-${id}`;
  const label = document.createElement('span');
  label.textContent = ability.name;
  const detail = document.createElement('small');
  button.append(icon(id), label, detail);
  button.addEventListener('click', () => activate(id));
  $('abilities').append(button);
  abilityButtons.set(id, { button, detail });
}
for (const [id, name] of Object.entries(branches)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.setAttribute('role', 'tab');
  button.dataset.testid = `upgrade-tab-${id}`;
  button.addEventListener('click', () => {
    upgradeTab = id;
    selectedSkill = Object.keys(SKILLS).find(
      (key) => SKILLS[key].branch === id,
    );
    updateUI();
  });
  $('upgrade-tabs').append(button);
  tabButtons.set(id, button);
}

function renderTree() {
  if (treeBranch === upgradeTab) return;
  treeBranch = upgradeTab;
  skillNodes.clear();
  $('skill-tree').replaceChildren();
  const tree = layoutSkillTree(SKILLS, upgradeTab);
  const { width, height } = tree;
  $('skill-tree').style.width = `${width}px`;
  $('skill-tree').style.height = `${height}px`;
  $('tree-hint').hidden = width <= $('tree-scroll').clientWidth;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('tree-links');
  for (const edge of tree.edges) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', edge.path);
    path.classList.add('skill-connector');
    path.dataset.parent = edge.parent;
    svg.append(path);
  }
  $('skill-tree').append(svg);
  for (const pos of tree.nodes) {
    const id = pos.id, skill = SKILLS[id], button = document.createElement('button');
    button.className = 'skill-node';
    button.dataset.testid = `skill-${id}`;
    button.style.width = `${pos.width}px`;
    button.style.left = `${pos.x}px`;
    button.style.top = `${pos.y}px`;
    button.title = skill.name;
    const name = document.createElement('span');
    name.textContent = skill.name;
    const level = document.createElement('small'),
      cost = document.createElement('b');
    button.append(name, level, cost);
    button.addEventListener('click', () => {
      selectedSkill = id;
      updateUI();
    });
    $('skill-tree').append(button);
    skillNodes.set(id, { button, level, cost });
  }
  $('tree-scroll').scrollTop = 0;
  $('tree-scroll').scrollLeft = 0;
}
function updateWorkshop() {
  if (!upgradesOpen) return;
  renderTree();
  text('workshop-cash', money(game.cash));
  for (const [id, button] of tabButtons)
    button.setAttribute('aria-selected', String(upgradeTab === id));
  for (const [id, { button, level, cost }] of skillNodes) {
    const current = skillLevel(game, id),
      price = skillCost(game, id),
      skill = SKILLS[id];
    button.dataset.owned = String(current > 0);
    button.dataset.locked = String(missingParents(skill).length > 0);
    button.setAttribute('aria-pressed', String(selectedSkill === id));
    level.textContent =
      skill.max === 1
        ? current
          ? 'Acquistato'
          : 'Da sbloccare'
        : `Livello ${current}/${skill.max}`;
    cost.textContent = Number.isFinite(price) ? money(price) : 'Completo';
    button.setAttribute(
      'aria-label',
      `${skill.name}, ${level.textContent}, ${cost.textContent}`,
    );
  }
  for (const line of $('skill-tree').querySelectorAll('.skill-connector'))
    line.classList.toggle('owned', skillLevel(game, line.dataset.parent) > 0);
  const skill = SKILLS[selectedSkill];
  if (!skill) return;
  const current = skillLevel(game, selectedSkill),
    price = skillCost(game, selectedSkill),
    missing = missingParents(skill);
  text('skill-name', skill.name);
  text('skill-description', skill.description);
  text(
    'skill-requirements',
    missing.length
      ? `Richiede: ${missing.map((id) => SKILLS[id]?.name || id).join(', ')}`
      : !Number.isFinite(price)
        ? 'Potenziamento completo'
        : game.cash < price
          ? `Mancano ${money(price - game.cash)}`
          : 'Disponibile',
  );
  text(
    'buy-skill',
    !Number.isFinite(price) ? 'Completo' : `Acquista ${money(price)}`,
  );
  $('buy-skill').disabled =
    !canShop() ||
    missing.length > 0 ||
    game.cash < price ||
    !Number.isFinite(price);
  const ability = Object.keys(ABILITIES).find(
    (id) => unlocks[id] === selectedSkill,
  );
  $('equip-skill').hidden = !ability || current < 1;
  if (ability) {
    const equipped = game.loadout.includes(ability);
    text('equip-skill', equipped ? 'Rimuovi' : 'Equipaggia');
    $('equip-skill').disabled =
      !canShop() || (!equipped && game.loadout.length >= capacity());
  }
  const signature = `${game.loadout.join(',')}:${capacity()}`;
  if ($('loadout').dataset.state !== signature) {
    $('loadout').dataset.state = signature;
    $('loadout').replaceChildren();
    for (let i = 0; i < capacity(); i++) {
      const id = game.loadout[i],
        button = document.createElement('button');
      button.textContent = id ? ABILITIES[id].name : `Slot ${i + 1} vuoto`;
      button.setAttribute(
        'aria-label',
        id
          ? `Rimuovi ${ABILITIES[id].name}`
          : `Scegli abilità per slot ${i + 1}`,
      );
      button.addEventListener('click', () => {
        if (id) command(() => equipAbility(game, id));
        else {
          upgradeTab = 'abilities';
          selectedSkill = 'unlockEmp';
          updateUI();
        }
      });
      $('loadout').append(button);
    }
  }
  text('continue-wave', `Ondata ${game.wave + 1}`);
}
$('buy-skill').addEventListener('click', () =>
  command(() => buySkill(game, selectedSkill)),
);
$('equip-skill').addEventListener('click', () => {
  const id = Object.keys(ABILITIES).find((id) => unlocks[id] === selectedSkill);
  if (id) command(() => equipAbility(game, id));
});
$('begin').addEventListener('click', start);
$('start-wave').addEventListener('click', start);
$('continue-wave').addEventListener('click', start);
$('restart').addEventListener('click', restart);
$('pause').addEventListener('click', togglePause);
$('resume').addEventListener('click', togglePause);
$('mute').addEventListener('click', () => setMuted(!muted));
$('open-upgrades').addEventListener('click', openUpgrades);
$('close-upgrades').addEventListener('click', closeUpgrades);
$('reset-camera').addEventListener('click', () => world?.resetZoom());
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* Optional browser support. */
  }
});
window.addEventListener(
  'pointerdown',
  () => {
    if (!muted) audio.unlock();
  },
  { capture: true },
);
window.addEventListener('keydown', (event) => {
  if (!muted) audio.unlock();
  if (
    event.repeat ||
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)
  )
    return;
  if (event.code === 'Escape' && upgradesOpen) {
    closeUpgrades();
    return;
  }
  if (event.code === 'Tab' && upgradesOpen) {
    const focusable = [
      ...$('upgrade-dock').querySelectorAll(
        'button:not(:disabled),[tabindex="0"]',
      ),
    ].filter((n) => n.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    return;
  }
  if (event.code === 'KeyM') setMuted(!muted);
  if (event.code === 'KeyU') {
    event.preventDefault();
    if (upgradesOpen) closeUpgrades();
    else openUpgrades();
  }
  if (upgradesOpen) return;
  if (event.code === 'KeyP') {
    event.preventDefault();
    togglePause();
  }
  const slot = ['Space', 'KeyX', 'KeyC'].indexOf(event.code);
  if (slot >= 0) {
    event.preventDefault();
    activate(game.loadout[slot]);
  }
  if (['Digit1', 'Digit2', 'Digit3'].includes(event.code))
    command(() =>
      setWeapon(
        game,
        ['cannon', 'tesla', 'rail'][Number(event.code.slice(-1)) - 1],
      ),
    );
});
const pointers = new Map();
let pointing = false,
  gestureConsumed = false,
  pinchDistance = 0,
  touchTimer;
function releaseAim() {
  clearTimeout(touchTimer);
  pointers.clear();
  pointing = false;
  gestureConsumed = false;
  game.aim = null;
}
function aim(event, fire) {
  if (!canFight()) return;
  const point = world?.unproject(event.clientX, event.clientY);
  if (!point) return;
  game.aim = { x: point.x, z: point.z };
  if (fire) manualFire(game, point.x, point.z);
}
function fingerDistance() {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
}
$('viewport').addEventListener(
  'wheel',
  (event) => {
    if (upgradesOpen) return;
    event.preventDefault();
    world?.adjustZoom(Math.max(-0.16, Math.min(0.16, -event.deltaY * 0.001)));
  },
  { passive: false },
);
$('viewport').addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || upgradesOpen) return;
  event.preventDefault();
  pointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType,
  });
  $('viewport').setPointerCapture(event.pointerId);
  if (pointers.size >= 2) {
    clearTimeout(touchTimer);
    pointing = false;
    game.aim = null;
    game.pendingManual = null;
    gestureConsumed = true;
    pinchDistance = fingerDistance();
    return;
  }
  gestureConsumed = false;
  if (event.pointerType === 'touch') {
    touchTimer = setTimeout(() => {
      const p = [...pointers.values()][0];
      if (p && pointers.size === 1 && !gestureConsumed) {
        pointing = true;
        aim(p, true);
      }
    }, 110);
  } else {
    pointing = true;
    aim(event, true);
  }
});
$('viewport').addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType,
  });
  if (pointers.size >= 2) {
    const distance = fingerDistance();
    if (pinchDistance > 0)
      world?.adjustZoom(Math.log(Math.max(1, distance) / pinchDistance));
    pinchDistance = distance;
    return;
  }
  if (pointing && !gestureConsumed) aim(event, false);
});
function endPointer(event) {
  const point = pointers.get(event.pointerId);
  if (!point) return;
  clearTimeout(touchTimer);
  if (
    event.type === 'pointerup' &&
    point.pointerType === 'touch' &&
    !pointing &&
    !gestureConsumed
  )
    aim(point, true);
  pointers.delete(event.pointerId);
  pointing = false;
  game.aim = null;
  gestureConsumed = pointers.size > 0;
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('viewport').addEventListener(name, endPointer);
window.addEventListener('blur', releaseAim);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  releaseAim();
  lastFrame = performance.now();
  if (document.hidden) {
    save();
    audio.suspend();
    cancelAnimationFrame(animation);
    animation = undefined;
  } else {
    if (!muted) audio.resume();
    scheduleFrame();
  }
});
function updateUI() {
  const s = stats(game);
  text('wave-value', game.wave);
  text('cash-value', money(game.cash));
  text('hp-value', Math.ceil(game.hp));
  text('energy-value', Math.floor(game.energy));
  text('heat-value', percent(game.heat, s.heatCapacity));
  $('hp-bar').style.transform = `scaleX(${Math.max(0, game.hp / s.maxHp)})`;
  $('energy-bar').style.transform =
    `scaleX(${Math.max(0, game.energy / s.maxEnergy)})`;
  $('heat-bar').style.transform =
    `scaleX(${Math.max(0, Math.min(1, game.heat / s.heatCapacity))})`;
  $('tower-hud').dataset.hp = String(game.hp);
  $('tower-hud').dataset.energy = String(game.energy);
  $('tower-hud').dataset.heat = String(game.heat);
  $('tower-hud').classList.toggle('critical', game.hp < s.maxHp * 0.3);
  $('tower-hud').classList.toggle('overheated', game.overheated);
  $('overheat-status').hidden = !game.overheated;
  $('ready-screen').hidden = started || upgradesOpen;
  $('defeat').hidden = game.phase !== 'defeat';
  text('final-wave', game.wave);
  text('final-earnings', money(game.earnedMoney));
  text('high-wave', game.highWave);
  $('paused-banner').hidden =
    !paused || upgradesOpen || !started || game.phase === 'defeat';
  text('pause', paused ? '▷' : 'Ⅱ');
  $('pause').setAttribute('aria-pressed', String(paused));
  $('pause').setAttribute('aria-label', paused ? 'Riprendi' : 'Pausa');
  $('mute').setAttribute('aria-pressed', String(!muted));
  $('mute').setAttribute(
    'aria-label',
    muted ? 'Attiva audio' : 'Disattiva audio',
  );
  $('start-wave').hidden = !started || paused || upgradesOpen || !canShop();
  text('start-wave', `Ondata ${game.wave + 1}`);
  $('open-upgrades').disabled = !canShop();
  $('combat-controls')?.classList.toggle('inactive', upgradesOpen);
  for (const [id, button] of weaponButtons) {
    button.hidden = !owned(id);
    button.disabled = game.phase === 'defeat';
    button.setAttribute('aria-pressed', String(game.weapon === id));
    button.title =
      skillLevel(game, 'autofire') > 0
        ? 'Autofire attivo; tieni premuto per mirare'
        : 'Tiro manuale';
  }
  for (const [id, { button, detail }] of abilityButtons) {
    const ability = ABILITIES[id],
      cooldown = game[cooldowns[id]] || 0;
    button.hidden = !game.loadout.includes(id);
    button.disabled =
      !canFight() || cooldown > 0 || game.energy < ability.energyCost;
    detail.textContent =
      cooldown > 0 ? `${Math.ceil(cooldown)} s` : `${ability.energyCost} E`;
  }
  const boss = game.enemies.find((e) => e.type === 'boss' && e.hp > 0);
  $('boss-health').hidden = !boss;
  if (boss) {
    $('boss-bar').style.transform =
      `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
    text('boss-value', `${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    $('boss-health').setAttribute(
      'aria-valuenow',
      String(Math.round((boss.hp / boss.maxHp) * 100)),
    );
  }
  const environment = game.environment;
  $('weather-status').hidden = !environment || environment.type === 'calm';
  if (environment) text('weather-status', weather[environment.type] || '');
  updateWorkshop();
}
function positionOverlays() {
  if (!world) return;
  const position = world.project(0, 4.1);
  $('tower-hud').style.left =
    `${Math.max(100, Math.min(innerWidth - 100, position.x))}px`;
  $('tower-hud').style.top = `${Math.min(innerHeight - 150, position.y + 5)}px`;
}
try {
  world = createGameRenderer($('viewport'), {
    sound: (kind) => {
      if (!muted) audio.play(kind);
    },
  });
  world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    paused = true;
    $('render-error').hidden = false;
    updateUI();
  });
  world.renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    $('render-error').hidden = true;
    lastFrame = performance.now();
  });
} catch (error) {
  console.error('WebGL:', error);
  $('render-error').hidden = false;
}
function frame(now) {
  animation = undefined;
  if (document.hidden) return;
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (started && !paused && !upgradesOpen && !contextLost) {
    if (canFight() && pointing && game.aim && game.cooldown <= 0 && !game.charge) {
      manualFire(game, game.aim.x, game.aim.z);
    }
    tick(game, dt);
  }
  if (game.phase !== lastPhase) {
    lastPhase = game.phase;
    releaseAim();
    save();
    if (game.phase === 'upgrade') openUpgrades();
    updateUI();
  }
  if (now - lastUI >= 80) {
    updateUI();
    lastUI = now;
  }
  if (!contextLost) world?.render(game, paused || !started ? 0 : dt);
  positionOverlays();
  if (now - lastSave >= 5000 && started) {
    save();
    lastSave = now;
  }
  scheduleFrame();
}
function scheduleFrame() {
  if (animation === undefined && !document.hidden)
    animation = requestAnimationFrame(frame);
}
window.__DAPROD__ = {
  get game() {
    return game;
  },
  get paused() {
    return paused;
  },
  get muted() {
    return muted;
  },
  get renderer() {
    return world?.renderer;
  },
  get scene() {
    return world?.scene;
  },
  get camera() {
    return world?.camera;
  },
  get assetsReady() {
    return world?.assetsReady;
  },
  get zoom() {
    return world?.zoom;
  },
  project: (x, z) => world?.project(x, z),
  unproject: (x, y) => world?.unproject(x, y),
  get skillDefinitions() {
    return SKILLS;
  },
  start,
  pause: togglePause,
  save,
  openUpgrades,
  closeUpgrades,
  buy: (id) => command(() => buySkill(game, id)),
  equip: (id) => command(() => equipAbility(game, id)),
  ability: activate,
};
updateUI();
scheduleFrame();
