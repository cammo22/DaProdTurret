import test from 'node:test';
import assert from 'node:assert/strict';
const E = await import('../src/engine.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('new expeditions expose the contract and finite baseline stats', () => {
  assert.equal(typeof E.createGame, 'function');
  const g = E.createGame(1234);
  assert.equal(g.phase, 'ready');
  assert.equal(g.wave, 0);
  assert.equal(g.scrap, 45);
  assert.equal(g.lastSavedAt, 1234);
  assert.deepEqual(g.unlocked, ['cannon']);
  assert.deepEqual(g.upgrades, {damage:0,rate:0,hull:0,reactor:0,salvage:0});
  assert.deepEqual(g.enemies, []);
  assert.ok(E.stats(g).range > 22);
  for (const n of Object.values(E.stats(g))) assert.ok(Number.isFinite(n) && n > 0);
});

test('upgrade purchases debit exact costs and increase the relevant stat', () => {
  assert.equal(typeof E.buyUpgrade, 'function');
  const g = E.createGame();
  assert.equal(E.UPGRADES.damage.baseCost, 35);
  const old = E.stats(g).damage;
  assert.equal(E.upgradeCost(g, 'damage'), 35);
  assert.equal(E.buyUpgrade(g, 'damage'), true);
  assert.equal(g.scrap, 10);
  assert.ok(E.stats(g).damage > old);
  assert.equal(E.buyUpgrade(g, 'damage'), false);
  assert.equal(E.buyUpgrade(g, '__proto__'), false);
  g.scrap = 10000;
  for (const [id, field] of [['rate','fireRate'],['hull','maxHp'],['reactor','maxEnergy'],['salvage',null]]) {
    const before = E.stats(g);
    assert.equal(E.buyUpgrade(g, id), true);
    if (field) assert.ok(E.stats(g)[field] > before[field]);
  }
  assert.equal(g.hp, E.stats(g).maxHp);
  assert.equal(g.energy, E.stats(g).maxEnergy);
  assert.ok(E.upgradeCost(g, 'damage') > 35);
});

test('weapon unlocks cost once and invalid choices never spend scrap', () => {
  assert.equal(typeof E.setWeapon, 'function');
  const g = E.createGame();
  assert.equal(E.setWeapon(g, 'tesla'), false);
  g.scrap = 500;
  for (const [id, cost] of [['tesla',100],['rail',180],['cannon',0]]) {
    assert.equal(E.WEAPONS[id].cost, cost);
    assert.equal(typeof E.WEAPONS[id].color, 'number');
    const before = g.scrap;
    assert.equal(E.setWeapon(g, id), true);
    assert.equal(g.scrap, before - cost);
    assert.equal(E.setWeapon(g, id), true);
    assert.equal(g.scrap, before - cost);
    assert.equal(g.weapon, id);
  }
  assert.equal(new Set(g.unlocked).size, 3);
  assert.equal(E.setWeapon(g, '__proto__'), false);
  assert.equal(E.setPriority(g, 'strongest'), true);
  assert.equal(g.priority, 'strongest');
  assert.equal(E.setPriority(g, 'unknown'), false);
});

function advance(g, seconds, dt = 0.05) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) E.tick(g, dt);
}

function enemy(id, x, z, hp = 100) {
  return {id,type:'skiff',x,z,hp,maxHp:hp,speed:0,reward:7,attackCooldown:0};
}

function arena(weapon = 'cannon') {
  const g = E.createGame(0);
  E.startWave(g);
  g.spawnRemaining = 0;
  g.weapon = weapon;
  g.unlocked = ['cannon','tesla','rail'];
  return g;
}

test('first wave spawns in the sea and resolves automatically with rewards exactly once', () => {
  assert.equal(typeof E.startWave, 'function');
  assert.equal(typeof E.tick, 'function');
  const g = E.createGame(0);
  assert.equal(E.startWave(g), true);
  assert.equal(E.startWave(g), false);
  assert.equal(g.wave, 1);
  assert.equal(g.phase, 'combat');
  E.tick(g, 0.001);
  assert.equal(g.enemies.length, 1);
  assert.ok(Math.hypot(g.enemies[0].x,g.enemies[0].z) >= 18);
  assert.ok(Math.hypot(g.enemies[0].x,g.enemies[0].z) <= 22);
  assert.ok(g.effects.some(e => e.kind === 'shot'));
  advance(g, 90);
  assert.equal(g.phase, 'intermission');
  assert.equal(g.waveKills, g.waveTotal);
  assert.equal(g.kills, g.waveTotal);
  assert.equal(g.bestWave, 1);
  assert.ok(g.hp > 0);
  assert.ok(g.scrap >= 80);
  assert.ok(g.pendingResearch > 0);
  const rewards = [g.scrap,g.pendingResearch,g.kills];
  advance(g, 60);
  assert.deepEqual([g.scrap,g.pendingResearch,g.kills], rewards);
  assert.deepEqual(g.effects, []);
  assert.equal(E.buyUpgrade(g, 'damage'), true);
});

test('automatic priorities select nearest, strongest, weakest and pointer focus overrides them', () => {
  for (const [priority, aim, expected] of [
    ['nearest',null,2],['strongest',null,1],['weakest',null,3],
    ['strongest',{x:12,z:0},3],
  ]) {
    const g = arena();
    g.priority = priority;
    g.aim = aim;
    g.enemies = [enemy(1,18,0,120),enemy(2,5,0,100),enemy(3,12,0,80)];
    E.tick(g, 0.001);
    assert.equal(g.enemies.find(e=>e.id===expected).hp, {1:120,2:100,3:80}[expected] - E.stats(g).damage);
  }
});

test('tesla chains nearby ships with falloff but cannot fire without energy', () => {
  const g = arena('tesla');
  g.enemies = [enemy(1,8,0),enemy(2,10,0),enemy(3,12,0),enemy(4,14,0),enemy(5,-18,0)];
  E.tick(g, 0.001);
  assert.ok(g.enemies.slice(0,4).every(e => e.hp < 100));
  assert.equal(g.enemies[4].hp, 100);
  assert.ok(g.enemies[0].hp < g.enemies[3].hp);
  assert.equal(g.energy, 87); // Regeneration at full capacity is discarded before firing.
  assert.equal(g.effects.filter(e => e.kind === 'tesla').length, 4);
  g.energy = 0;
  g.cooldown = 0;
  const hp = g.enemies.map(e=>e.hp);
  E.tick(g, 0.001);
  assert.deepEqual(g.enemies.map(e=>e.hp), hp);
  assert.ok(g.energy >= 0);
  advance(g, 2);
  assert.ok(g.enemies[0].hp < hp[0]);
});

test('rail pierces the firing line, deals heavy damage and spends energy', () => {
  const g = arena('rail');
  g.enemies = [enemy(1,8,0),enemy(2,12,0.4),enemy(3,16,3),enemy(4,-8,0)];
  g.aim = {x:8,z:0};
  E.tick(g, 0.001);
  assert.equal(g.enemies[0].hp, 100 - E.stats(g).damage * 3.2);
  assert.ok(g.enemies[1].hp < 100);
  assert.equal(g.enemies[2].hp, 100);
  assert.equal(g.enemies[3].hp, 100);
  assert.equal(g.energy, 78);
  assert.ok(g.effects.some(e=>e.kind==='rail'));
  g.energy = 0; g.cooldown = 0;
  const hp = g.enemies.map(e=>e.hp);
  E.tick(g, 0.001);
  assert.deepEqual(g.enemies.map(e=>e.hp), hp);
});

test('pulse damages the sea AOE, charges 60 energy and enforces cooldown', () => {
  assert.equal(typeof E.pulse, 'function');
  const g = arena();
  g.enemies = [enemy(1,8,0,20),enemy(2,-18,0,100),enemy(3,30,0,100)];
  assert.equal(E.pulse(g), true);
  assert.equal(g.energy, 40);
  assert.equal(g.kills, 1);
  assert.equal(g.scrap, 52);
  assert.ok(g.enemies[0].hp < 100);
  assert.equal(g.enemies[1].hp, 100);
  assert.ok(g.pulseCooldown > 0);
  assert.equal(E.pulse(g), false);
  g.pulseCooldown = 0; g.energy = 59;
  assert.equal(E.pulse(g), false);
  g.energy = 60;
  assert.equal(E.pulse(g), true);
  assert.equal(g.energy, 0);
  assert.equal(g.scrap, 52);
  assert.ok(g.effects.some(e=>e.kind==='pulse'));
  const idle = E.createGame();
  assert.equal(E.pulse(idle), false);
});

test('mixed fleets include frigates and armor with exactly one boss every fifth wave', () => {
  for (const wave of [3,4,5,6,10,99]) {
    const g = E.createGame();
    g.wave = wave - 1;
    E.startWave(g);
    g.cooldown = 1e6;
    g.hp = 1e8;
    const types = [];
    const seen = new Set();
    for (let t=0;t<80;t+=0.1) {
      E.tick(g,0.1);
      assert.ok(g.enemies.length<=40);
      for (const e of g.enemies) if (!seen.has(e.id)) {
        seen.add(e.id); types.push(e.type);
        assert.ok(e.hp>0 && e.maxHp>=e.hp);
      }
    }
    assert.ok(types.includes('frigate'));
    if (wave>=4) assert.ok(types.includes('armored'));
    assert.equal(types.filter(t=>t==='boss').length, wave%5===0 ? 1 : 0);
    assert.equal(seen.size, g.waveTotal);
  }
});

test('station contact attacks cause defeat without phantom completion rewards', () => {
  const g = arena();
  g.enemies = [{...enemy(77,3.5,0,1000),type:'boss'}];
  g.cooldown = 100;
  g.hp = 10;
  E.tick(g,0.1);
  assert.equal(g.phase, 'defeat');
  assert.equal(g.hp, 0);
  assert.equal(g.bestWave, 0);
  assert.equal(g.pendingResearch, 0);
  assert.equal(g.kills, 0);
  const ships = JSON.stringify(g.enemies);
  advance(g, 20);
  assert.equal(JSON.stringify(g.enemies), ships);
  assert.equal(g.scrap, 45);
  assert.equal(E.startWave(g), false);
  assert.equal(E.pulse(g), false);
});

test('auto wave waits through a short intermission before starting the next wave', () => {
  const g = arena();
  g.autoWave = true;
  E.tick(g,0.01);
  assert.equal(g.phase, 'intermission');
  assert.equal(g.bestWave, 1);
  advance(g, 1);
  assert.equal(g.phase, 'intermission');
  advance(g, 2.1);
  assert.equal(g.phase, 'combat');
  assert.equal(g.wave, 2);
});

test('extraction banks research once and resets the expedition even after defeat', () => {
  assert.equal(typeof E.extract, 'function');
  for (const phase of ['combat','intermission','defeat']) {
    const g = arena('rail');
    Object.assign(g,{phase,wave:5,bestWave:4,research:3,pendingResearch:7,scrap:999,autoWave:true});
    g.upgrades.damage = 3;
    g.enemies = [enemy(5,8,0)];
    const baseline = E.stats(E.createGame()).damage;
    assert.equal(E.extract(g), true);
    assert.equal(g.research,10);
    assert.equal(g.bestWave,4);
    assert.equal(g.wave,0);
    assert.equal(g.phase,'ready');
    assert.equal(g.pendingResearch,0);
    assert.equal(g.scrap,45);
    assert.equal(g.upgrades.damage,0);
    assert.equal(g.autoWave,false);
    assert.deepEqual(g.unlocked,['cannon']);
    assert.deepEqual(g.enemies,[]);
    assert.deepEqual(g.effects,[]);
    assert.ok(E.stats(g).damage>baseline);
    assert.equal(E.extract(g),false);
    assert.equal(g.research,10);
    assert.equal(E.startWave(g),true);
  }
});

test('save/load roundtrips progression but rolls interrupted combat back without rewards', () => {
  assert.equal(typeof E.serializeGame, 'function');
  assert.equal(typeof E.loadGame, 'function');
  const g = arena('tesla');
  Object.assign(g,{wave:4,bestWave:3,research:12,pendingResearch:4,scrap:90,hp:65,energy:27});
  g.upgrades.damage = 2;
  g.aim = {x:4,z:5};
  g.enemies = [enemy(888,10,0)];
  const json = E.serializeGame(g,100000);
  assert.equal(typeof json,'string');
  const loaded = E.loadGame(json,100000);
  assert.equal(loaded.phase,'intermission');
  assert.equal(loaded.wave,3);
  assert.equal(loaded.bestWave,3);
  assert.equal(loaded.scrap,90);
  assert.equal(loaded.hp,65);
  assert.equal(loaded.energy,27);
  assert.equal(loaded.research,12);
  assert.equal(loaded.pendingResearch,4);
  assert.equal(loaded.upgrades.damage,2);
  assert.equal(loaded.weapon,'tesla');
  assert.equal(loaded.aim,null);
  assert.equal(loaded.autoWave,false);
  assert.deepEqual(loaded.enemies,[]);
  assert.deepEqual(loaded.effects,[]);
  const savedAgain = E.loadGame(E.serializeGame(loaded,100000),100000);
  assert.equal(savedAgain.wave,3);
  assert.equal(savedAgain.pendingResearch,4);
  assert.equal(E.startWave(loaded),true);
  assert.equal(loaded.wave,4);
});

test('malformed and hostile saves cannot inject shape, prototypes, nonfinite balances or combat state', () => {
  const inputs = [null,undefined,'{','null','[]','42','true','"save"',
    {version:99,scrap:999},
    {version:1,scrap:Infinity,research:NaN,pendingResearch:-Infinity,hp:Infinity,energy:'999',upgrades:null},
    {version:1,wave:1e99,bestWave:1e99,scrap:1e99,research:1e99,pendingResearch:1e99,hp:1e99,energy:1e99,
      upgrades:{damage:1e99,rate:-100,hull:'50',reactor:Infinity,salvage:NaN},unlocked:[null,'rail','rail','__proto__'],weapon:'__proto__',priority:'evil'},
    '{"version":1,"scrap":1e999,"research":-5,"upgrades":{"damage":1e999,"__proto__":{"polluted":true}},"__proto__":{"polluted":true},"enemies":[{"hp":-1,"reward":1e99}],"effects":[{}],"spawnRemaining":999}',
    {version:1,upgrades:[],unlocked:{includes:1},weapon:'rail',priority:[],autoWave:'yes'},
    {version:1,get scrap(){throw new Error('hostile getter');}},
  ];
  for (const input of inputs) {
    const g = E.loadGame(input,1000);
    assert.equal(g.version,1);
    assert.ok(['ready','intermission'].includes(g.phase));
    assert.equal(g.autoWave,false);
    for (const key of ['scrap','research','pendingResearch','hp','energy','wave','bestWave','lastSavedAt']) {
      assert.ok(Number.isFinite(g[key]) && g[key]>=0, `${key} from ${typeof input}`);
    }
    assert.ok(g.scrap<=1e9 && g.research<=1e6 && g.pendingResearch<=1e6);
    assert.ok(g.bestWave<=1000 && g.wave<=g.bestWave);
    for (const v of Object.values(g.upgrades)) assert.ok(Number.isInteger(v) && v>=0 && v<=50);
    assert.ok(g.hp<=E.stats(g).maxHp && g.energy<=E.stats(g).maxEnergy);
    assert.ok(g.unlocked.includes('cannon') && g.unlocked.includes(g.weapon));
    assert.ok(g.unlocked.every(id=>Object.hasOwn(E.WEAPONS,id)));
    assert.deepEqual(g.enemies,[]);
    assert.deepEqual(g.effects,[]);
    assert.equal(g.spawnRemaining,0);
    assert.equal({}.polluted,undefined);
    assert.equal(Object.getPrototypeOf(g.upgrades),Object.prototype);
    assert.doesNotThrow(()=>E.tick(g,0.1));
  }
});

test('offline salvage requires a cleared wave, is capped at eight hours and 2400 scrap, and never advances combat', () => {
  const now = 1e12;
  const g = E.createGame(now);
  const idle = E.serializeGame(g,now);
  assert.equal(E.loadGame(idle,now+1e10).scrap,45);
  Object.assign(g,{wave:5,bestWave:5,phase:'intermission'});
  const json = E.serializeGame(g,now);
  const hour = E.loadGame(json,now+3600000);
  assert.equal(hour.scrap,345); // 5 scrap/minute at best wave 5.
  assert.equal(hour.wave,5);
  assert.equal(hour.pendingResearch,0);
  assert.equal(hour.kills,0);
  assert.equal(E.loadGame(json,now+28800000).scrap,2445);
  assert.equal(E.loadGame(json,now+1e12).scrap,2445);
  assert.equal(E.loadGame(json,now-1).scrap,45);
  for (const stamp of [Infinity,NaN,-Infinity,'0',null]) {
    const data = JSON.parse(json); data.lastSavedAt=stamp;
    assert.equal(E.loadGame(data,now).scrap,45);
  }
  assert.equal(E.loadGame(E.serializeGame(hour,now+3600000),now+3600000).scrap,345);
  const rich = JSON.parse(json); rich.bestWave=1000;
  assert.equal(E.loadGame(rich,now+1e12).scrap,2445);
});

test('loading a defeated station banks earned research and offers a playable fresh expedition', () => {
  for (const wave of [1,5]) {
    const g = arena();
    Object.assign(g,{phase:'defeat',hp:0,wave,bestWave:wave-1,research:2,pendingResearch:3});
    const loaded = E.loadGame(E.serializeGame(g,1000),1000);
    assert.equal(loaded.phase,'ready');
    assert.equal(loaded.wave,0);
    assert.equal(loaded.bestWave,wave-1);
    assert.equal(loaded.research,5);
    assert.equal(loaded.pendingResearch,0);
    assert.equal(loaded.hp,100);
    assert.equal(E.startWave(loaded),true);
  }
});

test('an affordable offense build clears five waves and earns the boss research bonus', () => {
  const g = E.createGame(0);
  E.buyUpgrade(g,'damage');
  for (let wave=1;wave<=5;wave++) {
    for (let purchases=0;purchases<20;purchases++) {
      const id = E.upgradeCost(g,'damage') < E.upgradeCost(g,'rate') ? 'damage' : 'rate';
      if (!E.buyUpgrade(g,id)) break;
    }
    assert.equal(E.startWave(g),true);
    const begin = g.time;
    while (g.phase==='combat' && g.time-begin<120) {
      if (g.enemies.length>=3 || g.enemies.some(e=>e.type==='boss')) E.pulse(g);
      E.tick(g,0.05);
    }
    assert.equal(g.phase,'intermission',`wave ${wave}`);
    assert.ok(g.time-begin>=8 && g.time-begin<90);
    assert.equal(g.waveKills,g.waveTotal);
  }
  assert.equal(g.bestWave,5);
  assert.equal(g.pendingResearch,12); // 9 ordinary research + 3 boss bonus.
});

test('invalid clocks and time steps cannot introduce nonfinite state or hidden combat catch-up', () => {
  for (const now of [Infinity,NaN,-Infinity,'100',-3]) {
    const g = E.createGame(now);
    assert.ok(Number.isFinite(g.lastSavedAt) && g.lastSavedAt>=0);
    const loaded = E.loadGame(E.serializeGame(g,now),now);
    assert.ok(Number.isFinite(loaded.lastSavedAt) && loaded.lastSavedAt>=0);
    assert.ok(Number.isFinite(loaded.scrap));
  }
  const g = arena();
  g.enemies = [enemy(100,10,0)];
  const before = JSON.stringify(g);
  for (const dt of [0,-1,Infinity,NaN,'1']) E.tick(g,dt);
  assert.equal(JSON.stringify(g),before);
  E.tick(g,100000);
  assert.ok(g.time<=1.000001);
  assert.ok(g.effects.every(e=>e.ttl>0 && e.ttl<=e.maxTtl));
});

test('effect IDs remain monotonic across extraction and weapon switching cannot reset fire cooldown', () => {
  const g = arena();
  g.enemies = [enemy(500,10,0,1000)];
  E.tick(g,0.001);
  E.pulse(g);
  const first = Math.max(...g.effects.map(e=>e.id));
  const hp = g.enemies[0].hp;
  E.setWeapon(g,'rail');
  E.tick(g,0.001);
  assert.equal(g.enemies[0].hp,hp);
  E.extract(g);
  E.startWave(g);
  E.tick(g,0.001);
  assert.ok(g.effects[0].id>first);
  assert.equal(new Set([...g.enemies,...g.effects].map(e=>e.id)).size,g.enemies.length+g.effects.length);
});
