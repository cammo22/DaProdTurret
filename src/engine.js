// Pure deterministic arcade simulation. Coordinates and velocities are world units/seconds.
export const WEAPONS = Object.freeze({
  cannon:{name:'Cannone',description:'Proiettili diretti.',unlockWave:1,color:0xffbc61,ammoCost:1},
  tesla:{name:'Tesla',description:'Rimbalzi elettrici sequenziali.',unlockWave:25,color:0x56e6ff,ammoCost:2},
  rail:{name:'Railgun',description:'Carica e perfora.',unlockWave:50,color:0xb6a2ff,ammoCost:4},
});
export const UPGRADES = Object.freeze({
  hull:{name:'Scafo',description:'+30 HP e riparazione.',baseCost:45},
  reactor:{name:'Reattore',description:'+20 energia, rigenerazione e abilità.',baseCost:45},
  salvage:{name:'Recupero',description:'+18% rottami dalle navi.',baseCost:40},
});
export const WEAPON_UPGRADES = Object.freeze({
  cannon:{damage:{name:'Danno',description:'+30% danno.',baseCost:30},rate:{name:'Cadenza',description:'+18% cadenza.',baseCost:35},magazine:{name:'Caricatore',description:'+8 munizioni, ricarica più rapida.',baseCost:35}},
  tesla:{damage:{name:'Danno',description:'+30% danno.',baseCost:55},bounces:{name:'Rimbalzi',description:'+1 rimbalzo.',baseCost:65},range:{name:'Arco',description:'+1 portata rimbalzi, ricarica più rapida.',baseCost:50}},
  rail:{damage:{name:'Danno',description:'+35% danno.',baseCost:70},charge:{name:'Carica',description:'Carica e ricarica più rapide.',baseCost:65},pierce:{name:'Perfora',description:'+1 bersaglio perforato.',baseCost:70}},
});
const has=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
const bounded=(v,fallback,max,integer=false)=>{
  if(typeof v!=='number'||!Number.isFinite(v)) return fallback;
  const n=Math.max(0,Math.min(max,v)); return integer?Math.floor(n):n;
};
export function createGame(now=Date.now()) {
  return {version:2,phase:'ready',wave:0,bestWave:0,highScore:0,score:0,scrap:60,hp:120,
    energy:100,ammo:36,reloadTimer:0,kills:0,weapon:'cannon',unlocked:['cannon'],priority:'nearest',autoWave:true,
    upgrades:{hull:0,reactor:0,salvage:0},
    weaponUpgrades:{cannon:{damage:0,rate:0,magazine:0},tesla:{damage:0,bounces:0,range:0},rail:{damage:0,charge:0,pierce:0}},
    enemies:[],projectiles:[],effects:[],events:[],time:0,waveKills:0,waveTotal:0,spawnRemaining:0,spawnTimer:0,
    cooldown:0,pulseCooldown:0,missileCooldown:0,nextId:1,aim:null,pendingManual:null,charge:null,notice:'',
    lastSavedAt:bounded(now,0,8.64e15,true)};
}
export function stats(g,weapon=g.weapon) {
  if(!has(WEAPONS,weapon)) weapon='cannon';
  const u=g.upgrades,w=g.weaponUpgrades[weapon];
  return {damage:weapon==='rail'?110*(1+w.damage*0.35):weapon==='tesla'?30*(1+w.damage*0.3):20*(1+w.damage*0.3),
    fireRate:weapon==='cannon'?2.4*(1+w.rate*0.18):weapon==='tesla'?1.7:0.85,
    maxHp:120+u.hull*30,maxEnergy:100+u.reactor*20,energyRegen:10+u.reactor*2,
    range:26,maxAmmo:36+(weapon==='cannon'?w.magazine*8:0),
    reloadTime:weapon==='cannon'?Math.max(0.55,2.4/(1+w.magazine*0.12)):weapon==='tesla'?Math.max(0.6,2.6/(1+w.range*0.08)):Math.max(0.7,3/(1+w.charge*0.1)),
    ammoCost:WEAPONS[weapon].ammoCost,chargeTime:weapon==='rail'?Math.max(0.2,0.85/(1+w.charge*0.18)):0,
    bounces:weapon==='tesla'?Math.min(12,3+w.bounces):0,pierce:weapon==='rail'?Math.min(20,3+w.pierce):1,
    stunDuration:2.8+Math.min(2,u.reactor*0.1),missileCount:3+Math.min(3,Math.floor(u.reactor/3))};
}

export const LIMITS=Object.freeze({enemies:40,projectiles:256,effects:200,events:8});
const point=(x,z)=>typeof x==='number'&&typeof z==='number'&&Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)<=150;
function effect(g,kind,x,z,tx=x,tz=z,ttl=0.3) {
  g.effects.push({id:g.nextId++,kind,x,z,tx,tz,ttl,maxTtl:ttl});
  if(g.effects.length>LIMITS.effects) g.effects.splice(0,g.effects.length-LIMITS.effects);
}
function projectile(g,kind,owner,x,z,tx,tz,speed,damage,extra={}) {
  if(g.projectiles.length>=LIMITS.projectiles) return null;
  const d=Math.hypot(tx-x,tz-z);
  const p={id:g.nextId++,kind,owner,x,z,tx,tz,vx:d?(tx-x)/d*speed:0,vz:d?(tz-z)/d*speed:0,
    speed,damage,ttl:6,radius:0.45,...extra};
  g.projectiles.push(p); return p;
}
export function startWave(g) {
  if(!['ready','intermission','upgrade'].includes(g.phase)||g.hp<=0||g.wave>=1000) return false;
  g.phase='combat';g.wave++;g.waveKills=0;g.waveTotal=Math.min(40,6+g.wave);
  g.spawnRemaining=g.waveTotal;g.spawnTimer=0;unlockWeapons(g);
  if(g.wave===2||g.wave%3===0) spawnSeaEvent(g);
  return true;
}
function target(g) {
  const eligible=g.enemies.filter(e=>e.hp>0&&!e.submerged&&Math.hypot(e.x,e.z)<=stats(g).range);
  const rank=e=>g.priority==='strongest'?-e.hp:g.priority==='weakest'?e.hp:Math.hypot(e.x,e.z);
  return eligible.sort((a,b)=>rank(a)-rank(b)||a.id-b.id)[0];
}
function fire(g) {
  if(g.phase!=='combat'||g.cooldown>1e-9||g.reloadTimer>0||g.charge||g.projectiles.length>=LIMITS.projectiles) return false;
  const s=stats(g); if(g.ammo<s.ammoCost) return false;
  const held=g.aim&&point(g.aim.x,g.aim.z)?g.aim:null;
  const aim=g.pendingManual||held||target(g); if(!aim) return false;
  const manual=!!(g.pendingManual||held);
  if(g.weapon==='rail') {
    g.ammo-=s.ammoCost;g.pendingManual=null;
    g.charge={x:aim.x,z:aim.z,remaining:s.chargeTime,duration:s.chargeTime};
    g._chargeManual=manual;effect(g,'charge',0,0,aim.x,aim.z,s.chargeTime);return true;
  }
  if(g.weapon==='tesla') projectile(g,'tesla-orb','player',0,0,aim.x,aim.z,46,s.damage,
    {bouncesLeft:s.bounces,hitIds:[],sx:0,sz:0});
  else projectile(g,'shell','player',0,0,aim.x,aim.z,32,s.damage);
  g.ammo-=s.ammoCost;g.cooldown=1/s.fireRate;
  if(g.ammo<s.ammoCost) g.reloadTimer=s.reloadTime;
  g.lastShot={x:aim.x,z:aim.z,weapon:g.weapon,time:g.time,manual};
  effect(g,'muzzle',0,0,aim.x,aim.z,0.12); effect(g,'shot',0,0,aim.x,aim.z,0.18);
  g.pendingManual=null;return true;
}
export function manualFire(g,x,z) {
  if(g.phase!=='combat'||!point(x,z)) return false;
  g.pendingManual={x,z};fire(g);return true;
}
function step(g,dt) {
  if(g.phase==='defeat') return;
  g.time+=dt;
  g.effects=g.effects.filter(e=>(e.ttl-=dt)>0);
  g.events=g.events.filter(e=>(e.ttl-=dt)>0);
  g.cooldown=Math.max(0,g.cooldown-dt);
  g.pulseCooldown=Math.max(0,g.pulseCooldown-dt);
  g.missileCooldown=Math.max(0,g.missileCooldown-dt);
  const s=stats(g);
  g.energy=Math.min(s.maxEnergy,g.energy+s.energyRegen*dt);
  if(g.reloadTimer>0) {
    g.reloadTimer=Math.max(0,g.reloadTimer-dt);
    if(g.reloadTimer<1e-9) {g.reloadTimer=0;g.ammo=s.maxAmmo;}
  } else if(g.ammo<s.ammoCost&&!g.charge) g.reloadTimer=s.reloadTime;
  if(g.phase!=='combat') {
    if(g.phase==='intermission') {
      g.spawnTimer=Math.max(0,g.spawnTimer-dt);
      updateProjectiles(g,dt);
      if(g.autoWave&&g.spawnTimer<=1e-9) startWave(g);
    }
    return;
  }
  g.spawnTimer-=dt;
  if(g.spawnRemaining>0&&g.spawnTimer<=0) {spawn(g);g.spawnTimer+=Math.max(0.45,1.05-g.wave*0.009);}
  reap(g);
  updateEnemies(g,dt);
  updateCharge(g,dt);
  fire(g);
  updateProjectiles(g,dt);
  if(g.hp<=0) {defeat(g);return;}
  completeWave(g);
}
export function tick(g,dt) {
  if(typeof dt!=='number'||!Number.isFinite(dt)||dt<=0) return;
  let left=Math.min(dt,1);
  while(left>1e-10) {const delta=Math.min(left,1/60);step(g,delta);left-=delta;}
}

function addScore(g,amount) {g.score=Math.min(1e9,g.score+amount);g.highScore=Math.max(g.highScore,g.score);}
function reap(g) {
  g.enemies=g.enemies.filter(e=>{
    if(e.hp>0) return true;
    g.scrap=Math.min(1e9,g.scrap+Math.round(e.reward*(1+g.upgrades.salvage*0.18)));
    g.kills++;g.waveKills++;addScore(g,Math.round(e.reward*10));
    effect(g,'explosion',e.x,e.z,e.x,e.z,0.55);return false;
  });
}
// First contact along a segment, including starting overlaps and tangency.
function contact(ax,az,bx,bz,cx,cz,radius) {
  const dx=bx-ax,dz=bz-az,ox=ax-cx,oz=az-cz;
  const c=ox*ox+oz*oz-radius*radius;if(c<=0) return 0;
  const a=dx*dx+dz*dz;if(a<1e-16) return null;
  const b=2*(ox*dx+oz*dz),disc=b*b-4*a*c;
  if(disc<0) return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
function radius(e) {return e.type==='boss'?1.5:e.type==='armored'?0.85:0.65;}
function updateProjectiles(g,dt) {
  const live=[];
  for(const p of g.projectiles) {
    if(p.targetId!==undefined) {
      let t=g.enemies.find(e=>e.id===p.targetId&&e.hp>0&&!e.submerged);
      if(!t&&p.kind==='missile') t=g.enemies.filter(e=>e.hp>0&&!e.submerged)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)||a.id-b.id)[0];
      if(t) {p.targetId=t.id;p.tx=t.x;p.tz=t.z;}
    }
    const direction=Math.hypot(p.tx-p.x,p.tz-p.z);
    p.vx=direction?(p.tx-p.x)/direction*p.speed:0;p.vz=direction?(p.tz-p.z)/direction*p.speed:0;
    const distance=Math.hypot(p.tx-p.x,p.tz-p.z),travel=Math.min(p.speed*dt,distance);
    const nx=p.x+(distance?(p.tx-p.x)/distance*travel:0),nz=p.z+(distance?(p.tz-p.z)/distance*travel:0);
    if(p.owner==='enemy') {
      const t=contact(p.x,p.z,nx,nz,0,0,2.8+(p.radius??0.3));p.ttl-=dt;
      if(t!==null) {g.hp=Math.max(0,g.hp-p.damage);effect(g,'hit',nx,nz,0,0,0.4);}
      else if(p.ttl>0&&travel<distance-1e-9) {p.x=nx;p.z=nz;live.push(p);}
      continue;
    }
    let hit=null,first=Infinity;
    for(const e of g.enemies) if(e.hp>0&&!e.submerged&&!p.hitIds?.includes(e.id)) {
      const t=contact(p.x,p.z,nx,nz,e.x,e.z,radius(e)+(p.radius??0.25));
      if(t!==null&&(t<first||(t===first&&e.id<hit.id))) {first=t;hit=e;}
    }
    p.ttl-=dt;
    if(hit) {
      if(p.kind==='missile') missileBlast(g,p,p.x+(nx-p.x)*first,p.z+(nz-p.z)*first);
      else hit.hp-=p.damage;
      effect(g,'hit',p.x+(nx-p.x)*first,p.z+(nz-p.z)*first);
      if(p.kind==='tesla-orb') {
        effect(g,'tesla',p.sx,p.sz,hit.x,hit.z,0.22);p.hitIds.push(hit.id);
        const reach=6+g.weaponUpgrades.tesla.range;
        const next=g.enemies.filter(e=>e.hp>0&&!e.submerged&&!p.hitIds.includes(e.id)&&Math.hypot(e.x-hit.x,e.z-hit.z)<=reach)
          .sort((a,b)=>Math.hypot(a.x-hit.x,a.z-hit.z)-Math.hypot(b.x-hit.x,b.z-hit.z)||a.id-b.id)[0];
        if(next&&p.bouncesLeft>0&&p.ttl>0) {
          p.bouncesLeft--;p.damage*=0.82;p.x=hit.x;p.z=hit.z;p.sx=hit.x;p.sz=hit.z;
          p.tx=next.x;p.tz=next.z;p.targetId=next.id;live.push(p);
        }
      }
    }
    else if(travel>=distance-1e-9||p.ttl<=0) {
      if(p.kind==='missile') missileBlast(g,p,nx,nz);else effect(g,'splash',nx,nz);
    }
    else {p.x=nx;p.z=nz;live.push(p);}
  }
  g.projectiles=live;reap(g);
}

export function pulse(g) {
  if(g.phase!=='combat'||g.hp<=0||g.energy<60||g.pulseCooldown>0) return false;
  const s=stats(g);g.energy-=60;g.pulseCooldown=12;
  effect(g,'pulse',0,0,0,0,0.7);
  for(const e of g.enemies) if(e.hp>0&&Math.hypot(e.x,e.z)<=s.range) {
    e.stunnedFor=Math.max(e.stunnedFor,s.stunDuration);
    e.hp-=12;effect(g,'stun',e.x,e.z,e.x,e.z,s.stunDuration);effect(g,'hit',e.x,e.z);
  }
  reap(g);return true;
}
function updateEnemies(g,dt) {
  for(const e of g.enemies) {
    if(e.hp<=0) continue;
    if(e.stunnedFor>0) {e.stunnedFor=Math.max(0,e.stunnedFor-dt);continue;}
    if(e.type==='submarine') {
      e.diveTimer-=dt;
      if(e.diveTimer<=1e-9) {
        e.submerged=!e.submerged;e.diveTimer=e.submerged?2.5:4;
        effect(g,'splash',e.x,e.z,e.x,e.z,0.45);
      }
    }
    const distance=Math.hypot(e.x,e.z),stop=e.attackRange||2.8;
    const move=Math.min(e.speed*dt,Math.max(0,distance-stop));
    if(distance>0) {e.x*=1-move/distance;e.z*=1-move/distance;}
    e.attackCooldown=Math.max(0,e.attackCooldown-dt);
    if(Math.hypot(e.x,e.z)<=stop+1e-7&&e.attackCooldown<=0) {
      const damage={skiff:5,frigate:8,armored:10,boss:16,submarine:12}[e.type]??5;
      if(stop>3) projectile(g,e.type==='submarine'?'torpedo':'enemy-shell','enemy',e.x,e.z,0,0,e.type==='submarine'?6:8,damage,{radius:0.3});
      else {g.hp=Math.max(0,g.hp-damage);effect(g,'hit',0,0);}
      e.attackCooldown=e.type==='boss'?1.8:e.type==='submarine'?3.2:2.7;
    }
  }
}

function updateCharge(g,dt) {
  if(!g.charge) return;
  g.charge.remaining=Math.max(0,g.charge.remaining-dt);
  if(g.charge.remaining>1e-9) return;
  const c=g.charge,s=stats(g,'rail'),d=Math.hypot(c.x,c.z),tx=d?c.x/d*s.range:0,tz=d?c.z/d*s.range:0;
  const hits=g.enemies.filter(e=>e.hp>0&&!e.submerged).map(e=>({e,t:contact(0,0,tx,tz,e.x,e.z,radius(e)+0.35)}))
    .filter(h=>h.t!==null&&d>0).sort((a,b)=>a.t-b.t||a.e.id-b.e.id).slice(0,s.pierce);
  for(const {e} of hits) {e.hp-=s.damage;effect(g,'hit',e.x,e.z);}
  effect(g,'rail',0,0,tx,tz,0.45);effect(g,'muzzle',0,0,c.x,c.z,0.2);
  g.lastShot={x:c.x,z:c.z,weapon:'rail',time:g.time,manual:!!g._chargeManual};
  delete g._chargeManual;g.charge=null;g.cooldown=1/s.fireRate;
  if(g.ammo<s.ammoCost) g.reloadTimer=s.reloadTime;
  reap(g);
}

export function launchMissiles(g) {
  const s=stats(g),targets=g.enemies.filter(e=>e.hp>0&&!e.submerged&&Math.hypot(e.x,e.z)<=26)
    .sort((a,b)=>b.hp-a.hp||a.id-b.id);
  if(g.phase!=='combat'||g.hp<=0||g.energy<45||g.missileCooldown>0||!targets.length||g.projectiles.length+s.missileCount>LIMITS.projectiles) return false;
  g.energy-=45;g.missileCooldown=9;
  for(let i=0;i<s.missileCount;i++) {
    const t=targets[i%targets.length];
    projectile(g,'missile','player',(i-(s.missileCount-1)/2)*0.4,0,t.x,t.z,20,65+g.upgrades.reactor*5,{targetId:t.id,radius:0.3});
  }
  effect(g,'missile-launch',0,0,targets[0].x,targets[0].z,0.4);return true;
}
function missileBlast(g,p,x,z) {
  for(const e of g.enemies) if(e.hp>0&&!e.submerged&&Math.hypot(e.x-x,e.z-z)<=2.8+radius(e)) e.hp-=p.damage;
  effect(g,'explosion',x,z,x,z,0.6);
}

export function upgradeCost(g,id) {
  return has(UPGRADES,id)&&g.upgrades[id]<50?Math.ceil(UPGRADES[id].baseCost*1.28**g.upgrades[id]):Infinity;
}
export function buyUpgrade(g,id) {
  const cost=upgradeCost(g,id);
  if(g.phase==='defeat'||!Number.isFinite(cost)||g.scrap<cost) return false;
  g.scrap-=cost;g.upgrades[id]++;
  if(id==='hull') g.hp=Math.min(stats(g).maxHp,g.hp+30);
  if(id==='reactor') g.energy=Math.min(stats(g).maxEnergy,g.energy+20);
  return true;
}
export function weaponUpgradeCost(g,weapon,id) {
  return has(WEAPON_UPGRADES,weapon)&&has(WEAPON_UPGRADES[weapon],id)&&g.weaponUpgrades[weapon][id]<50
    ?Math.ceil(WEAPON_UPGRADES[weapon][id].baseCost*1.25**g.weaponUpgrades[weapon][id]):Infinity;
}
export function buyWeaponUpgrade(g,weapon,id) {
  const cost=weaponUpgradeCost(g,weapon,id);
  if(g.phase==='defeat'||!Number.isFinite(cost)||g.scrap<cost||!g.unlocked.includes(weapon)) return false;
  const before=stats(g,weapon);g.scrap-=cost;g.weaponUpgrades[weapon][id]++;
  if(weapon===g.weapon&&id==='magazine') g.ammo+=stats(g,weapon).maxAmmo-before.maxAmmo;
  return true;
}

function unlockWeapons(g) {
  g.unlocked=Object.keys(WEAPONS).filter(id=>id==='cannon'||g.wave>=WEAPONS[id].unlockWave);
}
export function setWeapon(g,id) {
  if(!has(WEAPONS,id)||g.phase==='defeat'||g.charge) return false;
  unlockWeapons(g);
  if(!g.unlocked.includes(id)) return false;
  g.weapon=id;g.ammo=Math.min(g.ammo,stats(g).maxAmmo);return true;
}
export function setPriority(g,id) {
  if(g.phase==='defeat'||!['nearest','strongest','weakest'].includes(id)) return false;
  g.priority=id;return true;
}

function spawn(g) {
  if(g.enemies.length>=LIMITS.enemies) return;
  const index=g.waveTotal-g.spawnRemaining,angle=index*2.399963229728653+g.wave*0.63,r=19+index%5;
  const type=g.wave%5===0&&index===0?'boss':g.wave>=4&&index%6===3?'submarine':
    g.wave>=4&&index%5===2?'armored':g.wave>=2&&index%4===1?'frigate':'skiff';
  const p={skiff:{hp:25,speed:1.3,reward:9,range:2.8},frigate:{hp:48,speed:1.05,reward:16,range:12},
    armored:{hp:85,speed:0.8,reward:23,range:10},boss:{hp:280,speed:0.75,reward:100+g.wave*5,range:14},
    submarine:{hp:55,speed:1.2,reward:20,range:11}}[type];
  const hp=p.hp*(1+(g.wave-1)*0.065);
  g.enemies.push({id:g.nextId++,type,x:Math.cos(angle)*r,z:Math.sin(angle)*r,hp,maxHp:hp,
    speed:p.speed,reward:p.reward,attackCooldown:0.7,stunnedFor:0,submerged:false,diveTimer:2+index%3,attackRange:p.range});
  g.spawnRemaining--;
}
function completeWave(g) {
  if(g.phase!=='combat'||g.hp<=0||g.spawnRemaining>0||g.enemies.length||g.projectiles.some(p=>p.owner==='enemy')) return;
  g.phase=g.wave%10===0?'upgrade':'intermission';g.spawnTimer=2;
  g.bestWave=Math.max(g.bestWave,g.wave);g.scrap=Math.min(1e9,g.scrap+12+g.wave*3);addScore(g,100*g.wave);
  const s=stats(g);g.hp=Math.min(s.maxHp,g.hp+s.maxHp*0.12);g.energy=Math.min(s.maxEnergy,g.energy+20);
  g.charge=null;delete g._chargeManual;g.pendingManual=null;
  g.notice=g.phase==='upgrade'?'Migliora e continua.':`Ondata ${g.wave} completata.`;
}

function defeat(g) {
  g.phase='defeat';g.hp=0;g.scrap=0;g.energy=0;g.ammo=0;
  g.upgrades={hull:0,reactor:0,salvage:0};g.weaponUpgrades=createGame(0).weaponUpgrades;
  g.weapon='cannon';g.unlocked=['cannon'];g.enemies=[];g.projectiles=[];g.events=[];
  g.charge=null;delete g._chargeManual;g.aim=null;g.pendingManual=null;g.spawnRemaining=0;
  g.highScore=Math.max(g.highScore,g.score);g.notice='Stazione perduta.';
}
export function restartGame(g) {
  const highScore=Math.max(g.highScore,g.score),bestWave=g.bestWave,stamp=g.lastSavedAt;
  for(const key of Object.keys(g)) delete g[key];
  Object.assign(g,createGame(stamp),{highScore,bestWave});
}

function spawnSeaEvent(g) {
  if(g.events.length>=LIMITS.events) return;
  const types=['repair','ammo','salvage','supply'];
  const type=g.wave===2?'supply':types[Math.floor(g.wave/3)%types.length];
  const angle=g.wave*1.71,r=8+g.wave%4;
  g.events.push({id:g.nextId++,type,x:Math.cos(angle)*r,z:Math.sin(angle)*r,ttl:28,value:40+g.wave*2});
  effect(g,'event',Math.cos(angle)*r,Math.sin(angle)*r,Math.cos(angle)*r,Math.sin(angle)*r,0.8);
}
export function collectEvent(g,id) {
  if(g.phase!=='combat'||g.hp<=0||!Number.isSafeInteger(id)) return false;
  const index=g.events.findIndex(e=>e.id===id&&e.ttl>0);
  if(index<0) return false;
  const event=g.events[index],s=stats(g);
  if(!['supply','repair','ammo','salvage'].includes(event.type)||!Number.isFinite(event.value)||event.value<=0) return false;
  if(event.type==='repair') g.hp=Math.min(s.maxHp,g.hp+event.value);
  else if(event.type==='ammo') {g.ammo=s.maxAmmo;g.reloadTimer=0;}
  else if(event.type==='salvage') g.scrap=Math.min(1e9,g.scrap+event.value);
  else {g.energy=Math.min(s.maxEnergy,g.energy+event.value);g.ammo=Math.min(s.maxAmmo,g.ammo+12);}
  g.events.splice(index,1);addScore(g,25);
  effect(g,'event',event.x,event.z,event.x,event.z,0.6);
  return true;
}

const SAVE_FIELDS=['version','phase','wave','bestWave','highScore','score','scrap','hp','energy','ammo',
  'reloadTimer','kills','weapon','priority','upgrades','weaponUpgrades','lastSavedAt'];
export function serializeGame(g,now=Date.now()) {
  g.lastSavedAt=bounded(now,0,8.64e15,true);
  const data={};for(const key of SAVE_FIELDS) data[key]=g[key];
  return JSON.stringify(data);
}
export function loadGame(json,now=Date.now()) {
  const g=createGame(now);let raw;
  try {
    const text=typeof json==='string'?json:JSON.stringify(json);
    if(typeof text!=='string'||text.length>200000) return g;
    raw=JSON.parse(text);
  } catch {return g;}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![1,2].includes(raw.version)) return g;
  g.bestWave=bounded(raw.bestWave,0,1000,true);
  g.highScore=bounded(raw.highScore,0,1e9,true);
  if(raw.version===1) return g;
  g.score=bounded(raw.score,0,1e9,true);g.highScore=Math.max(g.highScore,g.score);
  g.wave=bounded(raw.wave,0,1000,true);
  if(raw.phase==='combat') g.wave=Math.max(0,g.wave-1);
  g.wave=Math.min(g.wave,g.bestWave);
  g.scrap=bounded(raw.scrap,60,1e9);g.kills=bounded(raw.kills,0,1e9,true);
  if(raw.upgrades&&typeof raw.upgrades==='object'&&!Array.isArray(raw.upgrades)) {
    for(const id of Object.keys(UPGRADES)) g.upgrades[id]=bounded(raw.upgrades[id],0,50,true);
  }
  if(raw.weaponUpgrades&&typeof raw.weaponUpgrades==='object'&&!Array.isArray(raw.weaponUpgrades)) {
    for(const weapon of Object.keys(WEAPONS)) {
      const tree=raw.weaponUpgrades[weapon];
      if(tree&&typeof tree==='object'&&!Array.isArray(tree)) for(const id of Object.keys(WEAPON_UPGRADES[weapon]))
        g.weaponUpgrades[weapon][id]=bounded(tree[id],0,50,true);
    }
  }
  unlockWeapons(g);
  if(g.unlocked.includes(raw.weapon)) g.weapon=raw.weapon;
  if(['nearest','strongest','weakest'].includes(raw.priority)) g.priority=raw.priority;
  const s=stats(g);
  g.hp=bounded(raw.hp,s.maxHp,s.maxHp);g.energy=bounded(raw.energy,s.maxEnergy,s.maxEnergy);
  g.ammo=bounded(raw.ammo,s.maxAmmo,s.maxAmmo,true);g.reloadTimer=bounded(raw.reloadTimer,0,s.reloadTime);
  g.phase=raw.phase==='upgrade'&&g.wave>0&&g.wave%10===0?'upgrade':g.wave>0?'intermission':'ready';
  g.autoWave=false;g.spawnTimer=2;
  if(raw.phase==='defeat'||g.hp<=0) defeat(g);
  return g;
}
