import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
function advance(g,seconds,dt=0.02) {
  for(let t=0;t<seconds-1e-8;t+=dt) E.tick(g,Math.min(dt,seconds-t));
}
function enemy(id,x,z,hp=100) {
  return {id,type:'skiff',x,z,hp,maxHp:hp,speed:0,reward:7,attackCooldown:100,
    stunnedFor:0,submerged:false,diveTimer:5,attackRange:2.8};
}
function arena(weapon='cannon') {
  const g=E.createGame(0);g.cash=1e7;
  if(weapon!=='cannon') E.buySkill(g,weapon==='tesla'?'unlockTesla':'unlockRail');
  E.setWeapon(g,weapon);E.startWave(g);g.spawnRemaining=0;g.cash=60;return g;
}
function ability(g,id) {
  const phase=g.phase;g.phase='upgrade';g.cash=1e7;
  const unlock={emp:'unlockEmp',missiles:'unlockMissiles',airstrike:'unlockAirstrike'}[id];
  E.buySkill(g,unlock);E.equipAbility(g,id);g.phase=phase;g.cash=60;
}
test('v3 starts manual with money only, no wave gates and finite heat stats',()=>{
  const g=E.createGame(1234);
  assert.equal(g.version,3);
  assert.deepEqual([g.cash,g.earnedMoney,g.highWave,g.bestEarnings,g.hp,g.autoWave,g.lastSavedAt],[60,0,0,0,120,false,1234]);
  assert.deepEqual(g.loadout,[]);assert.equal(g.heat,0);assert.equal(g.overheated,false);
  for(const key of ['ammo','reloadTimer','score','highScore','scrap','research','upgrades','weaponUpgrades']) assert.equal(key in g,false,key);
  for(const w of Object.values(E.WEAPONS)) {assert.ok(w.unlockCost>=0);assert.equal('unlockWave' in w,false);}
  for(const key of ['heatCapacity','coolingRate','overheatRecovery','maxHp','maxEnergy','projectileCount','damage','fireRate']) assert.ok(E.stats(g)[key]>0,key);
});
test('cash skill DAG enforces every parent, caps, phase and exact debit without wave locks',()=>{
  const g=E.createGame();g.cash=1e8;
  const required=['unlockTesla','unlockRail','unlockEmp','unlockMissiles','unlockAirstrike','autofire','slot2','slot3','cannonDamage','cannonRate','cannonCooling','cannonCapacity','cannonMultishot','towerHull','towerReactor'];
  for(const id of required) assert.ok(Object.hasOwn(E.SKILLS,id),id);
  for(const [id,s] of Object.entries(E.SKILLS)) {
    assert.ok(['cannon','tesla','rail','tower','abilities'].includes(s.branch));
    assert.ok(['unlock','upgrade','slot'].includes(s.kind));assert.ok(Array.isArray(s.parents));
    assert.ok(s.parents.every(p=>Object.hasOwn(E.SKILLS,p)&&p!==id));
    if(s.parents.length) {const fresh=E.createGame();fresh.cash=1e9;assert.equal(E.buySkill(fresh,id),false,id);}
  }
  assert.equal(E.setWeapon(g,'tesla'),false);
  for(const id of ['unlockTesla','unlockRail']) {const cost=E.skillCost(g,id),cash=g.cash;assert.equal(E.buySkill(g,id),true);assert.equal(g.cash,cash-cost);assert.equal(E.skillCost(g,id),Infinity);}
  assert.equal(g.wave,0);assert.equal(E.setWeapon(g,'tesla'),true);assert.equal(E.setWeapon(g,'rail'),true);
  for(const id of ['cannonDamage','towerHull','towerReactor']) {
    const before=E.stats(g,'cannon'),cash=g.cash,cost=E.skillCost(g,id);
    assert.equal(E.buySkill(g,id),true);assert.equal(g.cash,cash-cost);assert.equal(E.skillLevel(g,id),1);
    const key={cannonDamage:'damage',towerHull:'maxHp',towerReactor:'maxEnergy'}[id];assert.ok(E.stats(g,'cannon')[key]>before[key]);
  }
  assert.equal(g.hp,E.stats(g).maxHp);assert.equal(g.energy,E.stats(g).maxEnergy);
  for(const bad of ['__proto__','constructor','missing',null,{},[]]) {assert.equal(E.buySkill(g,bad),false);assert.equal(E.skillCost(g,bad),Infinity);assert.equal(E.skillLevel(g,bad),0);}
  g.cash=0;assert.equal(E.buySkill(g,'cannonDamage'),false);
  g.cash=1e9;g.phase='combat';assert.equal(E.buySkill(g,'cannonDamage'),false);
  g.phase='defeat';assert.equal(E.buySkill(g,'cannonDamage'),false);
});
test('ability ownership and purchased slot capacity govern toggled loadout outside combat',()=>{
  const g=E.createGame();g.cash=1e8;
  assert.equal(E.equipAbility(g,'emp'),false);assert.equal(E.buySkill(g,'slot3'),false);
  for(const id of ['unlockEmp','unlockMissiles','unlockAirstrike']) assert.equal(E.buySkill(g,id),true);
  assert.equal(E.equipAbility(g,'emp'),true);assert.equal(E.equipAbility(g,'missiles'),false);
  assert.equal(E.buySkill(g,'slot2'),true);assert.equal(E.equipAbility(g,'missiles'),true);
  assert.equal(E.equipAbility(g,'airstrike'),false);assert.equal(E.buySkill(g,'slot3'),true);
  assert.equal(E.equipAbility(g,'airstrike'),true);assert.deepEqual(g.loadout,['emp','missiles','airstrike']);
  assert.equal(E.equipAbility(g,'emp'),true);assert.deepEqual(g.loadout,['missiles','airstrike']);
  g.phase='combat';assert.equal(E.equipAbility(g,'missiles'),false);
  for(const a of Object.values(E.ABILITIES)) {assert.ok(a.name);assert.ok(a.energyCost>0);assert.ok(a.cooldown>0);}
});
test('manual literal shots queue once; aim is not a trigger; autofire requires purchased prerequisites',()=>{
  const g=arena();g.enemies=[enemy(100,9,0,10000)];g.aim={x:0,z:12};advance(g,0.5);
  assert.equal(g.projectiles.length,0);assert.equal(g.lastShot,undefined);
  assert.equal(E.manualFire(g,0,12),true);assert.equal(g.projectiles.length,1);
  assert.deepEqual([g.projectiles[0].tx,g.projectiles[0].tz],[0,12]);
  assert.equal(g.energy,100);assert.equal(g.lastShot.manual,true);
  E.manualFire(g,-8,4);E.manualFire(g,-9,5);advance(g,0.44);
  assert.deepEqual([g.lastShot.x,g.lastShot.z],[-9,5]);assert.equal(g.pendingManual,null);
  const time=g.lastShot.time;g.aim=null;advance(g,0.6);assert.equal(g.lastShot.time,time);
  for(const [x,z] of [[NaN,0],[Infinity,0],['3',0],[1000,0]]) assert.equal(E.manualFire(g,x,z),false);
  assert.equal(E.manualFire(g,35,20),true);
  g.phase='upgrade';g.cash=1e8;
  for(const id of ['cannonRate','cannonCooling','cannonCapacity','autofire']) assert.equal(E.buySkill(g,id),true);
  g.phase='combat';g.cooldown=0;g.pendingManual=null;advance(g,0.1);assert.equal(g.lastShot.manual,false);assert.equal(g.lastShot.x,9);
});
test('heat rises on shots, passively cools while idle, and capacity causes a non-bypassable longer lockout',()=>{
  const g=arena();g.enemies=[enemy(100,25,0,10000)];
  E.manualFire(g,0,20);const hot=g.heat;assert.ok(hot>0);
  advance(g,0.2);assert.ok(g.heat<hot&&g.heat>=0);
  g.cooldown=0;g.heat=E.stats(g).heatCapacity-1;E.manualFire(g,0,20);
  assert.equal(g.overheated,true);assert.equal(g.heat,E.stats(g).heatCapacity);
  const lock=g.overheatTimer;assert.ok(lock>1/E.stats(g).fireRate);
  assert.equal(E.manualFire(g,10,0),false);assert.equal(g.pendingManual,null);
  assert.equal(E.setWeapon(g,'cannon'),true);assert.equal(g.overheatTimer,lock);
  advance(g,lock/2);assert.equal(g.overheated,true);assert.equal(E.manualFire(g,10,0),false);
  advance(g,lock/2+0.1);assert.equal(g.overheated,false);assert.equal(g.overheatTimer,0);assert.equal(g.heat,0);
  assert.equal(E.manualFire(g,0,20),true);
});
test('multishot creates separate colliding rounds and cooling/capacity/rate upgrades affect real stats',()=>{
  const g=E.createGame();g.cash=1e8;
  for(const id of ['cannonDamage','cannonMultishot','cannonMultishot','cannonCooling','cannonCapacity','cannonRate']) assert.equal(E.buySkill(g,id),true);
  const s=E.stats(g);assert.equal(s.projectileCount,3);assert.ok(s.coolingRate>24);assert.ok(s.heatCapacity>100);assert.ok(s.fireRate>2.4);
  E.startWave(g);g.spawnRemaining=0;g.enemies=[enemy(100,8,0,10000)];
  E.manualFire(g,8,0);assert.equal(g.projectiles.length,3);
  assert.equal(new Set(g.projectiles.map(p=>p.id)).size,3);
  assert.equal(new Set(g.projectiles.map(p=>`${p.tx},${p.tz}`)).size,3);
  advance(g,0.4);assert.ok(g.enemies[0].hp<=10000-s.damage*2);
});
test('segment collision rewards a kill once in money, empty water splashes, no tunneling',()=>{
  const g=arena();g.enemies=[enemy(101,12,0,10),enemy(102,5,0,10)];
  E.manualFire(g,20,0);g.projectiles[0].speed=3000;E.tick(g,0.02);
  assert.deepEqual(g.enemies.map(e=>e.id),[101]);assert.equal(g.kills,1);assert.equal(g.waveKills,1);
  assert.equal(g.cash,67);assert.equal(g.earnedMoney,7);assert.equal(g.bestEarnings,7);
  advance(g,0.5);assert.equal(g.cash,67);assert.equal(g.kills,1);
  E.manualFire(g,0,2);advance(g,0.1);assert.ok(g.effects.some(e=>e.kind==='splash'&&Math.abs(e.z-2)<1e-8));
  assert.equal(g.enemies[0].hp,10);assert.equal(g.projectiles.length,0);
  g.cooldown=0;E.manualFire(g,0,0);E.tick(g,0.01);assert.ok(g.projectiles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.vx)));
});
test('Tesla sequential ricochets and charged exact-direction rail piercing retain manual weapon behavior',()=>{
  const g=arena('tesla');g.enemies=[enemy(100,8,0,1000),enemy(101,12,0,1000),enemy(102,16,0,1000)];
  E.manualFire(g,8,0);assert.equal(g.projectiles[0].kind,'tesla-orb');assert.ok(g.enemies.every(e=>e.hp===1000));
  advance(g,0.17);assert.ok(g.enemies[0].hp<1000);assert.equal(g.enemies[1].hp,1000);
  advance(g,0.13);assert.ok(g.enemies[1].hp<1000);advance(g,0.2);assert.ok(g.enemies[2].hp<1000);
  assert.ok(g.enemies[0].hp<g.enemies[2].hp);assert.equal(g.energy,100);
  const r=arena('rail');r.enemies=[8,12,16,20].map((x,i)=>enemy(100+i,x,0,1000));
  E.manualFire(r,10,0);const duration=r.charge.duration;
  assert.equal(E.setWeapon(r,'cannon'),false);assert.equal(r.lastShot,undefined);
  advance(r,duration/2);assert.ok(r.enemies.every(e=>e.hp===1000));E.manualFire(r,0,10);
  assert.deepEqual([r.charge.x,r.charge.z],[10,0]);advance(r,duration/2+0.02);
  assert.equal(r.charge,null);assert.ok(r.enemies.slice(0,3).every(e=>e.hp===890));assert.equal(r.enemies[3].hp,1000);
  assert.ok(r.effects.some(e=>e.kind==='rail'));assert.deepEqual(r.pendingManual,{x:0,z:10});
  assert.equal(r.energy,100);
});
test('every wave completes into manual shopping exactly once, even if autoWave was set externally',()=>{
  for(const wave of [1,2,5,10,25,50]) {
    const g=arena();g.wave=wave;g.waveKills=1;g.autoWave=true;E.tick(g,0.01);
    assert.equal(g.phase,'upgrade');assert.equal(g.highWave,wave);assert.equal(g.autoWave,false);
    assert.equal(g.earnedMoney,12+wave*3);assert.equal(g.cash,60+g.earnedMoney);
    const cash=g.cash;advance(g,10);assert.equal(g.cash,cash);assert.equal(g.wave,wave);
    assert.equal(E.startWave(g),true);assert.equal(g.wave,wave+1);assert.equal(E.startWave(g),false);
  }
});
test('skiffs accelerate toward tower, ram once, never shoot or grant suicide money',()=>{
  const g=arena();const ship={...enemy(100,10,0),speed:1.3,attackRange:12,attackCooldown:0};g.enemies=[ship];
  E.tick(g,0.1);assert.ok(ship.x<10);assert.equal(g.projectiles.length,0);assert.ok(ship.speed>1.3);
  advance(g,8);assert.equal(g.enemies.length,0);assert.ok(g.hp<120);assert.equal(g.kills,0);assert.equal(g.waveKills,0);
  assert.equal(g.earnedMoney,0);assert.equal(g.cash,60); // a fleet of suicides earns nothing
  assert.ok(g.effects.length===0||g.effects.every(e=>e.kind!=='enemy-shell'));
  const near=arena();near.enemies=[{...enemy(101,2.9,0),speed:2}];E.tick(near,0.1);
  assert.ok(near.effects.some(e=>e.kind==='ram'));const hp=near.hp;advance(near,1);assert.equal(near.hp,hp);
});
test('simultaneous lethal incoming hit and final kill is defeat; restart keeps only records',()=>{
  const g=arena();Object.assign(g,{wave:10,highWave:9,hp:5,cash:999,earnedMoney:123,bestEarnings:123});
  g.skills.cannonDamage=4;g.enemies=[enemy(100,5,0,10)];E.manualFire(g,5,0);g.projectiles[0].speed=1000;
  g.projectiles.push({id:1001,kind:'enemy-shell',owner:'enemy',x:3.2,z:0,tx:0,tz:0,speed:100,damage:10,ttl:5,radius:0.3});
  E.tick(g,0.02);assert.equal(g.phase,'defeat');assert.equal(g.hp,0);assert.equal(g.highWave,9);assert.equal(g.cash,0);
  assert.deepEqual(g.projectiles,[]);assert.equal(E.skillLevel(g,'cannonDamage'),0);
  const frozen=JSON.stringify(g);advance(g,10);assert.equal(JSON.stringify(g),frozen);
  for(const action of [()=>E.startWave(g),()=>E.manualFire(g,2,2),()=>E.pulse(g),()=>E.launchMissiles(g),()=>E.buySkill(g,'towerHull'),()=>E.setWeapon(g,'cannon')]) assert.equal(action(),false);
  const records=[g.highWave,g.bestEarnings];E.restartGame(g);assert.deepEqual([g.highWave,g.bestEarnings],records);
  assert.deepEqual([g.phase,g.wave,g.earnedMoney,g.kills,g.cash,g.hp],['ready',0,0,0,60,120]);assert.deepEqual(g.loadout,[]);
  assert.equal(E.setWeapon(g,'tesla'),false);
});

test('abilities require ownership AND equipped slot; EMP visibly freezes movement, firing and dive clocks',()=>{
  const g=arena();g.enemies=[{...enemy(100,8,0,1000),speed:1,attackCooldown:0},enemy(101,27,0,1000)];
  assert.equal(E.pulse(g),false);assert.equal(E.useAbility(g,'emp'),false);
  ability(g,'emp');const ship=g.enemies[0];E.tick(g,0.1);const before=ship.x;
  assert.equal(E.useAbility(g,'emp'),true);assert.equal(g.energy,40);assert.equal(E.pulse(g),false);
  const clock=ship.attackCooldown;assert.ok(ship.stunnedFor>=E.stats(g).stunDuration-0.01);
  assert.equal(g.enemies[1].stunnedFor,0);assert.ok(g.effects.some(e=>e.kind==='stun'&&e.x===ship.x));
  advance(g,1);assert.equal(ship.x,before);assert.equal(ship.attackCooldown,clock);advance(g,2.1);assert.ok(ship.x<before);
  assert.equal(E.useAbility(g,'__proto__'),false);
  const sub={...enemy(110,10,0,1000),type:'submarine',diveTimer:0.5};g.enemies=[sub];g.energy=100;g.pulseCooldown=0;
  E.pulse(g);advance(g,1);assert.equal(sub.diveTimer,0.5);assert.equal(sub.submerged,false);
});
test('missiles ascend in real 3D before diving and home once per surfaced live ship, including distant targets',()=>{
  const g=arena();ability(g,'missiles');g.enemies=[enemy(100,12,0,1000),enemy(101,12,3,1000),enemy(102,35,0,1000),{...enemy(103,10,0),submerged:true},enemy(104,8,0,0)];
  assert.equal(E.launchMissiles(g),true);assert.equal(g.energy,55);assert.equal(g.projectiles.length,3);
  assert.equal(new Set(g.projectiles.map(p=>p.targetId)).size,3);
  assert.ok(g.projectiles.every(p=>p.kind==='missile'&&p.phase==='ascent'&&p.y>0&&p.vy>0));
  const m=g.projectiles.find(p=>p.targetId===100),y=m.y;g.enemies[0].z=2;advance(g,0.3);
  assert.ok(m.y>y);assert.equal(m.tz,2);assert.equal(g.enemies[0].hp,1000);
  advance(g,0.5);assert.equal(m.phase,'dive');assert.ok(m.vy<0);
  advance(g,3);assert.ok(g.enemies.filter(e=>[100,101,102].includes(e.id)).every(e=>e.hp<1000));
  assert.ok(g.effects.some(e=>e.kind==='explosion')||g.projectiles.length===0);
});
test('all in-flight missiles reserve distinct target IDs across repeated casts; dead targets divert harmlessly',()=>{
  const g=arena();ability(g,'missiles');g.enemies=[enemy(100,12,0,1000),enemy(101,12,2,1000)];
  E.launchMissiles(g);g.energy=100;g.missileCooldown=0;
  assert.equal(E.launchMissiles(g),false);assert.equal(g.energy,100);
  g.enemies.push(enemy(102,18,0,1000));assert.equal(E.launchMissiles(g),true);
  assert.equal(new Set(g.projectiles.map(p=>p.targetId)).size,3);
  const abandoned=g.projectiles.find(p=>p.targetId===100);g.enemies[0].hp=0;advance(g,0.1);
  assert.equal(abandoned.phase,'divert');assert.equal(abandoned.targetId,null);
  assert.ok(g.projectiles.filter(p=>p.targetId!==null).every(p=>p.targetId!==100));
  const only=arena();ability(only,'missiles');only.enemies=[enemy(200,12,0,1000)];E.launchMissiles(only);
  only.enemies[0].hp=0;only.enemies.push(enemy(201,12,0,1000));advance(only,3);
  assert.equal(only.enemies[0].hp,1000);assert.equal(only.projectiles.length,0);
});
test('airstrike flies an actual moving plane and drops timed falling area bombs, not instant damage',()=>{
  const g=arena();ability(g,'airstrike');g.enemies=[enemy(100,12,4,1000),enemy(101,13,5,1000),enemy(102,-20,-20,1000)];
  assert.equal(E.launchAirstrike(g),true);assert.equal(g.energy,20);assert.equal(E.launchAirstrike(g),false);
  assert.ok(g.enemies.every(e=>e.hp===1000));const plane=g.projectiles.find(p=>p.kind==='aircraft');assert.ok(plane);
  const x=plane.x;advance(g,0.3);assert.ok(plane.x>x);assert.ok(g.enemies.every(e=>e.hp===1000));
  let sawBomb=false,sawFall=false;
  for(let t=0;t<4.5;t+=0.05) {E.tick(g,0.05);sawBomb ||= g.projectiles.some(p=>p.kind==='bomb');sawFall ||= g.projectiles.some(p=>p.kind==='bomb'&&p.vy<0);}
  assert.ok(sawBomb&&sawFall);assert.ok(g.enemies[0].hp<1000);assert.ok(g.enemies[1].hp<1000);assert.equal(g.enemies[2].hp,1000);
  assert.equal(g.projectiles.filter(p=>['aircraft','bomb'].includes(p.kind)).length,0);
});
test('ranged enemies stand off, incoming shells damage on contact; submarines evade hits and fire torpedoes',()=>{
  const g=arena();ability(g,'emp');const ship={...enemy(100,12,0,1000),type:'frigate',speed:2,attackRange:12,attackCooldown:0};g.enemies=[ship];
  E.tick(g,0.01);assert.equal(ship.x,12);assert.equal(g.hp,120);assert.ok(g.projectiles.some(p=>p.kind==='enemy-shell'&&p.vx<0));
  E.pulse(g);const clock=ship.attackCooldown;advance(g,0.7);assert.equal(g.hp,120);assert.equal(ship.attackCooldown,clock);advance(g,0.6);assert.ok(g.hp<120);
  const s=arena();const sub={...enemy(100,10,0,1000),type:'submarine',attackRange:10,attackCooldown:0,diveTimer:0.05};s.enemies=[sub];
  E.tick(s,0.1);assert.equal(sub.submerged,true);assert.ok(s.projectiles.some(p=>p.kind==='torpedo'));
  E.manualFire(s,10,0);advance(s,0.5);assert.equal(sub.hp,1000);advance(s,2.1);assert.equal(sub.submerged,false);assert.ok(s.hp<120);
  E.manualFire(s,10,0);advance(s,0.4);assert.ok(sub.hp<1000);
});

test('sea hazards rotate deterministically, never produce collectible rewards, and expire to calm',()=>{
  const g=E.createGame(0);const sequence=[];
  for(let wave=1;wave<=7;wave++) {
    g.phase='upgrade';E.startWave(g);sequence.push(g.environment.type);assert.deepEqual(g.events,[]);
    assert.ok(['calm','fog','storm','current'].includes(g.environment.type));
  }
  assert.deepEqual(sequence,['calm','fog','current','storm','fog','current','storm']);
  assert.equal(typeof E.collectEvent,'undefined');
  g.spawnRemaining=0;g.enemies=[enemy(100,25,0,10000)];const cash=g.cash;
  const duration=g.environment.duration;assert.ok(duration>0);advance(g,duration+0.1);
  assert.equal(g.environment.type,'calm');assert.equal(g.environment.timeLeft,0);assert.equal(g.cash,cash);assert.deepEqual(g.events,[]);
});
test('fog reduces acquisition, currents move ships, storms impair cooling with deterministic lightning',()=>{
  const fog=arena();fog.enemies=[enemy(100,20,0,10000)];
  for(const id of ['cannonRate','cannonCooling','cannonCapacity','autofire']) fog.skills[id]=1;
  fog.environment={type:'fog',timeLeft:18,duration:18,dx:0,dz:0};
  assert.ok(E.stats(fog).range<20);advance(fog,0.2);assert.equal(fog.projectiles.length,0);
  E.manualFire(fog,20,0);assert.equal(fog.projectiles.length,1); // manual sightline remains literal
  const current=arena();current.enemies=[enemy(100,12,0,10000)];current.environment={type:'current',timeLeft:18,duration:18,dx:0.7,dz:0.35};
  advance(current,0.5);assert.ok(current.enemies[0].x>12);assert.ok(current.enemies[0].z>0);
  const storm=arena();storm.enemies=[enemy(100,25,0,10000)];const calmCooling=E.stats(storm).coolingRate;
  storm.environment={type:'storm',timeLeft:18,duration:18,dx:0,dz:0};assert.ok(E.stats(storm).coolingRate<calmCooling);
  advance(storm,6.1);assert.ok(storm.effects.some(e=>e.kind==='lightning'));assert.equal(storm.enemies[0].hp,10000);assert.ok(storm.energy<100);
});

test('v3 saves preserve validated paid trees, money and loadout at intermission without transient or offline income',()=>{
  const g=E.createGame(1000);g.cash=10000;
  for(const id of ['unlockTesla','unlockEmp','cannonDamage','towerHull']) E.buySkill(g,id);
  E.equipAbility(g,'emp');E.setWeapon(g,'tesla');
  Object.assign(g,{wave:3,highWave:3,phase:'upgrade',cash:321,earnedMoney:500,bestEarnings:700,hp:80,heat:25});
  g.enemies=[enemy(99,5,5)];g.events=[{id:55,type:'ammo'}];
  const raw=JSON.parse(E.serializeGame(g,2000));assert.equal(raw.version,3);
  for(const key of ['enemies','events','projectiles','effects','ammo','scrap','score','upgrades','weaponUpgrades','autoWave']) assert.equal(key in raw,false,key);
  const loaded=E.loadGame(raw,999999999);
  assert.deepEqual([loaded.wave,loaded.phase,loaded.cash,loaded.earnedMoney,loaded.bestEarnings,loaded.highWave,loaded.hp,loaded.heat],[3,'intermission',321,500,700,3,80,25]);
  assert.equal(E.skillLevel(loaded,'cannonDamage'),1);assert.equal(loaded.weapon,'tesla');assert.deepEqual(loaded.loadout,['emp']);
  assert.deepEqual(loaded.enemies,[]);assert.deepEqual(loaded.events,[]);assert.equal(loaded.autoWave,false);
  assert.equal(loaded.lastSavedAt,2000);assert.equal(E.startWave(loaded),true);assert.equal(loaded.wave,4);
});
test('combat reload rolls back to start-of-wave checkpoint, cannot farm partial kills, and saved defeat cannot resurrect',()=>{
  const g=E.createGame(0);g.wave=2;g.highWave=2;g.cash=100;g.earnedMoney=50;g.bestEarnings=50;g.phase='upgrade';
  E.startWave(g);g.spawnRemaining=0;g.enemies=[enemy(100,5,0,10),enemy(101,30,0,1000)];
  E.manualFire(g,5,0);advance(g,0.2);assert.ok(g.cash>100);
  const loaded=E.loadGame(E.serializeGame(g,5),10);
  assert.deepEqual([loaded.wave,loaded.phase,loaded.cash,loaded.earnedMoney],[2,'intermission',100,50]);
  assert.equal(loaded.bestEarnings,g.bestEarnings);assert.equal(loaded.highWave,2);assert.equal(loaded.heat,0);
  g.hp=0;E.tick(g,0.01);const dead=E.loadGame(E.serializeGame(g,20),30);
  assert.equal(dead.phase,'defeat');assert.equal(dead.cash,0);assert.equal(dead.hp,0);assert.equal(dead.bestEarnings,g.bestEarnings);
  assert.ok(Object.values(dead.skills).every(n=>n===0));
});
test('v1 and v2 migrate records only, never old wave gates, ammo, research or trees',()=>{
  for(const version of [1,2]) {
    const old=E.loadGame({version,bestWave:32,highScore:500,wave:50,phase:'combat',scrap:1e9,ammo:999,research:999,weapon:'rail',upgrades:{hull:50},weaponUpgrades:{cannon:{damage:50}}},0);
    assert.deepEqual([old.highWave,old.bestEarnings,old.cash,old.wave,old.weapon],[32,500,60,0,'cannon']);
    assert.ok(Object.values(old.skills).every(n=>n===0));assert.deepEqual(old.loadout,[]);
    assert.equal('research' in old,false);assert.equal('ammo' in old,false);assert.equal(E.setWeapon(old,'rail'),false);
  }
});
test('hostile and malformed saves cannot inject shape, invalid levels, prerequisite bypasses or duplicate loadout',()=>{
  const fresh=E.createGame(0);
  for(const input of ['{',null,[],42,{version:99},'x'.repeat(200001)]) assert.deepEqual(E.loadGame(input,0),fresh);
  const cycle={};cycle.self=cycle;assert.deepEqual(E.loadGame(cycle,0),fresh);
  assert.deepEqual(E.loadGame({get version(){throw Error('hostile');}},0),fresh);
  const bad=JSON.parse('{"version":3,"wave":1.5,"cash":1e400,"hp":120,"energy":-4,"earnedMoney":"9","skills":{"cannonDamage":"99","cannonRate":999999,"towerHull":1.5,"autofire":1,"slot3":1,"railDamage":2,"unlockEmp":1},"loadout":["emp","emp","missiles","__proto__"],"weapon":"rail","heat":-8,"overheated":"yes","overheatTimer":-4,"__proto__":{"polluted":true},"enemies":[{}]}');
  const safe=E.loadGame(bad,0);assert.equal(safe.wave,0);assert.equal(safe.cash,60);assert.equal(safe.weapon,'cannon');assert.equal(safe.energy,100);
  for(const id of ['cannonDamage','cannonRate','towerHull','autofire','slot3','railDamage']) assert.equal(E.skillLevel(safe,id),0,id);
  assert.deepEqual(safe.loadout,['emp']);assert.equal({}.polluted,undefined);assert.equal('polluted' in safe,false);assert.deepEqual(safe.enemies,[]);
  assert.equal(safe.overheated,false);assert.equal(safe.heat,0);assert.equal(safe.overheatTimer,0);
  const poisoned=E.loadGame({version:3,skills:{unlockRail:1},unlocked:['tesla'],weapon:'tesla',hp:0,cash:500},0);
  assert.equal(poisoned.phase,'defeat');assert.equal(poisoned.cash,0);assert.equal(E.skillLevel(poisoned,'unlockRail'),0);
});
test('saved heat lock cannot bypass cooling or poison timers on reload',()=>{
  const g=arena();g.enemies=[enemy(100,25,0,1000)];g.heat=99;E.manualFire(g,0,20);assert.ok(g.overheated);
  // A legitimate shopping save retains the lock; combat uses its earlier checkpoint.
  g.phase='upgrade';const loaded=E.loadGame(E.serializeGame(g,20),30);
  assert.equal(loaded.overheated,true);assert.equal(loaded.overheatTimer,4);assert.equal(loaded.heat,100);
  E.startWave(loaded);assert.equal(E.manualFire(loaded,0,10),false);
  loaded.spawnRemaining=0;loaded.enemies=[enemy(100,25,0,1000)];advance(loaded,4.1);assert.equal(loaded.overheated,false);
});

test('missile ascent velocities point skyward and losing a submerged target never redirects into another assignment',()=>{
  const g=arena();ability(g,'missiles');g.enemies=[enemy(100,12,0,1000),enemy(101,12,2,1000)];E.launchMissiles(g);
  const m=g.projectiles[0];assert.equal(m.vx,0);assert.equal(m.vz,0);assert.ok(m.vy>0);
  g.enemies[0].submerged=true;E.tick(g,0.02);assert.equal(m.phase,'divert');assert.equal(m.targetId,null);
  assert.equal(g.projectiles.filter(p=>p.targetId===101).length,1);
});
test('shopping reload retains actual weapon and ability cooldowns with bounded strict timers',()=>{
  const g=E.createGame(0);Object.assign(g,{phase:'upgrade',cooldown:0.4,pulseCooldown:8,missileCooldown:5,airstrikeCooldown:12});
  const loaded=E.loadGame(E.serializeGame(g,1),2);
  assert.deepEqual([loaded.cooldown,loaded.pulseCooldown,loaded.missileCooldown,loaded.airstrikeCooldown],[0.4,8,5,12]);
  const bad=E.loadGame({version:3,cooldown:-2,pulseCooldown:1e99,missileCooldown:'8',airstrikeCooldown:NaN},0);
  assert.deepEqual([bad.cooldown,bad.pulseCooldown,bad.missileCooldown,bad.airstrikeCooldown],[0,0,0,0]);
});
test('storm lightning is a reactor hazard, not a source of free enemy kills or money',()=>{
  const g=arena();g.enemies=[enemy(100,25,0,1)];g.environment={type:'storm',timeLeft:18,duration:18,dx:0,dz:0};
  advance(g,6.1);assert.equal(g.enemies.length,1);assert.equal(g.enemies[0].hp,1);assert.equal(g.cash,60);assert.equal(g.earnedMoney,0);
  assert.ok(g.energy<100);assert.ok(g.effects.some(e=>e.kind==='lightning'));
});

test('all skill levels are capped, every upgrade changes its named statistic and invalid actions are inert',()=>{
  const g=E.createGame(0);g.cash=1e9;
  const fields={cannonDamage:['cannon','damage'],cannonRate:['cannon','fireRate'],cannonCooling:['cannon','coolingRate'],cannonCapacity:['cannon','heatCapacity'],
    cannonMultishot:['cannon','projectileCount'],towerHull:['cannon','maxHp'],towerReactor:['cannon','maxEnergy'],teslaDamage:['tesla','damage'],teslaBounces:['tesla','bounces'],
    teslaRange:['tesla','bounceRange'],railDamage:['rail','damage'],railCharge:['rail','chargeTime'],railPierce:['rail','pierce'],empPower:['cannon','stunDuration']};
  for(const id of ['unlockTesla','unlockRail','unlockEmp','unlockMissiles','unlockAirstrike','cannonDamage']) E.buySkill(g,id);
  for(const [id,[weapon,field]] of Object.entries(fields)) {
    const before=E.stats(g,weapon)[field];assert.equal(E.buySkill(g,id),true);
    assert.notEqual(E.stats(g,weapon)[field],before,id);
  }
  for(const id of Object.keys(E.SKILLS)) {
    // Already-declared DAG prerequisites, never undocumented wave conditions.
    for(const parent of E.SKILLS[id].parents) if(!E.skillLevel(g,parent)) assert.equal(E.buySkill(g,parent),true);
    while(E.skillLevel(g,id)<E.SKILLS[id].max) assert.equal(E.buySkill(g,id),true,id);
    assert.equal(E.skillCost(g,id),Infinity);assert.equal(E.buySkill(g,id),false);
  }
  assert.equal(E.stats(g,'cannon').projectileCount,5);assert.equal(E.stats(g,'tesla').bounces,12);assert.equal(E.stats(g,'rail').pierce,20);
  for(const weapon of Object.keys(E.WEAPONS)) for(const value of Object.values(E.stats(g,weapon))) assert.ok(Number.isFinite(value)&&value>=0);
  const frozen=JSON.stringify(g);for(const bad of ['__proto__','constructor','missing',null,{},[]]) {assert.equal(E.setWeapon(g,bad),false);assert.equal(E.setPriority(g,bad),false);assert.equal(E.equipAbility(g,bad),false);}
  assert.equal(JSON.stringify(g),frozen);
  assert.equal(E.setPriority(g,'strongest'),true);assert.equal(g.priority,'strongest');
});
test('invalid deltas are ignored, long frames bounded and pools refuse partial costly casts',()=>{
  const g=E.createGame(0),before=JSON.stringify(g);for(const dt of [NaN,Infinity,-1,0,'1',null]) E.tick(g,dt);assert.equal(JSON.stringify(g),before);
  E.tick(g,10000);assert.ok(g.time<=1.00000001);
  const full=arena();ability(full,'missiles');full.enemies=[enemy(100,12,0,1000),enemy(101,14,0,1000)];
  full.projectiles=Array.from({length:E.LIMITS.projectiles-1},(_,id)=>({id,kind:'shell',owner:'player',x:0,z:0,tx:0,tz:100,speed:1,damage:1,ttl:6}));
  assert.equal(E.launchMissiles(full),false);assert.equal(full.energy,100);assert.equal(full.missileCooldown,0);
  full.skills.cannonMultishot=1;full.skills.cannonDamage=1;E.manualFire(full,10,0);assert.equal(full.projectiles.length,E.LIMITS.projectiles-1);assert.equal(full.heat,0);
});
test('first enemy spawns immediately at a playable distance, idle start never fires, bosses and subs remain',()=>{
  const g=E.createGame(0);E.startWave(g);E.tick(g,0.001);assert.equal(g.enemies.length,1);assert.ok(Math.hypot(g.enemies[0].x,g.enemies[0].z)>18.9);
  assert.equal(g.projectiles.length,0);advance(g,4);assert.equal(g.hp,120);assert.equal(g.lastShot,undefined);
  const late=E.createGame(0);late.wave=4;E.startWave(late);advance(late,4.5);
  assert.ok(late.enemies.some(e=>e.type==='boss'));assert.ok(late.enemies.some(e=>e.type==='submarine'));assert.ok(late.enemies.some(e=>e.type==='armored'));
});
test('earned-money-only manual opening clears five waves with heat discipline and affordable between-wave purchases',()=>{
  const g=E.createGame(0),measurements=[];
  for(let wave=1;wave<=5;wave++) {
    for(const id of ['cannonDamage','cannonCooling','towerHull']) if(g.cash>=E.skillCost(g,id)) E.buySkill(g,id);
    E.startWave(g);let seconds=0,locks=0,was=false;
    while(g.phase==='combat'&&seconds<90) {
      const ship=g.enemies.filter(e=>e.hp>0&&!e.submerged).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
      const s=E.stats(g);
      if(ship&&!g.overheated&&g.cooldown<=0.001&&g.heat+s.heatPerShot<s.heatCapacity-1) E.manualFire(g,ship.x,ship.z);
      E.tick(g,0.05);seconds+=0.05;if(g.overheated&&!was) locks++;was=g.overheated;
    }
    assert.equal(g.phase,'upgrade',`wave ${wave}`);assert.equal(g.waveKills,g.waveTotal);assert.equal(locks,0);
    assert.ok(g.hp>0);assert.equal(g.highWave,wave);assert.equal(E.skillLevel(g,'autofire'),0);
    measurements.push({wave,seconds:Number(seconds.toFixed(2)),hp:Number(g.hp.toFixed(2)),cash:g.cash,earned:g.earnedMoney,kills:g.waveKills});
  }
  assert.ok(measurements[0].seconds<15);assert.ok(measurements[0].earned>=E.SKILLS.cannonDamage.cost);
  console.log('manual opening:',JSON.stringify(measurements));
});
