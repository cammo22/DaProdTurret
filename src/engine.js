// Pure deterministic arcade simulation. Coordinates and velocities are world units/seconds.
export const WEAPONS = Object.freeze({
  cannon:{name:'Cannone',description:'Proiettili diretti.',unlockCost:0,color:0xffbc61},
  tesla:{name:'Tesla',description:'Rimbalzi elettrici sequenziali.',unlockCost:180,color:0x56e6ff},
  rail:{name:'Railgun',description:'Carica e perfora.',unlockCost:280,color:0xb6a2ff},
});
export const ABILITIES = Object.freeze({
  emp:{name:'EMP',energyCost:60,cooldown:12},
  missiles:{name:'Missili',energyCost:45,cooldown:9},
  airstrike:{name:'Attacco aereo',energyCost:80,cooldown:18},
});
const node=(name,description,cost,max,parents,branch,kind='upgrade')=>
  Object.freeze({name,description,cost,max,parents:Object.freeze(parents),branch,kind});
export const SKILLS = Object.freeze({
  unlockTesla:node('Tesla','Sblocca Tesla.',180,1,[],'tesla','unlock'),
  unlockRail:node('Railgun','Sblocca Railgun.',280,1,[],'rail','unlock'),
  unlockEmp:node('EMP','Sblocca impulso stordente.',90,1,[],'abilities','unlock'),
  unlockMissiles:node('Missili','Un missile per nave in superficie.',140,1,[],'abilities','unlock'),
  unlockAirstrike:node('Attacco aereo','Passaggio con bombe ad area.',240,1,[],'abilities','unlock'),
  cannonDamage:node('Danno cannone','+30% danno base.',30,20,[],'cannon'),
  cannonRate:node('Cadenza','+18% cadenza base.',40,12,[],'cannon'),
  cannonCooling:node('Raffreddamento','+4 calore/s dissipato.',40,12,[],'cannon'),
  cannonCapacity:node('Capacità termica','+20 capacità termica.',45,12,[],'cannon'),
  cannonMultishot:node('Multicolpo','+1 proiettile reale per colpo.',150,4,['cannonDamage'],'cannon'),
  towerHull:node('Scafo','+30 HP e riparazione.',45,20,[],'tower'),
  towerReactor:node('Reattore','+20 energia e +2 rigenerazione/s.',45,20,[],'tower'),
  autofire:node('Fuoco automatico','Acquisizione automatica; calore sempre attivo.',1500,1,['cannonRate','cannonCooling','cannonCapacity'],'tower','unlock'),
  slot2:node('Secondo slot','Equipaggia due abilità.',220,1,['unlockEmp'],'abilities','slot'),
  slot3:node('Terzo slot','Equipaggia tre abilità.',420,1,['slot2','unlockMissiles','unlockAirstrike'],'abilities','slot'),
  teslaDamage:node('Danno Tesla','+30% danno base.',55,20,['unlockTesla'],'tesla'),
  teslaBounces:node('Rimbalzi','+1 rimbalzo.',65,9,['unlockTesla'],'tesla'),
  teslaRange:node('Arco','+1 portata rimbalzi.',50,10,['unlockTesla'],'tesla'),
  railDamage:node('Danno Railgun','+35% danno base.',70,20,['unlockRail'],'rail'),
  railCharge:node('Carica','Carica più rapida.',65,12,['unlockRail'],'rail'),
  railPierce:node('Perfora','+1 bersaglio perforato.',70,17,['unlockRail'],'rail'),
  empPower:node('EMP potenziato','+0.4s stordimento.',85,5,['unlockEmp'],'abilities'),
  missileDamage:node('Testate','+20 danno missili.',85,10,['unlockMissiles'],'abilities'),
  airstrikeDamage:node('Bombe','+25 danno bombe.',100,10,['unlockAirstrike'],'abilities'),
});
const has=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
const bounded=(v,fallback,max,integer=false)=>{
  if(typeof v!=='number'||!Number.isFinite(v)) return fallback;
  const n=Math.max(0,Math.min(max,v)); return integer?Math.floor(n):n;
};
export function createGame(now=Date.now()) {
  return {version:3,phase:'ready',wave:0,highWave:0,bestEarnings:0,cash:60,earnedMoney:0,hp:120,
    energy:100,kills:0,weapon:'cannon',unlocked:['cannon'],priority:'nearest',autoWave:false,
    skills:Object.fromEntries(Object.keys(SKILLS).map(id=>[id,0])),loadout:[],
    heat:0,overheated:false,overheatTimer:0,
    environment:{type:'calm',timeLeft:0,duration:0,dx:0,dz:0},
    enemies:[],projectiles:[],effects:[],events:[],time:0,waveKills:0,waveTotal:0,spawnRemaining:0,spawnTimer:0,
    cooldown:0,pulseCooldown:0,missileCooldown:0,airstrikeCooldown:0,nextId:1,aim:null,pendingManual:null,charge:null,notice:'',
    lastSavedAt:bounded(now,0,8.64e15,true)};
}
export function stats(g,weapon=g.weapon) {
  if(!has(WEAPONS,weapon)) weapon='cannon';
  const level=id=>skillLevel(g,id),reactor=level('towerReactor');
  return {damage:weapon==='rail'?110*(1+level('railDamage')*0.35):weapon==='tesla'?30*(1+level('teslaDamage')*0.3):20*(1+level('cannonDamage')*0.3),
    fireRate:weapon==='cannon'?2.4*(1+level('cannonRate')*0.18):weapon==='tesla'?1.7:0.85,
    maxHp:120+level('towerHull')*30,maxEnergy:100+reactor*20,energyRegen:10+reactor*2,
    range:g.environment.type==='fog'?17:26,
    heatCapacity:100+level('cannonCapacity')*20,coolingRate:(24+level('cannonCooling')*4)*(g.environment.type==='storm'?0.65:1),
    overheatRecovery:4,heatPerShot:weapon==='rail'?38:weapon==='tesla'?23:20,
    projectileCount:weapon==='cannon'?1+level('cannonMultishot'):1,
    chargeTime:weapon==='rail'?Math.max(0.2,0.85/(1+level('railCharge')*0.18)):0,
    bounceRange:6+level('teslaRange'),bounces:weapon==='tesla'?3+level('teslaBounces'):0,pierce:weapon==='rail'?3+level('railPierce'):1,
    stunDuration:2.8+level('empPower')*0.4};
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
  g._checkpoint=snapshot(g);
  g.phase='combat';g.wave++;g.waveKills=0;g.waveTotal=Math.min(40,6+g.wave);
  g.spawnRemaining=g.waveTotal;g.spawnTimer=0;syncWeapons(g);
  g.autoWave=false;g.events=[];startEnvironment(g);
  return true;
}
function target(g) {
  const eligible=g.enemies.filter(e=>e.hp>0&&!e.submerged&&Math.hypot(e.x,e.z)<=stats(g).range);
  const rank=e=>g.priority==='strongest'?-e.hp:g.priority==='weakest'?e.hp:Math.hypot(e.x,e.z);
  return eligible.sort((a,b)=>rank(a)-rank(b)||a.id-b.id)[0];
}
function addHeat(g) {
  const s=stats(g);g.heat=Math.min(s.heatCapacity,g.heat+s.heatPerShot);
  if(g.heat>=s.heatCapacity-1e-9) {
    g.overheated=true;g.overheatTimer=s.overheatRecovery;g.pendingManual=null;
    effect(g,'overheat',0,0,0,0,0.5);
  }
}
function fire(g) {
  const s=stats(g);
  if(g.phase!=='combat'||g.hp<=0||g.cooldown>1e-9||g.overheated||g.charge||
    g.projectiles.length+s.projectileCount>LIMITS.projectiles) return false;
  const held=g.aim&&point(g.aim.x,g.aim.z)?g.aim:null;
  const aim=g.pendingManual||(skillLevel(g,'autofire')?(held||target(g)):null);if(!aim) return false;
  const manual=!!(g.pendingManual||held);
  if(g.weapon==='rail') {
    g.pendingManual=null;g.charge={x:aim.x,z:aim.z,remaining:s.chargeTime,duration:s.chargeTime};
    g._chargeManual=manual;effect(g,'charge',0,0,aim.x,aim.z,s.chargeTime);addHeat(g);return true;
  }
  if(g.weapon==='tesla') projectile(g,'tesla-orb','player',0,0,aim.x,aim.z,46,s.damage,
    {bouncesLeft:s.bounces,hitIds:[],sx:0,sz:0});
  else {
    const d=Math.hypot(aim.x,aim.z),nx=d?-aim.z/d:1,nz=d?aim.x/d:0;
    for(let i=0;i<s.projectileCount;i++) {
      const spread=(i-(s.projectileCount-1)/2)*0.5;
      projectile(g,'shell','player',0,0,aim.x+nx*spread,aim.z+nz*spread,32,s.damage);
    }
  }
  g.cooldown=1/s.fireRate;g.lastShot={x:aim.x,z:aim.z,weapon:g.weapon,time:g.time,manual};
  effect(g,'muzzle',0,0,aim.x,aim.z,0.12);effect(g,'shot',0,0,aim.x,aim.z,0.18);
  g.pendingManual=null;addHeat(g);return true;
}
export function manualFire(g,x,z) {
  if(g.phase!=='combat'||g.hp<=0||g.overheated||!point(x,z)) return false;
  g.pendingManual={x,z};fire(g);return true;
}
function step(g,dt) {
  if(g.phase==='defeat') return;
  g.time+=dt;
  g.effects=g.effects.filter(e=>(e.ttl-=dt)>0);
  g.events=[];g.autoWave=false;
  if(g.phase==='combat') updateEnvironment(g,dt);
  g.cooldown=Math.max(0,g.cooldown-dt);
  g.pulseCooldown=Math.max(0,g.pulseCooldown-dt);
  g.missileCooldown=Math.max(0,g.missileCooldown-dt);
  g.airstrikeCooldown=Math.max(0,g.airstrikeCooldown-dt);
  const s=stats(g);
  g.energy=Math.min(s.maxEnergy,g.energy+s.energyRegen*dt);
  if(g.overheated) {
    g.overheatTimer=Math.max(0,g.overheatTimer-dt);
    g.heat=Math.max(0,g.heat-s.heatCapacity/s.overheatRecovery*dt);
    if(g.overheatTimer<1e-9) {g.overheatTimer=0;g.overheated=false;g.heat=0;}
  } else if(!g.charge) g.heat=Math.max(0,g.heat-s.coolingRate*dt);
  if(g.phase!=='combat') return;
  g.spawnTimer-=dt;
  if(g.spawnRemaining>0&&g.spawnTimer<=0) {spawn(g);g.spawnTimer+=Math.max(0.45,1.05-g.wave*0.009);}
  reap(g);
  updateEnemies(g,dt);
  reap(g);
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

function earn(g,amount) {
  g.cash=Math.min(1e9,g.cash+amount);g.earnedMoney=Math.min(1e9,g.earnedMoney+amount);
  g.bestEarnings=Math.max(g.bestEarnings,g.earnedMoney);
}
function reap(g) {
  g.enemies=g.enemies.filter(e=>{
    if(e.hp>0) return true;
    if(!e.rammed) {earn(g,e.reward);g.kills++;g.waveKills++;}
    effect(g,e.rammed?'ram':'explosion',e.x,e.z,e.x,e.z,0.55);return false;
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
    if(p.kind==='missile') {if(updateMissile(g,p,dt)) live.push(p);continue;}
    if(p.kind==='aircraft') {if(updateAircraft(g,p,dt)) live.push(p);continue;}
    if(p.kind==='bomb') {if(updateBomb(g,p,dt)) live.push(p);continue;}
    if(p.targetId!==undefined) {
      const t=g.enemies.find(e=>e.id===p.targetId&&e.hp>0&&!e.submerged);
      if(t) {p.tx=t.x;p.tz=t.z;}
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
      hit.hp-=p.damage;
      effect(g,'hit',p.x+(nx-p.x)*first,p.z+(nz-p.z)*first);
      if(p.kind==='tesla-orb') {
        effect(g,'tesla',p.sx,p.sz,hit.x,hit.z,0.22);p.hitIds.push(hit.id);
        const reach=stats(g,'tesla').bounceRange;
        const next=g.enemies.filter(e=>e.hp>0&&!e.submerged&&!p.hitIds.includes(e.id)&&Math.hypot(e.x-hit.x,e.z-hit.z)<=reach)
          .sort((a,b)=>Math.hypot(a.x-hit.x,a.z-hit.z)-Math.hypot(b.x-hit.x,b.z-hit.z)||a.id-b.id)[0];
        if(next&&p.bouncesLeft>0&&p.ttl>0) {
          p.bouncesLeft--;p.damage*=0.82;p.x=hit.x;p.z=hit.z;p.sx=hit.x;p.sz=hit.z;
          p.tx=next.x;p.tz=next.z;p.targetId=next.id;live.push(p);
        }
      }
    }
    else if(travel>=distance-1e-9||p.ttl<=0) {
      effect(g,'splash',nx,nz);
    }
    else {p.x=nx;p.z=nz;live.push(p);}
  }
  g.projectiles=live;reap(g);
}

export function pulse(g) {
  if(!abilityReady(g,'emp')) return false;
  const s=stats(g);spendAbility(g,'emp');
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
    if(g.environment.type==='current'&&!e.submerged) {e.x+=g.environment.dx*dt;e.z+=g.environment.dz*dt;}
    if(e.type==='skiff') {
      // Station-only kamikaze: no ranged attack and no salvage for contact deaths.
      const distance=Math.hypot(e.x,e.z);
      if(e.speed>0) e.speed=Math.min(3.6,e.speed+0.28*dt);
      const move=Math.min(e.speed*dt,Math.max(0,distance-2.8));
      if(distance>0) {e.x*=1-move/distance;e.z*=1-move/distance;}
      if(Math.hypot(e.x,e.z)<=2.8+1e-7) {
        g.hp=Math.max(0,g.hp-10);e.rammed=true;e.hp=0;
      }
      continue;
    }
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
  reap(g);
}

const abilityClock={emp:'pulseCooldown',missiles:'missileCooldown',airstrike:'airstrikeCooldown'};
function abilityReady(g,id) {
  return g.phase==='combat'&&g.hp>0&&skillLevel(g,abilityUnlock[id])>0&&g.loadout.includes(id)&&
    g.energy>=ABILITIES[id].energyCost&&g[abilityClock[id]]<=1e-9;
}
function spendAbility(g,id) {g.energy-=ABILITIES[id].energyCost;g[abilityClock[id]]=ABILITIES[id].cooldown;}
export function useAbility(g,id) {
  if(!has(ABILITIES,id)) return false;
  return id==='emp'?pulse(g):id==='missiles'?launchMissiles(g):launchAirstrike(g);
}
export function launchMissiles(g) {
  const assigned=new Set(g.projectiles.filter(p=>p.kind==='missile'&&p.targetId!==null).map(p=>p.targetId));
  const targets=g.enemies.filter(e=>e.hp>0&&!e.submerged&&!assigned.has(e.id)).sort((a,b)=>a.id-b.id);
  if(!abilityReady(g,'missiles')||!targets.length||g.projectiles.length+targets.length>LIMITS.projectiles) return false;
  spendAbility(g,'missiles');
  for(let i=0;i<targets.length;i++) {
    const t=targets[i];
    projectile(g,'missile','player',(i-(targets.length-1)/2)*0.14,0,t.x,t.z,26,
      65+skillLevel(g,'missileDamage')*20,{targetId:t.id,y:1.2,vx:0,vz:0,vy:20,phase:'ascent',age:0,ttl:10,radius:0.3});
  }
  effect(g,'missile-launch',0,0,targets[0].x,targets[0].z,0.4);return true;
}
function areaDamage(g,x,z,damage,reach) {
  for(const e of g.enemies) if(e.hp>0&&!e.submerged&&Math.hypot(e.x-x,e.z-z)<=reach+radius(e)) e.hp-=damage;
  effect(g,'explosion',x,z,x,z,0.6);
}
function updateMissile(g,p,dt) {
  p.ttl-=dt;p.age+=dt;
  const target=g.enemies.find(e=>e.id===p.targetId&&e.hp>0&&!e.submerged);
  if(!target&&p.phase!=='divert') {p.phase='divert';p.targetId=null;p.ttl=Math.min(p.ttl,0.5);p.vy=12;}
  if(p.phase==='divert') {p.y+=p.vy*dt;p.x+=8*dt;return p.ttl>0;}
  p.tx=target.x;p.tz=target.z;
  if(p.phase==='ascent') {
    p.y+=p.vy*dt;
    if(p.age>=0.7) p.phase='dive';else return p.ttl>0;
  }
  const dx=p.tx-p.x,dz=p.tz-p.z,dy=0.5-p.y,d=Math.hypot(dx,dy,dz);
  p.vx=dx/d*p.speed;p.vz=dz/d*p.speed;p.vy=dy/d*p.speed;
  if(d<=p.speed*dt+0.5) {areaDamage(g,p.tx,p.tz,p.damage,2.8);return false;}
  p.x+=p.vx*dt;p.z+=p.vz*dt;p.y=Math.max(0,p.y+p.vy*dt);return p.ttl>0;
}
export function launchAirstrike(g) {
  const focus=g.enemies.filter(e=>e.hp>0&&!e.submerged).sort((a,b)=>b.hp-a.hp||a.id-b.id)[0];
  if(!abilityReady(g,'airstrike')||!focus||g.projectiles.length+12>LIMITS.projectiles) return false;
  spendAbility(g,'airstrike');
  projectile(g,'aircraft','player',focus.x-36,focus.z,focus.x+36,focus.z,20,
    95+skillLevel(g,'airstrikeDamage')*25,{y:14,vy:0,phase:'pass',ttl:3.6,dropTimer:0,focusX:focus.x});
  effect(g,'aircraft',focus.x-36,focus.z,focus.x+36,focus.z,3.6);return true;
}
function updateAircraft(g,p,dt) {
  p.ttl-=dt;p.vx=p.speed;p.vz=0;p.x+=p.vx*dt;p.dropTimer-=dt;
  if(Math.abs(p.x-p.focusX)<=12&&p.dropTimer<=0) {
    projectile(g,'bomb','player',p.x,p.z,p.x,p.z,0,p.damage,{y:p.y,vy:0,phase:'fall',ttl:3,radius:4});
    effect(g,'bomb',p.x,p.z,p.x,p.z,0.3);p.dropTimer=0.25;
  }
  return p.ttl>0;
}
function updateBomb(g,p,dt) {
  p.ttl-=dt;p.vy-=18*dt;p.y+=p.vy*dt;
  if(p.y<=0) {p.y=0;areaDamage(g,p.x,p.z,p.damage,p.radius);return false;}
  return p.ttl>0;
}

export function skillLevel(g,id) {
  return has(SKILLS,id)&&Number.isSafeInteger(g.skills?.[id])?Math.max(0,Math.min(SKILLS[id].max,g.skills[id])):0;
}
export function skillCost(g,id) {
  return has(SKILLS,id)&&skillLevel(g,id)<SKILLS[id].max?Math.ceil(SKILLS[id].cost*1.35**skillLevel(g,id)):Infinity;
}
const shopping=g=>['ready','intermission','upgrade'].includes(g.phase)&&g.hp>0;
const weaponOwned=(g,id)=>id==='cannon'||skillLevel(g,id==='tesla'?'unlockTesla':'unlockRail')>0;
function syncWeapons(g) {g.unlocked=Object.keys(WEAPONS).filter(id=>weaponOwned(g,id));}
export function buySkill(g,id) {
  const cost=skillCost(g,id);
  if(!shopping(g)||!Number.isFinite(cost)||g.cash<cost||!SKILLS[id].parents.every(p=>skillLevel(g,p)>0)) return false;
  g.cash-=cost;g.skills[id]=skillLevel(g,id)+1;syncWeapons(g);
  if(id==='towerHull') g.hp=Math.min(stats(g).maxHp,g.hp+30);
  if(id==='towerReactor') g.energy=Math.min(stats(g).maxEnergy,g.energy+20);
  return true;
}
const abilityUnlock={emp:'unlockEmp',missiles:'unlockMissiles',airstrike:'unlockAirstrike'};
const slots=g=>1+skillLevel(g,'slot2')+skillLevel(g,'slot3');
export function equipAbility(g,id) {
  if(!shopping(g)||!has(ABILITIES,id)||!skillLevel(g,abilityUnlock[id])) return false;
  if(g.loadout.includes(id)) {g.loadout=g.loadout.filter(a=>a!==id);return true;}
  if(g.loadout.length>=slots(g)) return false;
  g.loadout.push(id);return true;
}
export function setWeapon(g,id) {
  if(!has(WEAPONS,id)||g.phase==='defeat'||g.charge||!weaponOwned(g,id)) return false;
  syncWeapons(g);g.weapon=id;return true;
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
  if(g.phase!=='combat'||g.hp<=0||g.spawnRemaining>0||g.enemies.length||g.projectiles.some(p=>p.owner==='enemy'||p.kind==='aircraft'||p.kind==='bomb')) return;
  g.phase='upgrade';g.autoWave=false;g.highWave=Math.max(g.highWave,g.wave);
  if(g.waveKills>0) earn(g,12+g.wave*3);
  const s=stats(g);if(g.waveKills>0) g.hp=Math.min(s.maxHp,g.hp+s.maxHp*0.12);g.energy=Math.min(s.maxEnergy,g.energy+20);
  g.charge=null;delete g._chargeManual;g.pendingManual=null;g.projectiles=[];g.aim=null;
  g.notice=`Ondata ${g.wave} completata. Migliora e continua.`;
}
function defeat(g) {
  g.phase='defeat';g.hp=0;g.cash=0;g.energy=0;
  g.skills=createGame(0).skills;g.loadout=[];g.weapon='cannon';g.unlocked=['cannon'];
  g.enemies=[];g.projectiles=[];g.events=[];g.charge=null;delete g._chargeManual;
  g.aim=null;g.pendingManual=null;g.spawnRemaining=0;g.autoWave=false;
  g.bestEarnings=Math.max(g.bestEarnings,g.earnedMoney);g.notice='Stazione perduta.';
}
export function restartGame(g) {
  const bestEarnings=Math.max(g.bestEarnings,g.earnedMoney),highWave=g.highWave,stamp=g.lastSavedAt;
  for(const key of Object.keys(g)) delete g[key];
  Object.assign(g,createGame(stamp),{bestEarnings,highWave});
}

function startEnvironment(g) {
  const type=g.wave===1?'calm':['fog','current','storm'][(g.wave-2)%3];
  g.environment={type,timeLeft:type==='calm'?0:18,duration:type==='calm'?0:18,
    dx:type==='current'?0.7:0,dz:type==='current'?0.35:0};
}
function updateEnvironment(g,dt) {
  const env=g.environment;if(env.type==='calm') return;
  const elapsed=env.duration-env.timeLeft;
  env.timeLeft=Math.max(0,env.timeLeft-dt);
  if(env.type==='storm'&&Math.floor((elapsed+dt+1e-8)/6)>Math.floor((elapsed+1e-8)/6)) {
    g.energy=Math.max(0,g.energy-8);effect(g,'lightning',0,0,0,0,0.6);
  }
  if(env.timeLeft<1e-9) g.environment={type:'calm',timeLeft:0,duration:0,dx:0,dz:0};
}

const SAVE_FIELDS=['version','phase','wave','highWave','bestEarnings','cash','earnedMoney','hp','energy',
  'heat','overheated','overheatTimer','cooldown','pulseCooldown','missileCooldown','airstrikeCooldown',
  'kills','weapon','priority','skills','loadout','lastSavedAt'];
function snapshot(g) {
  const data={};for(const key of SAVE_FIELDS) data[key]=g[key];
  data.skills={...g.skills};data.loadout=[...g.loadout];return data;
}
export function serializeGame(g,now=Date.now()) {
  g.lastSavedAt=bounded(now,0,8.64e15,true);
  const data=g.phase==='combat'&&g._checkpoint?structuredClone(g._checkpoint):snapshot(g);
  if(g.phase==='combat') {
    if(!g._checkpoint) data.wave=Math.max(0,g.wave-1);
    data.phase='intermission';
  }
  data.highWave=g.highWave;data.bestEarnings=Math.max(g.bestEarnings,g.earnedMoney);data.lastSavedAt=g.lastSavedAt;
  return JSON.stringify(data);
}
// Strict numeric validation: no strings, fractional levels, nonfinite values or capped cheats.
const valid=(v,fallback,max,integer=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max&&
  (!integer||Number.isSafeInteger(v))?v:fallback;
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
export function loadGame(json,now=Date.now()) {
  const g=createGame(now);let raw;
  try {
    const text=typeof json==='string'?json:JSON.stringify(json);
    if(typeof text!=='string'||text.length>200000) return g;
    raw=JSON.parse(text);
  } catch {return g;}
  if(!record(raw)||![1,2,3].includes(raw.version)) return g;
  if(raw.version!==3) {
    g.highWave=valid(raw.highWave,valid(raw.bestWave,0,1000,true),1000,true);
    g.bestEarnings=valid(raw.bestEarnings,valid(raw.highScore,0,1e9,true),1e9,true);
    return g;
  }
  g.highWave=valid(raw.highWave,0,1000,true);g.bestEarnings=valid(raw.bestEarnings,0,1e9,true);
  g.wave=valid(raw.wave,0,1000,true);
  if(raw.phase==='combat') g.wave=Math.max(0,g.wave-1);
  g.wave=Math.min(g.wave,g.highWave);
  g.cash=valid(raw.cash,60,1e9);g.earnedMoney=valid(raw.earnedMoney,0,1e9,true);
  g.bestEarnings=Math.max(g.bestEarnings,g.earnedMoney);g.kills=valid(raw.kills,0,1e9,true);
  if(record(raw.skills)) {
    for(const id of Object.keys(SKILLS)) g.skills[id]=valid(raw.skills[id],0,SKILLS[id].max,true);
    // Repeated pruning handles parents in any order without trusting the saved unlock cache.
    for(let i=0;i<Object.keys(SKILLS).length;i++) {
      let changed=false;
      for(const [id,s] of Object.entries(SKILLS)) if(g.skills[id]&&!s.parents.every(p=>g.skills[p]>0)) {g.skills[id]=0;changed=true;}
      if(!changed) break;
    }
  }
  syncWeapons(g);
  if(has(WEAPONS,raw.weapon)&&weaponOwned(g,raw.weapon)) g.weapon=raw.weapon;
  if(['nearest','strongest','weakest'].includes(raw.priority)) g.priority=raw.priority;
  if(Array.isArray(raw.loadout)) g.loadout=[...new Set(raw.loadout.filter(id=>has(ABILITIES,id)&&skillLevel(g,abilityUnlock[id])>0))].slice(0,slots(g));
  const s=stats(g);
  g.hp=valid(raw.hp,s.maxHp,s.maxHp);g.energy=valid(raw.energy,s.maxEnergy,s.maxEnergy);
  g.cooldown=valid(raw.cooldown,0,2);
  for(const [id,a] of Object.entries(ABILITIES)) g[abilityClock[id]]=valid(raw[abilityClock[id]],0,a.cooldown);
  g.heat=valid(raw.heat,0,s.heatCapacity);
  g.overheated=raw.overheated===true;
  if(g.overheated) {
    g.overheatTimer=valid(raw.overheatTimer,s.overheatRecovery,s.overheatRecovery);
    if(g.overheatTimer<=0) g.overheatTimer=s.overheatRecovery;
  } else if(g.heat>=s.heatCapacity) {g.overheated=true;g.overheatTimer=s.overheatRecovery;}
  g.lastSavedAt=valid(raw.lastSavedAt,g.lastSavedAt,8.64e15,true);
  g.phase='intermission';g.autoWave=false;
  if(raw.phase==='defeat'||g.hp<=0) defeat(g);
  return g;
}
