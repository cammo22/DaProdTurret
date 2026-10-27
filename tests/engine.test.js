import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
function advance(g, seconds, dt = 0.02) {
  for (let t=0;t<seconds-1e-8;t+=dt) E.tick(g,Math.min(dt,seconds-t));
}
function enemy(id,x,z,hp=100) {
  return {id,type:'skiff',x,z,hp,maxHp:hp,speed:0,reward:7,attackCooldown:100,
    stunnedFor:0,submerged:false,diveTimer:5,attackRange:2.8};
}
function arena(weapon='cannon') {
  const g=E.createGame(0); E.startWave(g);
  Object.assign(g,{weapon,spawnRemaining:0,autoWave:false}); return g;
}
test('v2 baseline has ammo, run-local trees, no legacy research',()=>{
  const g=E.createGame(1234);
  assert.equal(g.version,2);
  assert.deepEqual([g.scrap,g.hp,g.ammo,g.autoWave,g.lastSavedAt],[60,120,36,true,1234]);
  assert.deepEqual([g.score,g.highScore,g.charge,g.pendingManual],[0,0,null,null]);
  assert.equal('research' in g,false); assert.equal('extract' in E,false);
  assert.deepEqual(Object.keys(E.UPGRADES),['hull','reactor','salvage']);
  assert.deepEqual(Object.keys(E.WEAPON_UPGRADES.cannon),['damage','rate','magazine']);
  assert.deepEqual(Object.keys(E.WEAPON_UPGRADES.tesla),['damage','bounces','range']);
  assert.deepEqual(Object.keys(E.WEAPON_UPGRADES.rail),['damage','charge','pierce']);
  for(const value of Object.values(E.stats(g))) assert.ok(Number.isFinite(value)&&value>=0);
  assert.deepEqual(Object.values(E.WEAPONS).map(w=>w.unlockWave),[1,25,50]);
});

test('manual shots travel to literal empty water, queue once behind cooldown, then resume auto aim',()=>{
  assert.equal(typeof E.manualFire,'function');
  const g=arena(); g.enemies=[enemy(100,9,0)];
  assert.equal(E.manualFire(g,0,12),true);
  assert.equal(g.projectiles.length,1);
  const p=g.projectiles[0];
  assert.deepEqual([p.kind,p.owner,p.x,p.z,p.tx,p.tz],['shell','player',0,0,0,12]);
  assert.equal(g.enemies[0].hp,100); assert.equal(g.energy,100); assert.equal(g.ammo,35);
  assert.deepEqual(g.lastShot,{x:0,z:12,weapon:'cannon',time:0,manual:true});
  const cooldown=g.cooldown;
  assert.equal(E.manualFire(g,-8,4),true); assert.equal(g.cooldown,cooldown);
  assert.equal(g.projectiles.length,1);
  E.manualFire(g,-9,5); advance(g,cooldown+0.01);
  assert.deepEqual([g.lastShot.x,g.lastShot.z],[-9,5]);
  assert.equal(g.pendingManual,null); assert.equal(g.enemies[0].hp,100);
  g.aim={x:0,z:-10}; advance(g,0.5);
  assert.deepEqual([g.lastShot.x,g.lastShot.z],[0,-10]);
  g.aim=null; advance(g,0.5);
  assert.equal(g.lastShot.x,9); assert.equal(g.lastShot.manual,false);
});

test('manual fire accepts distant visible sea coordinates but rejects nonfinite input',()=>{
  const g=arena();g.enemies=[enemy(100,10,0,1000)];
  assert.equal(E.manualFire(g,35,20),true);
  assert.deepEqual([g.lastShot.x,g.lastShot.z],[35,20]);
  assert.equal(g.enemies[0].hp,1000);
  for(const [x,z] of [[NaN,0],[Infinity,0],['3',0],[1000,0]]) assert.equal(E.manualFire(g,x,z),false);
});

test('shell segment hits earliest ship without tunneling and empty-water rounds splash at their endpoint',()=>{
  const g=arena();g.cooldown=100;g.enemies=[enemy(101,12,0,10),enemy(102,5,0,10)];
  g.cooldown=0;E.manualFire(g,20,0);g.cooldown=100;
  g.projectiles[0].speed=3000;g.projectiles[0].vx=3000;
  E.tick(g,0.02);
  assert.deepEqual(g.enemies.map(e=>e.id),[101]);
  assert.equal(g.kills,1);assert.equal(g.waveKills,1);assert.equal(g.scrap,67);
  assert.ok(g.score>0);assert.equal(g.highScore,g.score);
  advance(g,0.5);assert.equal(g.kills,1);assert.equal(g.scrap,67);
  g.cooldown=0;E.manualFire(g,0,2);g.cooldown=100;advance(g,0.1);
  assert.ok(g.effects.some(e=>e.kind==='splash'&&e.x===0&&Math.abs(e.z-2)<1e-8));
  assert.equal(g.projectiles.length,0);assert.equal(g.enemies[0].hp,10);
  g.cooldown=0;E.manualFire(g,0,0);E.tick(g,0.01);
  assert.ok(g.projectiles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.vx)));
});

test('empty magazines reload unlimited ammunition while preserving queued shots, never spending energy',()=>{
  const g=arena();g.enemies=[enemy(100,25,0,10000)];g.ammo=1;g.energy=0;
  E.manualFire(g,0,20);
  assert.equal(g.ammo,0);assert.ok(g.reloadTimer>0);
  const reload=g.reloadTimer;
  E.manualFire(g,-10,0);advance(g,reload-0.05);
  assert.equal(g.ammo,0);assert.ok(g.pendingManual);
  advance(g,0.1);
  assert.equal(g.ammo,E.stats(g).maxAmmo-1);
  assert.equal(g.pendingManual,null);assert.equal(g.lastShot.x,-10);
  assert.ok(g.energy>=0);assert.equal(g.lastShot.manual,true);
  g.ammo=0;g.reloadTimer=0;E.tick(g,0.01);assert.ok(g.reloadTimer>0);
});

test('EMP visibly stuns each affected ship movement and attack clocks, then movement resumes',()=>{
  assert.equal(typeof E.pulse,'function');
  const g=arena();g.cooldown=100;
  g.enemies=[{...enemy(100,8,0,1000),speed:1,attackCooldown:0},enemy(101,27,0,1000)];
  E.tick(g,0.1);const before=g.enemies[0].x;assert.ok(before<8);
  assert.equal(E.pulse(g),true);assert.equal(g.energy,40);
  assert.equal(E.pulse(g),false);
  const ship=g.enemies[0],clock=ship.attackCooldown;
  assert.ok(ship.stunnedFor>=E.stats(g).stunDuration-0.01);
  assert.equal(g.enemies[1].stunnedFor,0);
  assert.ok(g.effects.some(e=>e.kind==='stun'&&e.x===ship.x));
  advance(g,1);assert.equal(ship.x,before);assert.equal(ship.attackCooldown,clock);
  advance(g,2.1);assert.ok(ship.x<before);
  assert.ok(g.pulseCooldown>0);
});

test('Tesla reaches first exact-direction target then ricochets over time without energy use',()=>{
  const g=arena('tesla');g.enemies=[enemy(100,8,0,1000),enemy(101,12,0,1000),enemy(102,16,0,1000)];
  E.manualFire(g,8,0);g.cooldown=100;
  assert.equal(g.projectiles[0].kind,'tesla-orb');assert.equal(g.energy,100);
  assert.ok(g.enemies.every(e=>e.hp===1000));
  advance(g,0.17);
  assert.ok(g.enemies[0].hp<1000);assert.equal(g.enemies[1].hp,1000);
  advance(g,0.13);assert.ok(g.enemies[1].hp<1000);
  advance(g,0.2);assert.ok(g.enemies[2].hp<g.enemies[1].hp+20);
  assert.ok(g.enemies[0].hp<g.enemies[2].hp);
  assert.equal(g.projectiles.length,0);
  const miss=arena('tesla');miss.enemies=[enemy(100,8,0)];E.manualFire(miss,0,10);miss.cooldown=100;
  advance(miss,0.5);assert.equal(miss.enemies[0].hp,100);
});

test('rail charges before its exact locked beam, caps piercing and queues new manual aim without reset',()=>{
  const g=arena('rail');g.enemies=[enemy(100,8,0,1000),enemy(101,12,0,1000),enemy(102,16,0,1000),enemy(103,20,0,1000),enemy(104,0,8,1000)];
  E.manualFire(g,10,0);
  assert.ok(g.charge);const duration=g.charge.duration;
  assert.deepEqual([g.charge.x,g.charge.z],[10,0]);assert.equal(g.ammo,32);
  assert.equal(g.lastShot,undefined);assert.ok(g.effects.some(e=>e.kind==='charge'));
  advance(g,duration/2);assert.ok(g.enemies.every(e=>e.hp===1000));
  E.manualFire(g,0,10);const remaining=g.charge.remaining;
  assert.equal(g.charge.remaining,remaining);assert.deepEqual([g.charge.x,g.charge.z],[10,0]);
  advance(g,duration/2+0.02);
  assert.equal(g.charge,null);assert.ok(g.enemies.slice(0,3).every(e=>e.hp===1000-E.stats(g).damage));
  assert.equal(g.enemies[3].hp,1000);assert.equal(g.enemies[4].hp,1000);
  assert.ok(g.effects.some(e=>e.kind==='rail'));assert.deepEqual([g.lastShot.x,g.lastShot.z,g.lastShot.manual],[10,0,true]);
  assert.ok(g.cooldown>0);assert.deepEqual(g.pendingManual,{x:0,z:10});
  assert.equal(g.energy,100);
});

test('missile ability launches real homing splash rounds using energy, not ammo',()=>{
  assert.equal(typeof E.launchMissiles,'function');
  const g=arena();g.cooldown=100;g.enemies=[enemy(100,12,0,1000),enemy(101,12,2,1000)];
  const ammo=g.ammo;
  assert.equal(E.launchMissiles(g),true);assert.equal(g.energy,55);assert.equal(g.ammo,ammo);
  assert.equal(g.projectiles.length,E.stats(g).missileCount);
  assert.ok(g.projectiles.every(p=>p.kind==='missile'&&p.owner==='player'&&p.targetId));
  assert.ok(g.enemies.every(e=>e.hp===1000));assert.equal(E.launchMissiles(g),false);
  g.enemies[0].z=3;E.tick(g,0.05);
  assert.equal(g.projectiles[0].tz,3);assert.ok(g.projectiles[0].vz>0);
  advance(g,1);
  assert.ok(g.enemies.every(e=>e.hp<1000));
  assert.ok(g.effects.some(e=>e.kind==='explosion'));
  const empty=arena();assert.equal(E.launchMissiles(empty),false);assert.equal(empty.energy,100);
});

test('general and distinct per-weapon upgrades debit costs and change only their specified stats',()=>{
  assert.equal(typeof E.buyWeaponUpgrade,'function');
  const g=E.createGame();g.scrap=1e8;g.unlocked=['cannon','tesla','rail'];
  for(const [id,field] of [['hull','maxHp'],['reactor','maxEnergy'],['salvage',null]]) {
    const before=E.stats(g),cash=g.scrap,cost=E.upgradeCost(g,id);
    assert.equal(E.buyUpgrade(g,id),true);assert.equal(g.scrap,cash-cost);
    if(field) assert.ok(E.stats(g)[field]>before[field]);
  }
  assert.equal(g.hp,E.stats(g).maxHp);assert.equal(g.energy,E.stats(g).maxEnergy);
  for(const [weapon,items] of Object.entries({cannon:{damage:'damage',rate:'fireRate',magazine:'maxAmmo'},tesla:{damage:'damage',bounces:'bounces',range:'reloadTime'},rail:{damage:'damage',charge:'chargeTime',pierce:'pierce'}})) {
    for(const [id,field] of Object.entries(items)) {
      const before=E.stats(g,weapon),cash=g.scrap,cost=E.weaponUpgradeCost(g,weapon,id);
      assert.equal(E.buyWeaponUpgrade(g,weapon,id),true);assert.equal(g.scrap,cash-cost);
      assert.notEqual(E.stats(g,weapon)[field],before[field]);
      assert.ok(E.weaponUpgradeCost(g,weapon,id)>cost);
    }
  }
  const snapshot=JSON.stringify(g);
  for(const bad of ['__proto__','constructor','missing',null,{},[]]) {
    assert.equal(E.buyUpgrade(g,bad),false);assert.equal(E.buyWeaponUpgrade(g,'cannon',bad),false);
    assert.equal(E.buyWeaponUpgrade(g,bad,'damage'),false);
  }
  assert.equal(JSON.stringify(g),snapshot);
  const fresh=E.createGame();assert.equal(E.buyWeaponUpgrade(fresh,'tesla','damage'),false);
  fresh.scrap=29;assert.equal(E.buyWeaponUpgrade(fresh,'cannon','damage'),false);
});

test('Tesla and Rail unlock only on current-run wave25/50 and switching cannot reset fire or reload',()=>{
  assert.equal(typeof E.setWeapon,'function');
  const g=E.createGame();g.scrap=1e9;g.bestWave=100;
  assert.equal(E.setWeapon(g,'tesla'),false);assert.equal(E.setWeapon(g,'rail'),false);
  for(const [prior,id] of [[24,'tesla'],[49,'rail']]) {
    g.phase='intermission';g.wave=prior;const cash=g.scrap;E.startWave(g);
    assert.ok(g.unlocked.includes(id));assert.equal(E.setWeapon(g,id),true);assert.equal(g.scrap,cash);
  }
  g.cooldown=1;g.reloadTimer=2;g.ammo=3;
  assert.equal(E.setWeapon(g,'cannon'),true);
  assert.deepEqual([g.cooldown,g.reloadTimer,g.ammo],[1,2,3]);
  assert.equal(E.setWeapon(g,'__proto__'),false);
  g.charge={x:2,z:0,remaining:1,duration:1};assert.equal(E.setWeapon(g,'tesla'),false);
  assert.equal(E.setPriority(g,'strongest'),true);assert.equal(g.priority,'strongest');
  assert.equal(E.setPriority(g,{}),false);
});

test('ranged ships stand off and launch incoming shells that damage only on tower contact; EMP stops firing',()=>{
  const g=arena();g.cooldown=100;
  const ship={...enemy(100,12,0,1000),type:'frigate',speed:2,attackRange:12,attackCooldown:0};g.enemies=[ship];
  E.tick(g,0.01);assert.equal(ship.x,12);assert.equal(g.hp,120);
  assert.ok(g.projectiles.some(p=>p.kind==='enemy-shell'&&p.owner==='enemy'&&p.vx<0));
  assert.equal(ship.hp,1000);E.pulse(g);
  const clock=ship.attackCooldown;advance(g,0.7);assert.equal(g.hp,120);assert.equal(ship.attackCooldown,clock);
  advance(g,0.6);assert.ok(g.hp<120);assert.equal(g.projectiles.filter(p=>p.owner==='enemy').length,0);
  const count=g.projectiles.length;advance(g,0.8);assert.equal(g.projectiles.length,count);
});

test('submarines cycle dive/surface, evade gun hits underwater and fire visible torpedoes',()=>{
  const g=arena();g.cooldown=100;
  const sub={...enemy(100,10,0,1000),type:'submarine',attackRange:10,attackCooldown:0,diveTimer:0.05};g.enemies=[sub];
  E.tick(g,0.1);assert.equal(sub.submerged,true);
  assert.ok(g.projectiles.some(p=>p.kind==='torpedo'&&p.owner==='enemy'));
  g.cooldown=0;E.manualFire(g,10,0);g.cooldown=100;advance(g,0.5);assert.equal(sub.hp,1000);
  advance(g,2.1);assert.equal(sub.submerged,false);assert.ok(g.hp<120);
  g.cooldown=0;E.manualFire(g,10,0);g.cooldown=100;advance(g,0.4);assert.ok(sub.hp<1000);
});

test('deterministic early waves spawn immediately and complete once, with default auto progression and mandatory tenth-wave stops',()=>{
  const g=E.createGame(0);g.autoWave=false;assert.equal(E.startWave(g),true);assert.equal(E.startWave(g),false);
  E.tick(g,0.001);assert.equal(g.enemies.length,1);
  assert.ok(Math.hypot(g.enemies[0].x,g.enemies[0].z)>=19-0.01);
  assert.ok(g.projectiles.some(p=>p.kind==='shell'));
  advance(g,30);assert.equal(g.phase,'intermission');assert.equal(g.bestWave,1);
  assert.equal(g.waveKills,g.waveTotal);assert.equal(g.kills,g.waveTotal);
  const rewards=[g.scrap,g.score,g.kills,g.bestWave];advance(g,10);assert.deepEqual([g.scrap,g.score,g.kills,g.bestWave],rewards);
  g.autoWave=true;advance(g,3);assert.equal(g.wave,2);assert.equal(g.phase,'combat');
  for(const wave of [10,20,30,50]) {
    const stop=arena();Object.assign(stop,{wave,autoWave:true});E.tick(stop,0.01);
    assert.equal(stop.phase,'upgrade');assert.equal(stop.bestWave,wave);
    const cash=stop.scrap;advance(stop,20);assert.equal(stop.wave,wave);assert.equal(stop.phase,'upgrade');assert.equal(stop.scrap,cash);
    assert.equal(E.startWave(stop),true);assert.equal(stop.wave,wave+1);
  }
});

test('simultaneous final kill and lethal incoming shot is defeat, never wave completion, and restart keeps records only',()=>{
  assert.equal(typeof E.restartGame,'function');
  const g=arena();Object.assign(g,{wave:10,bestWave:9,hp:5,scrap:999});
  g.weaponUpgrades.cannon.damage=4;g.upgrades.hull=3;g.enemies=[enemy(100,5,0,10)];
  E.manualFire(g,5,0);g.projectiles[0].speed=1000;
  g.projectiles.push({id:1001,kind:'enemy-shell',owner:'enemy',x:3.2,z:0,tx:0,tz:0,vx:-100,vz:0,speed:100,damage:10,ttl:5,radius:0.3});
  E.tick(g,0.02);
  assert.equal(g.phase,'defeat');assert.equal(g.hp,0);assert.equal(g.bestWave,9);
  assert.ok(g.highScore<1000);assert.equal(g.scrap,0);assert.deepEqual(g.projectiles,[]);
  const frozen=JSON.stringify(g);advance(g,10);assert.equal(JSON.stringify(g),frozen);
  for(const action of [()=>E.startWave(g),()=>E.manualFire(g,2,2),()=>E.pulse(g),()=>E.launchMissiles(g),()=>E.buyUpgrade(g,'hull'),()=>E.buyWeaponUpgrade(g,'cannon','damage'),()=>E.setWeapon(g,'cannon')]) assert.equal(action(),false);
  const records=[g.highScore,g.bestWave];E.restartGame(g);
  assert.deepEqual([g.highScore,g.bestWave],records);
  assert.deepEqual([g.phase,g.wave,g.score,g.kills,g.scrap,g.hp,g.ammo],['ready',0,0,0,60,120,36]);
  assert.deepEqual(g.upgrades,E.createGame().upgrades);assert.deepEqual(g.weaponUpgrades,E.createGame().weaponUpgrades);
  assert.deepEqual(g.unlocked,['cannon']);assert.equal(E.setWeapon(g,'tesla'),false);
});

test('early and periodic sea events grant actual supplies, repair, ammo and scrap exactly once, then expire',()=>{
  assert.equal(typeof E.collectEvent,'function');
  const early=E.createGame();early.wave=1;E.startWave(early);
  assert.ok(early.events.length>0);assert.equal(early.events[0].type,'supply');
  for(const [type,field] of [['supply','energy'],['repair','hp'],['ammo','ammo'],['salvage','scrap']]) {
    const g=arena();Object.assign(g,{hp:30,energy:0,ammo:0,reloadTimer:2});
    g.events=[{id:99,type,x:6,z:6,ttl:10,value:40}];
    const before=g[field];assert.equal(E.collectEvent(g,99),true);assert.ok(g[field]>before);
    if(type==='ammo') {assert.equal(g.reloadTimer,0);assert.equal(g.ammo,E.stats(g).maxAmmo);}
    const snapshot=JSON.stringify(g);assert.equal(E.collectEvent(g,99),false);assert.equal(E.collectEvent(g,'99'),false);
    assert.equal(JSON.stringify(g),snapshot);assert.equal(g.events.length,0);assert.ok(g.score>0);
  }
  const expired=arena();expired.enemies=[enemy(100,20,0,10000)];expired.cooldown=100;
  expired.events=[{id:99,type:'salvage',x:6,z:6,ttl:0.1,value:50}];
  advance(expired,0.2);assert.equal(expired.events.length,0);assert.equal(expired.scrap,60);assert.equal(E.collectEvent(expired,99),false);
});

test('v2 saves preserve checkpoints and run resources without offline income or transient combat',()=>{
  assert.equal(typeof E.serializeGame,'function');assert.equal(typeof E.loadGame,'function');
  const g=E.createGame(1000);Object.assign(g,{wave:10,bestWave:10,phase:'upgrade',scrap:321,score:500,highScore:700,hp:80,ammo:12});
  g.weaponUpgrades.cannon.damage=3;g.enemies=[enemy(99,5,5)];g.events=[{id:55,type:'ammo',x:1,z:1,ttl:30,value:10}];
  const json=E.serializeGame(g,2000),raw=JSON.parse(json);
  assert.equal(raw.version,2);assert.equal('research' in raw,false);assert.equal('enemies' in raw,false);assert.equal('events' in raw,false);
  const loaded=E.loadGame(json,999999999);
  assert.deepEqual([loaded.wave,loaded.phase,loaded.scrap,loaded.score,loaded.highScore,loaded.hp,loaded.ammo],[10,'upgrade',321,500,700,80,12]);
  assert.equal(loaded.weaponUpgrades.cannon.damage,3);assert.deepEqual(loaded.enemies,[]);assert.deepEqual(loaded.events,[]);
  const combat=E.loadGame(JSON.stringify({...raw,wave:6,bestWave:5,phase:'combat'}),3000);
  assert.equal(combat.wave,5);assert.equal(combat.phase,'intermission');assert.equal(combat.autoWave,false);
  const dead=E.loadGame(JSON.stringify({...raw,phase:'defeat',hp:0}),3000);
  assert.equal(dead.phase,'defeat');assert.equal(dead.scrap,0);assert.equal(dead.highScore,700);assert.equal(dead.weaponUpgrades.cannon.damage,0);
});

test('current-run thresholds authorize weapon switching without trusting a stale unlock cache',()=>{
  const g=E.createGame();g.wave=25;
  assert.equal(E.setWeapon(g,'tesla'),true);assert.equal(g.weapon,'tesla');
  g.wave=50;assert.equal(E.setWeapon(g,'rail'),true);
  E.restartGame(g);assert.equal(E.setWeapon(g,'tesla'),false);
});

test('hostile saves and legacy research cannot inject state or resurrect a lost run',()=>{
  const fresh=E.createGame(0);
  for(const input of ['{',null,[],42,{version:99},'x'.repeat(200001)]) assert.deepEqual(E.loadGame(input,0),fresh);
  const cycle={};cycle.self=cycle;assert.deepEqual(E.loadGame(cycle,0),fresh);
  assert.deepEqual(E.loadGame({get version(){throw Error('hostile');}},0),fresh);
  const legacy=E.loadGame({version:1,bestWave:32,highScore:500,research:999999,scrap:1e9,weapon:'rail',upgrades:{damage:50}},0);
  assert.deepEqual([legacy.bestWave,legacy.highScore,legacy.scrap,legacy.wave,legacy.weapon],[32,500,60,0,'cannon']);
  assert.equal('research' in legacy,false);assert.deepEqual(legacy.weaponUpgrades.cannon,fresh.weaponUpgrades.cannon);
  const attack=JSON.parse('{"version":2,"wave":5,"bestWave":5,"phase":"intermission","scrap":1e400,"hp":-4,"unlocked":["rail"],"weapon":"rail","upgrades":{"hull":1e400,"reactor":-2},"weaponUpgrades":{"cannon":{"damage":"99","rate":999999}},"__proto__":{"polluted":true}}');
  const safe=E.loadGame(attack,0);
  assert.equal(safe.phase,'defeat');assert.equal(safe.scrap,0);assert.equal(safe.weapon,'cannon');assert.equal({}.polluted,undefined);
  assert.equal('polluted' in safe,false);for(const value of Object.values(E.stats(safe))) assert.ok(Number.isFinite(value));
  const snapshot=JSON.stringify(fresh);for(const dt of [NaN,Infinity,-1,0,'1',null]) E.tick(fresh,dt);
  assert.equal(JSON.stringify(fresh),snapshot);
});
