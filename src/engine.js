// Pure deterministic simulation: seconds in, state out; no browser dependencies.
export const WEAPONS = Object.freeze({
  cannon: {name: 'Cannone', description: 'Affidabile: colpi singoli, nessun consumo energetico.', cost: 0, color: 0xffbc61},
  tesla: {name: 'Tesla', description: 'Concatena fino a 4 navi vicine. 13 energia per scarica.', cost: 100, color: 0x56e6ff},
  rail: {name: 'Railgun', description: 'Danno elevato, perfora le navi allineate. 22 energia per colpo.', cost: 180, color: 0xb6a2ff},
});

export function setWeapon(g, id) {
  if (!Object.hasOwn(WEAPONS, id) || g.phase === 'defeat') return false;
  if (!g.unlocked.includes(id)) {
    if (g.scrap < WEAPONS[id].cost) return false;
    g.scrap -= WEAPONS[id].cost;
    g.unlocked.push(id);
  }
  g.weapon = id;
  return true;
}

export function setPriority(g, id) {
  if (!['nearest', 'strongest', 'weakest'].includes(id)) return false;
  g.priority = id;
  return true;
}

export const UPGRADES = Object.freeze({
  damage: {name: 'Potenza', description: '+24% danno base per livello.', baseCost: 35},
  rate: {name: 'Cadenza', description: '+14% cadenza base per livello.', baseCost: 40},
  hull: {name: 'Corazza', description: '+28 integrità e riparazione immediata equivalente.', baseCost: 45},
  reactor: {name: 'Reattore', description: '+16 energia massima, +2,2 energia al secondo.', baseCost: 45},
  salvage: {name: 'Recupero', description: '+15% rottami dalle navi per livello.', baseCost: 40},
});

export function upgradeCost(g, id) {
  return Object.hasOwn(UPGRADES, id)
    ? Math.ceil(UPGRADES[id].baseCost * 1.42 ** g.upgrades[id]) : Infinity;
}

export function buyUpgrade(g, id) {
  const cost = upgradeCost(g, id);
  if (g.phase === 'defeat' || !Number.isFinite(cost) || g.scrap < cost || g.upgrades[id] >= 50) return false;
  g.scrap -= cost;
  g.upgrades[id]++;
  if (id === 'hull') g.hp += 28;
  if (id === 'reactor') g.energy += 16;
  g.notice = `${UPGRADES[id].name} migliorata.`;
  return true;
}

export function createGame(now = Date.now()) {
  now = bounded(now,0,8.64e15,true);
  return {
    version: 1, phase: 'ready', wave: 0, bestWave: 0, scrap: 45,
    research: 0, pendingResearch: 0, hp: 100, energy: 100, kills: 0,
    weapon: 'cannon', unlocked: ['cannon'], priority: 'nearest', autoWave: false,
    upgrades: {damage: 0, rate: 0, hull: 0, reactor: 0, salvage: 0},
    enemies: [], effects: [], time: 0, waveKills: 0, waveTotal: 0,
    spawnRemaining: 0, spawnTimer: 0, cooldown: 0, pulseCooldown: 0,
    nextId: 1, aim: null, lastSavedAt: now,
    notice: 'Stazione pronta. Avvia la prima ondata.',
  };
}

export function stats(g) {
  return {
    damage: 15 * (1 + g.upgrades.damage * 0.24) * (1 + Math.sqrt(g.research) * 0.035),
    fireRate: 1.4 * (1 + g.upgrades.rate * 0.14),
    maxHp: 100 + g.upgrades.hull * 28,
    maxEnergy: 100 + g.upgrades.reactor * 16,
    energyRegen: 11 + g.upgrades.reactor * 2.2,
    range: 26,
  };
}

export function startWave(g) {
  if (!['ready', 'intermission'].includes(g.phase) || g.hp <= 0) return false;
  g.phase = 'combat';
  g.wave++;
  g.waveKills = 0;
  g.waveTotal = Math.min(40, 5 + g.wave * 2);
  g.spawnRemaining = g.waveTotal;
  g.spawnTimer = 0;
  g.cooldown = 0;
  g.notice = `Ondata ${g.wave}: contatti in avvicinamento.`;
  return true;
}

function effect(g, kind, x, z, tx, tz, ttl = 0.22) {
  g.effects.push({id: g.nextId++, kind, x, z, tx, tz, ttl, maxTtl: ttl});
  if (g.effects.length > 160) g.effects.splice(0, g.effects.length - 160);
}

function spawn(g) {
  const index = g.waveTotal - g.spawnRemaining;
  const angle = index * 2.399963229728653 + g.wave * 0.63;
  const radius = 19 + (index % 3);
  const scale = (1 + (g.wave - 1) * 0.11) * 1.035 ** Math.max(0, g.wave - 8);
  const type = g.wave % 5 === 0 && index === 0 ? 'boss'
    : g.wave >= 4 && index % 5 === 3 ? 'armored'
    : g.wave >= 3 && index % 3 === 1 ? 'frigate' : 'skiff';
  const profile = {
    skiff: {hp:24,speed:1.05,reward:7},
    frigate: {hp:55,speed:0.78,reward:13},
    armored: {hp:85,speed:0.62,reward:20},
    boss: {hp:280,speed:0.48,reward:90 + g.wave * 4},
  }[type];
  const hp = profile.hp * scale;
  g.enemies.push({
    id: g.nextId++, type, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
    hp, maxHp: hp, speed: profile.speed, reward: profile.reward, attackCooldown: 0,
  });
  g.spawnRemaining--;
}

function reap(g) {
  g.enemies = g.enemies.filter(e => {
    if (e.hp > 0) return true;
    g.scrap = Math.min(1e9, g.scrap + Math.round(e.reward * (1 + g.upgrades.salvage * 0.15)));
    g.kills++;
    g.waveKills++;
    effect(g, 'explosion', e.x, e.z, e.x, e.z, 0.5);
    return false;
  });
}

function fire(g, s) {
  if (g.cooldown > 0) return;
  const candidates = g.enemies.filter(e => Math.hypot(e.x, e.z) <= s.range);
  const focused = g.aim && Number.isFinite(g.aim.x) && Number.isFinite(g.aim.z);
  const score = e => focused ? Math.hypot(e.x - g.aim.x, e.z - g.aim.z)
    : g.priority === 'strongest' ? -e.hp
    : g.priority === 'weakest' ? e.hp : Math.hypot(e.x, e.z);
  candidates.sort((a,b) => score(a) - score(b) || a.id - b.id);
  const target = candidates[0];
  if (!target) return;
  if (g.weapon === 'tesla') {
    if (g.energy < 13) return;
    g.energy -= 13;
    const hit = new Set();
    let current = target;
    let from = {x: 0, z: 0};
    for (let i = 0; i < 4 && current; i++) {
      hit.add(current.id);
      current.hp -= s.damage * 1.05 * 0.8 ** i;
      effect(g, 'tesla', from.x, from.z, current.x, current.z, 0.3);
      from = current;
      current = candidates.filter(e => !hit.has(e.id) && Math.hypot(e.x - from.x, e.z - from.z) <= 6)
        .sort((a,b) => Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z) || a.id-b.id)[0];
    }
    g.cooldown += 1.2 / s.fireRate;
  } else if (g.weapon === 'rail') {
    if (g.energy < 22) return;
    g.energy -= 22;
    const distance = Math.hypot(target.x, target.z) || 1;
    const dx = target.x / distance, dz = target.z / distance;
    for (const e of candidates) {
      const along = e.x * dx + e.z * dz;
      const across = Math.abs(e.x * dz - e.z * dx);
      if (e === target || (along >= 0 && along <= s.range && across <= 1.25)) e.hp -= s.damage * 3.2;
    }
    effect(g, 'rail', 0, 0, dx * s.range, dz * s.range, 0.4);
    g.cooldown += 2 / s.fireRate;
  } else {
    target.hp -= s.damage;
    effect(g, 'shot', 0, 0, target.x, target.z);
    g.cooldown += 1 / s.fireRate;
  }
  reap(g);
}

function step(g, dt) {
  const s = stats(g);
  g.time += dt;
  g.effects = g.effects.filter(e => (e.ttl -= dt) > 0);
  g.energy = Math.min(s.maxEnergy, g.energy + s.energyRegen * dt);
  g.cooldown = Math.max(0, g.cooldown - dt);
  g.pulseCooldown = Math.max(0, g.pulseCooldown - dt);
  if (g.phase !== 'combat') {
    if (g.phase === 'intermission') {
      g.spawnTimer = Math.max(0, g.spawnTimer - dt);
      if (g.autoWave && g.spawnTimer <= 0) startWave(g);
    }
    return;
  }
  g.spawnTimer -= dt;
  if (g.spawnRemaining > 0 && g.spawnTimer <= 0) {
    spawn(g);
    g.spawnTimer += Math.max(0.7, 2 - g.wave * 0.035);
  }
  reap(g);
  fire(g, s);
  for (const e of g.enemies) {
    const radius = Math.hypot(e.x, e.z);
    const move = Math.min(e.speed * dt, Math.max(0, radius - 3.5));
    if (radius > 0) { e.x *= 1 - move / radius; e.z *= 1 - move / radius; }
    e.attackCooldown -= dt;
    if (radius - move <= 3.500001 && e.attackCooldown <= 0) {
      const damage = {skiff:5,frigate:8,armored:11,boss:18}[e.type] ?? 5;
      g.hp = Math.max(0, g.hp - damage);
      e.attackCooldown = 2.2;
    }
  }
  if (g.hp <= 0) {
    g.phase = 'defeat';
    g.notice = 'Stazione perduta. Estrai la ricerca e riparti.';
    return;
  }
  if (g.spawnRemaining === 0 && g.enemies.length === 0) {
    g.phase = 'intermission';
    g.spawnTimer = 3;
    g.bestWave = Math.max(g.bestWave, g.wave);
    g.pendingResearch = Math.min(1e6,g.pendingResearch + Math.ceil(g.wave / 2) + (g.wave % 5 === 0 ? 3 : 0));
    g.hp = Math.min(s.maxHp, g.hp + s.maxHp * 0.18);
    g.energy = Math.min(s.maxEnergy, g.energy + 35);
    g.notice = `Ondata ${g.wave} completata. Migliora la stazione o estrai.`;
  }
}

export function extract(g) {
  if (g.phase === 'ready' && g.wave === 0 && g.pendingResearch === 0) return false;
  const research = Math.min(1e6, g.research + g.pendingResearch);
  const bestWave = g.bestWave;
  const nextId = g.nextId;
  const fresh = createGame(g.lastSavedAt);
  Object.assign(g, fresh, {research, bestWave, nextId, notice: 'Ricerca estratta. Nuova spedizione pronta.'});
  return true;
}

export function pulse(g) {
  if (g.phase !== 'combat' || g.energy < 60 || g.pulseCooldown > 0) return false;
  g.energy -= 60;
  g.pulseCooldown = 12;
  const s = stats(g);
  for (const e of g.enemies) if (Math.hypot(e.x,e.z) <= s.range) e.hp -= s.damage * 2.2;
  effect(g, 'pulse', 0, 0, 0, 0, 0.8);
  reap(g);
  g.notice = 'Impulso elettromagnetico!';
  return true;
}

const SAVE_FIELDS = ['version','phase','wave','bestWave','scrap','research','pendingResearch',
  'hp','energy','kills','weapon','unlocked','priority','upgrades','lastSavedAt'];

export function serializeGame(g, now = Date.now()) {
  g.lastSavedAt = bounded(now,0,8.64e15,true);
  const save = {};
  for (const key of SAVE_FIELDS) save[key] = g[key];
  return JSON.stringify(save);
}

function bounded(value, fallback, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.max(0,Math.min(max,value));
  return integer ? Math.floor(n) : n;
}

export function loadGame(json, now = Date.now()) {
  now = bounded(now,0,8.64e15,true);
  let raw;
  try {
    // Copy object input too: never retain caller-owned arrays/prototypes/accessors.
    const text = typeof json === 'string' ? json : JSON.stringify(json);
    if (typeof text !== 'string' || text.length > 200000) return createGame(now);
    raw = JSON.parse(text);
  } catch { return createGame(now); }
  const g = createGame(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return g;
  g.bestWave = bounded(raw.bestWave,0,1000,true);
  g.wave = bounded(raw.wave,0,1000,true);
  if (raw.phase === 'combat') g.wave = Math.max(0,g.wave - 1);
  g.wave = Math.min(g.wave,g.bestWave);
  g.scrap = bounded(raw.scrap,45,1e9);
  g.research = bounded(raw.research,0,1e6,true);
  g.pendingResearch = bounded(raw.pendingResearch,0,1e6,true);
  g.kills = bounded(raw.kills,0,1e9,true);
  if (raw.upgrades && typeof raw.upgrades === 'object' && !Array.isArray(raw.upgrades)) {
    for (const id of Object.keys(UPGRADES)) g.upgrades[id] = bounded(raw.upgrades[id],0,50,true);
  }
  if (Array.isArray(raw.unlocked)) {
    g.unlocked = [...new Set(['cannon',...raw.unlocked.filter(id => typeof id === 'string' && Object.hasOwn(WEAPONS,id))])];
  }
  if (g.unlocked.includes(raw.weapon)) g.weapon = raw.weapon;
  setPriority(g,raw.priority);
  const s = stats(g);
  g.hp = bounded(raw.hp,s.maxHp,s.maxHp);
  g.energy = bounded(raw.energy,s.maxEnergy,s.maxEnergy);
  g.phase = g.wave > 0 ? 'intermission' : 'ready';
  if (raw.phase === 'defeat' || g.hp <= 0) {
    g.phase = 'defeat';
    extract(g); // Exactly the same banking/reset semantics as the recovery button.
  }
  g.spawnTimer = 3;
  g.lastSavedAt = now;
  const validStamp = typeof raw.lastSavedAt === 'number' && Number.isFinite(raw.lastSavedAt) && raw.lastSavedAt >= 0;
  const elapsed = validStamp ? Math.max(0,Math.min(28800000,now - raw.lastSavedAt)) : 0;
  const salvage = g.bestWave > 0 ? Math.min(2400,Math.floor(elapsed / 60000 * Math.min(20,g.bestWave))) : 0;
  g.scrap = Math.min(1e9,g.scrap + salvage);
  g.notice = salvage > 0 ? `Recupero offline: +${salvage} rottami (massimo 8 ore).`
    : 'Spedizione ripristinata. Pronto al comando.';
  return g;
}

export function tick(g, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // Long gaps are not combat catch-up; the frontend pauses hidden tabs.
  let remaining = Math.min(dt, 1);
  while (remaining > 1e-10) {
    const delta = Math.min(remaining, 1 / 60);
    step(g, delta);
    remaining -= delta;
  }
}
