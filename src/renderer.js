import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FLEET_IDS = ['cannon', 'tesla', 'rail', 'skiff', 'frigate', 'armored', 'boss', 'submarine'];
const DIMENSIONS = { cannon: 4.5, tesla: 4.5, rail: 5.1, skiff: 2.7, frigate: 4.1, armored: 4.7, boss: 8, submarine: 4 };
const BOAT_IDS = ['skiff', 'frigate', 'armored', 'boss', 'submarine'];
const TAU = Math.PI * 2;

export function visualAim(game, nearest) {
  const recent = game.lastShot?.manual && game.time - game.lastShot.time < .25;
  return game.charge || game.pendingManual || game.aim || (recent ? game.lastShot : nearest);
}

// Normalize once, clone many times. Meshy prototypes retain their PBR materials.
export function normalizeModel(source, id, config = {}) {
  const orient = new THREE.Group(); orient.add(source);
  const prototype = new THREE.Group(); prototype.name = `meshy-${id}`;
  prototype.userData.meshyAssetId = id;
  prototype.add(orient);
  source.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  if (Array.isArray(config.rotation)) orient.rotation.set(...config.rotation);
  else if (typeof config.rotationY === 'number') orient.rotation.y = config.rotationY;
  else {
    // Meshy boats are not guaranteed to share a longitudinal axis.
    if (size.x > size.z * 1.15) orient.rotation.y = Math.PI / 2;
    if (config.forwardAxis === '-z' || config.forward === '-Z') orient.rotation.y += Math.PI;
  }
  prototype.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(prototype);
  bounds.getSize(size);
  const target = DIMENSIONS[id] || 4;
  const isBoat = BOAT_IDS.includes(id);
  const scale = isBoat ? target / Math.max(size.x, size.z, .001) : Math.min(target / Math.max(size.x, size.z, .001), 4.4 / Math.max(size.y, .001));
  orient.scale.setScalar(scale);
  prototype.updateMatrixWorld(true);
  bounds.setFromObject(prototype);
  const center = bounds.getCenter(new THREE.Vector3());
  orient.position.set(-center.x, -bounds.min.y, -center.z);
  prototype.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = false; node.receiveShadow = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material.isMeshStandardMaterial) {
        material.roughness = Math.max(.35, material.roughness);
        material.metalness = Math.min(.75, material.metalness);
      }
    }
  });
  prototype.updateMatrixWorld(true);
  return prototype;
}
export function replaceActorModel(holder, prototype, id) {
  holder.clear();
  const clone = prototype.clone(true);
  clone.userData.meshyAssetId = id;
  holder.add(clone);
  holder.userData.meshyAssetId = id;
  return clone;
}
function bundledManifestUrl() {
  // Vite discovers the optional manifest at build/server startup. An absent
  // manifest produces an empty map, not a request that prints a 404 in devtools.
  try {
    return Object.values(import.meta.glob('/public/assets/fleet/manifest.json', { query: '?url', import: 'default', eager: true }))[0] || null;
  } catch { return null; }
}
export async function preloadFleet({ manifestUrl = bundledManifestUrl(), baseUrl = import.meta.env?.BASE_URL || './', fetcher = globalThis.fetch, loadModel, onLoaded = () => {} } = {}) {
  if (!manifestUrl) return Promise.allSettled(FLEET_IDS.map(id => Promise.reject(new Error(`${id}: optional fleet not bundled`))));
  let manifest;
  try {
    const response = await fetcher(manifestUrl);
    if (!response.ok) throw new Error('Fleet manifest unavailable');
    manifest = await response.json();
  } catch (error) { return Promise.allSettled(FLEET_IDS.map(() => Promise.reject(error))); }
  const loader = loadModel ? null : new GLTFLoader();
  const load = loadModel || (url => loader.loadAsync(url));
  const entries = manifest.assets || manifest.models || manifest.fleet || manifest;
  // Two concurrent decodes keep eight large PBR meshes from monopolizing the
  // first gesture. Initial play and all procedural actors are already active.
  let active = 0;
  const waiting = [];
  async function acquire() { if (active < 2) { active++; return; } await new Promise(resolve => waiting.push(resolve)); }
  function release() { const next = waiting.shift(); if (next) next(); else active--; }
  return Promise.allSettled(FLEET_IDS.map(async id => {
    await acquire();
    try {
      const entry = Array.isArray(entries) ? entries.find(item => item.id === id || item.name === id) : entries[id];
      if (entry?.status === 'failed' || entry?.available === false) throw new Error(`${id}: asset unavailable`);
      const gltf = await load(`${baseUrl}assets/fleet/${id}.glb`);
      const prototype = normalizeModel(gltf.scene || gltf, id, entry?.transform || entry || {});
      onLoaded(id, prototype);
      return { id, prototype };
    } finally { release(); }
  }));
}

export function createGameRenderer(container, { sound = () => {} } = {}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b4251);
  const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, .1, 250);
  camera.position.set(0, 45, 32); camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.domElement.setAttribute('aria-label', 'Difesa navale 3D');
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xd8f8ff, 0x153d48, 2.7));
  const sun = new THREE.DirectionalLight(0xffdfb3, 3.6); sun.position.set(-16, 32, 20); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x72ddea, 1.5); rim.position.set(12, 15, -16); scene.add(rim);

  // Every reusable geometry is allocated here, never in the animation loop.
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 9), sphere: new THREE.IcosahedronGeometry(1, 1),
    ring: new THREE.TorusGeometry(1, .025, 4, 48), circle: new THREE.CircleGeometry(1, 32),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  const mat = {
    steel: new THREE.MeshStandardMaterial({ color: 0x718b8b, metalness: .55, roughness: .57 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x203c48, metalness: .4, roughness: .66 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xb7c5ba, metalness: .5, roughness: .45 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xe5b45d, emissive: 0x774319, emissiveIntensity: .25, roughness: .6 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa94f37, roughness: .64, metalness: .35 }),
    armored: new THREE.MeshStandardMaterial({ color: 0x687171, roughness: .55, metalness: .55 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x9effff }),
    orange: new THREE.MeshBasicMaterial({ color: 0xffca7c }),
    redLight: new THREE.MeshBasicMaterial({ color: 0xff7751 }),
    white: new THREE.MeshBasicMaterial({ color: 0xe5ffff }),
    wake: new THREE.MeshBasicMaterial({ color: 0xb6f1e5, transparent: true, opacity: .23, depthWrite: false, side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x001e2c, transparent: true, opacity: .33, depthWrite: false }),
    silhouette: new THREE.MeshBasicMaterial({ color: 0x416d78, transparent: true, opacity: .7, depthWrite: false }),
    electric: new THREE.LineBasicMaterial({ color: 0xadffff, transparent: true, opacity: .95, depthWrite: false }),
  };
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.scale.set(sx, sy, sz); parent.add(object); return object;
  }
  const box = (p, material, x, y, z, sx, sy, sz) => mesh(p, geo.box, material, x, y, z, sx, sy, sz);
  const cylinder = (p, material, x, y, z, radius, height) => mesh(p, geo.cylinder, material, x, y, z, radius, height, radius);
  const ring = (p, material, radius, y = .08) => { const r = mesh(p, geo.ring, material, 0, y, 0, radius, radius, radius); r.rotation.x = Math.PI / 2; return r; };
  const oceanMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec3 vWorld; varying float vWave;
      void main(){ vec3 p=position; float w=sin(p.x*.39+uTime*.58)*cos(p.y*.31-uTime*.46)+sin(p.x*.15+p.y*.24+uTime*.4)*.5; p.z+=w*.085;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; varying vec3 vWorld; varying float vWave;
      void main(){vec2 p=vWorld.xz;float t=uTime;float broad=sin(p.x*.13+p.y*.17+t*.15)*.5+.5;
        vec3 col=mix(vec3(.018,.16,.215),vec3(.035,.30,.34),broad*.65+vWave*.12+.15);
        float crest=sin(p.x*1.8+p.y*.7+sin(p.y*.8+t*.4)*1.5-t*.85);
        float foamLine=smoothstep(.94,.995,crest)*(.45+.35*sin(p.x*.21+p.y*.13+t*.2));
        col+=foamLine*vec3(.045,.07,.065);col+=pow(max(0.,vWave*.56),5.)*.015;
        float d=length(p);float foam=(sin(d*8.-t*1.7)*.5+.5)*smoothstep(3.8,3.,d)*smoothstep(2.4,3.,d);col+=foam*.14;
        gl_FragColor=vec4(col,1.); }`,
  });
  const ocean = mesh(scene, new THREE.PlaneGeometry(190, 190, 90, 90), oceanMaterial, 0, -.12, 0); ocean.rotation.x = -Math.PI / 2;
  // Small hard-edged platform, not a second gun obscuring the imported model.
  const station = new THREE.Group(); station.name = 'station'; scene.add(station);
  cylinder(station, mat.dark, 0, .1, 0, 3.05, .55);
  cylinder(station, mat.edge, 0, .42, 0, 2.98, .12);
  cylinder(station, mat.steel, 0, .58, 0, 2.8, .23);
  cylinder(station, mat.dark, 0, .73, 0, 2.45, .12);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, x = Math.sin(a), z = Math.cos(a);
    const plate = box(station, i % 2 ? mat.steel : mat.amber, x * 2.62, .78, z * 2.62, .5, .08, .45); plate.rotation.y = a;
    cylinder(station, mat.dark, x * 2.7, -.15, z * 2.7, .22, .8);
  }
  const turretPivot = new THREE.Group(); turretPivot.name = 'turret-pivot'; turretPivot.position.y = .85; station.add(turretPivot);
  const gunBody = new THREE.Group(); gunBody.name = 'weapon-recoil'; turretPivot.add(gunBody);
  const models = new Map();
  const fallbackWeapons = new Map();
  function fallbackWeapon(id) {
    const gun = new THREE.Group(); gun.name = `fallback-${id}`;
    cylinder(gun, mat.dark, 0, .42, 0, 1.1, .8);
    cylinder(gun, mat.amber, 0, .87, 0, 1.16, .12);
    box(gun, mat.steel, 0, 1.28, 0, 1.9, .8, 1.7);
    box(gun, mat.edge, 0, 1.75, -.1, 1.5, .14, 1.4);
    if (id === 'rail') {
      for (const x of [-.4, .4]) { box(gun, mat.dark, x, 1.25, 1.65, .3, .42, 3.6); box(gun, mat.cyan, x * .7, 1.42, 1.65, .08, .08, 3.5); }
      box(gun, mat.amber, 0, 1.1, -.9, 1.1, .6, .8);
    } else {
      for (const x of [-.45, .45]) {
        const barrel = cylinder(gun, mat.dark, x, 1.35, 1.6, id === 'tesla' ? .19 : .23, 2.8); barrel.rotation.x = Math.PI / 2;
        if (id === 'tesla') for (let i = 0; i < 5; i++) { const coil = mesh(gun, geo.ring, i % 2 ? mat.cyan : mat.edge, x, 1.35, .6 + i * .45, .34, .34, .34); }
        else { const collar = cylinder(gun, mat.edge, x, 1.35, 2.8, .31, .36); collar.rotation.x = Math.PI / 2; box(gun, mat.amber, x, 1.65, 1, .35, .07, 1.2); }
      }
    }
    return gun;
  }
  for (const id of ['cannon', 'tesla', 'rail']) fallbackWeapons.set(id, fallbackWeapon(id));
  let weaponId;
  let weaponModel;
  function equip(id) {
    const prototype = models.get(id) || fallbackWeapons.get(id);
    if (weaponId === id && weaponModel === prototype) return;
    gunBody.clear();
    if (models.has(id)) replaceActorModel(gunBody, prototype, id);
    else { gunBody.userData.meshyAssetId = null; gunBody.add(prototype.clone(true)); }
    weaponId = id; weaponModel = prototype;
  }
  equip('cannon');
  // Shared boat prototypes. No primitive geometry is constructed on spawn.
  const fallbackBoats = new Map();
  function makeBoatPrototype(type) {
    const boat = new THREE.Group(); boat.name = `fallback-${type}`;
    const length = DIMENSIONS[type], width = length * (type === 'boss' ? .38 : .34);
    if (type === 'submarine') {
      const hull = mesh(boat, geo.sphere, mat.dark, 0, .22, 0, width * .47, .47, length * .5);
      box(boat, mat.steel, 0, .67, -.25, width * .55, .7, .9);
      cylinder(boat, mat.edge, 0, 1.3, -.18, .055, .75);
      box(boat, mat.amber, 0, 1.65, -.06, .11, .1, .3);
      box(boat, mat.dark, 0, .26, -length * .35, width * 1.45, .09, .55);
      hull.name = 'sub-hull';
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -length * .47); shape.lineTo(width / 2, -length * .47); shape.lineTo(width * .53, length * .2); shape.lineTo(0, length * .54); shape.lineTo(-width * .53, length * .2); shape.closePath();
      const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: .48 + length * .045, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 1, steps: 1 });
      const hull = mesh(boat, hullGeo, type === 'armored' || type === 'boss' ? mat.armored : mat.red, 0, .65, 0); hull.rotation.x = Math.PI / 2;
      box(boat, mat.dark, 0, .82, -length * .1, width * .68, .65, length * .33);
      box(boat, mat.edge, 0, 1.2, -length * .1, width * .7, .12, length * .32);
      box(boat, mat.amber, 0, 1.03, length * .075, width * .54, .15, .08);
      cylinder(boat, mat.dark, 0, 1.6, -length * .15, .04, .8);
      const mount = cylinder(boat, mat.steel, 0, .86, length * .22, width * .21, .28);
      const barrel = cylinder(mount, mat.dark, 0, .18, .35, .075 + length * .008, .7 + length * .1); barrel.rotation.x = Math.PI / 2;
      if (type === 'boss') {
        for (const z of [-2, 2.1]) { cylinder(boat, mat.dark, 0, 1.15, z, .65, .5); for (const x of [-.25, .25]) { const b = cylinder(boat, mat.steel, x, 1.45, z + .6, .13, 1.8); b.rotation.x = Math.PI / 2; } }
        for (const x of [-.6, .6]) cylinder(boat, mat.dark, x, 1.5, -.5, .25, 1.25);
      }
    }
    return boat;
  }
  for (const id of BOAT_IDS) fallbackBoats.set(id, makeBoatPrototype(id));
  const electricPoints = new Float32Array(48 * 3);
  for (let i = 0; i < 48; i++) { const a = i / 47 * TAU * 2; electricPoints[i * 3] = Math.sin(a) * (.43 + (i % 2) * .14); electricPoints[i * 3 + 1] = .4 + (i % 4) * .18; electricPoints[i * 3 + 2] = Math.cos(a) * .6 + (i / 47 - .5) * 1.3; }
  const electricGeometry = new THREE.BufferGeometry(); electricGeometry.setAttribute('position', new THREE.BufferAttribute(electricPoints, 3));
  const enemyViews = new Map(), enemyFree = new Map(BOAT_IDS.map(id => [id, []]));
  function makeActor(type) {
    const root = new THREE.Group(); root.name = `enemy-${type}`;
    const body = new THREE.Group(); root.add(body);
    const shadow = mesh(root, geo.circle, mat.shadow, 0, .025, 0, DIMENSIONS[type] * .28, DIMENSIONS[type] * .6, 1); shadow.rotation.x = -Math.PI / 2;
    const wake = new THREE.Group(); root.add(wake);
    for (const side of [-1, 1]) { const strip = mesh(wake, geo.plane, mat.wake, side * DIMENSIONS[type] * .2, .035, -DIMENSIONS[type] * .52, .12, DIMENSIONS[type] * 1.15, 1); strip.rotation.x = -Math.PI / 2; strip.rotation.z = side * .18; }
    const electric = new THREE.Group(); electric.name = 'emp-electric-stun'; root.add(electric);
    for (let i = 0; i < 2; i++) { const arcs = new THREE.Line(electricGeometry, mat.electric); arcs.scale.set(DIMENSIONS[type] * .5, 1.2, DIMENSIONS[type] * .5); arcs.rotation.y = i * Math.PI; electric.add(arcs); }
    electric.visible = false;
    const silhouette = mesh(root, geo.sphere, mat.silhouette, 0, .045, 0, .68, .035, DIMENSIONS[type] * .55); silhouette.visible = false;
    const health = new THREE.Group(); health.position.set(0, .12, -DIMENSIONS[type] * .6); root.add(health);
    const back = mesh(health, geo.plane, mat.dark, 0, 0, 0, DIMENSIONS[type] * .62, .1, 1); back.rotation.x = -Math.PI / 2;
    const bar = mesh(health, geo.plane, mat.orange, 0, .01, 0, DIMENSIONS[type] * .62, .07, 1); bar.rotation.x = -Math.PI / 2;
    const actor = { root, body, wake, electric, silhouette, health, bar, type, prototype: null, stamp: 0 };
    setActorModel(actor); return actor;
  }
  function setActorModel(actor) {
    const prototype = models.get(actor.type) || fallbackBoats.get(actor.type);
    if (actor.prototype === prototype) return;
    if (models.has(actor.type)) replaceActorModel(actor.body, prototype, actor.type);
    else { actor.body.clear(); actor.body.add(prototype.clone(true)); }
    actor.prototype = prototype;
  }
  const assetsReady = preloadFleet({ onLoaded(id, prototype) {
    models.set(id, prototype);
    if (BOAT_IDS.includes(id)) for (const actor of enemyViews.values()) if (actor.type === id) setActorModel(actor);
    // The next frame atomically replaces the whole fallback weapon actor.
    if (weaponId === id) equip(id);
  } });

  const seaEvents = new Map(), seaEventFree = [];
  for (let i = 0; i < 8; i++) {
    const root = new THREE.Group(); root.visible = false; scene.add(root);
    cylinder(root, mat.dark, 0, .1, 0, .64, .3);
    const cargo = box(root, mat.amber, 0, .52, 0, .8, .65, .8);
    box(root, mat.edge, 0, .86, 0, .84, .07, .15);
    box(root, mat.edge, 0, .86, 0, .15, .07, .84);
    const beacon = ring(root, mat.cyan, .88, .04);
    seaEventFree.push({ root, cargo, beacon, stamp: 0 });
  }

  // Reusable vector/quaternion scratch space and pooled combat VFX.
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3(), midpoint = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), scratch = new THREE.Object3D();
  function beam(object, ax, ay, az, bx, by, bz, width) {
    from.set(ax, ay, az); to.set(bx, by, bz); direction.subVectors(to, from);
    const length = direction.length();
    object.position.copy(from).add(to).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(up, direction.normalize());
    object.scale.set(width, Math.max(.001, length), width);
  }
  const effectFree = [], effectViews = new Map();
  function makeEffectSlot() {
    const material = new THREE.MeshBasicMaterial({ color: 0xffcb78, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const softMaterial = material.clone(); softMaterial.opacity = .18;
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xbaffff, transparent: true, depthWrite: false });
    const root = new THREE.Group(); root.visible = false; scene.add(root);
    const flash = mesh(root, geo.sphere, material);
    const wave = ring(root, material, 1);
    const core = mesh(root, geo.cylinder, material);
    const halo = mesh(root, geo.cylinder, softMaterial);
    const particles = new THREE.InstancedMesh(geo.sphere, material, 8); particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); particles.frustumCulled = false; root.add(particles);
    const positions = new Float32Array(39);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, lineMaterial); line.frustumCulled = false; root.add(line);
    return { root, flash, wave, core, halo, particles, line, material, softMaterial, lineMaterial, positions, stamp: 0, effect: null };
  }
  for (let i = 0; i < 72; i++) effectFree.push(makeEffectSlot());
  const projectileFree = [], projectileViews = new Map();
  function makeProjectileSlot() {
    const root = new THREE.Group(); root.visible = false; scene.add(root);
    const head = mesh(root, geo.sphere, mat.orange, 0, 0, 0, .13, .13, .3);
    const body = mesh(root, geo.cylinder, mat.edge, 0, 0, -.22, .12, .55, .12); body.rotation.x = Math.PI / 2;
    const flame = mesh(root, geo.cone, mat.orange, 0, 0, -.65, .14, .65, .14); flame.rotation.x = -Math.PI / 2;
    const positions = new Float32Array(30);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffcc8f, transparent: true, opacity: .55, depthWrite: false });
    const trail = new THREE.Line(geometry, material); trail.frustumCulled = false; trail.visible = false; scene.add(trail);
    return { root, head, body, flame, trail, positions, material, stamp: 0, fresh: true, initialTtl: 0 };
  }
  for (let i = 0; i < 192; i++) projectileFree.push(makeProjectileSlot());
  const reticle = new THREE.Group(); scene.add(reticle); reticle.visible = false;
  const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffdb92, transparent: true, opacity: .8, depthWrite: false });
  ring(reticle, reticleMaterial, .65, .06);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; const m = box(reticle, reticleMaterial, Math.sin(a) * .9, .07, Math.cos(a) * .9, .04, .025, .35); m.rotation.y = a; }
  const chargeGroup = new THREE.Group(); chargeGroup.name = 'rail-charge'; chargeGroup.visible = false; scene.add(chargeGroup);
  const chargeMaterial = new THREE.MeshBasicMaterial({ color: 0xafffff, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
  const chargeRing = ring(chargeGroup, chargeMaterial, 1);
  const chargeOrb = mesh(chargeGroup, geo.sphere, chargeMaterial, 0, .2, 0, .3, .3, .3);
  const chargeParticles = new THREE.InstancedMesh(geo.sphere, chargeMaterial, 12); chargeParticles.frustumCulled = false; chargeGroup.add(chargeParticles);
  const chargeLine = mesh(scene, geo.cylinder, new THREE.MeshBasicMaterial({ color: 0x90f6f5, transparent: true, opacity: .15, depthWrite: false })); chargeLine.visible = false;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), seaPoint = new THREE.Vector3(), projected = new THREE.Vector3();
  const projectedPixel = { x: 0, y: 0 }, unprojectedPoint = { x: 0, z: 0 };
  let width = 1, height = 1, left = 0, top = 0;
  function resize() {
    const rect = container.getBoundingClientRect(); width = rect.width; height = rect.height; left = rect.left; top = rect.top;
    const aspect = width / Math.max(1, height);
    // All spawns remain on screen in either orientation. No cropped threats.
    const halfHeight = Math.max(20, 24 / Math.max(.1, aspect));
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
  function project(x, z, y = 0) {
    projected.set(x, y, z).project(camera);
    projectedPixel.x = left + (projected.x + 1) * width / 2;
    projectedPixel.y = top + (1 - projected.y) * height / 2;
    return projectedPixel;
  }
  function unproject(x, y) {
    pointer.set((x - left) / width * 2 - 1, -(y - top) / height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(seaPlane, seaPoint)) return null;
    unprojectedPoint.x = seaPoint.x; unprojectedPoint.z = seaPoint.z;
    return unprojectedPoint;
  }
  let time = 0, stamp = 0, recoil = 0, shake = 0, wasCharging = false;
  function updateEffect(view, effect) {
    const life = Math.max(0, Math.min(1, effect.ttl / (effect.maxTtl || .3))), age = 1 - life;
    const kind = effect.kind;
    const electric = kind === 'tesla' || kind === 'pulse' || kind === 'stun';
    const rail = kind === 'rail';
    view.material.color.setHex(rail ? 0xe9ffff : electric ? 0x78faff : kind === 'splash' ? 0xb5e8dd : 0xffc06d);
    view.softMaterial.color.copy(view.material.color);
    view.material.opacity = life; view.softMaterial.opacity = life * .2; view.lineMaterial.opacity = life;
    view.root.position.set(0, 0, 0); view.root.scale.setScalar(1);
    view.flash.visible = false; view.wave.visible = false; view.core.visible = false; view.halo.visible = false; view.particles.visible = false; view.line.visible = false;
    const x = effect.x || 0, z = effect.z || 0, tx = effect.tx ?? x, tz = effect.tz ?? z;
    if (kind === 'rail') {
      view.core.visible = true; view.halo.visible = true; view.flash.visible = true;
      beam(view.core, x, 2.2, z, tx, .5, tz, .12 + life * .14);
      beam(view.halo, x, 2.2, z, tx, .5, tz, .45 + age * .5);
      view.flash.position.set(x, 2.2, z); view.flash.scale.setScalar(.4 + life * 1.1);
    } else if (kind === 'tesla' || kind === 'stun') {
      view.line.visible = true;
      const y = Math.hypot(x, z) < 3 ? 2.2 : 1;
      for (let i = 0; i <= 12; i++) {
        const a = i / 12, jitter = i === 0 || i === 12 ? 0 : Math.sin(i * 6.3 + effect.id * 2.2 + time * 15) * .45;
        view.positions[i * 3] = x + (tx - x) * a + jitter;
        view.positions[i * 3 + 1] = y + (.7 - y) * a + jitter * .6;
        view.positions[i * 3 + 2] = z + (tz - z) * a - jitter;
      }
      view.line.geometry.attributes.position.needsUpdate = true;
      view.flash.visible = true; view.flash.position.set(tx, .8, tz); view.flash.scale.setScalar(.2 + life * .3);
    } else if (kind === 'muzzle' || kind === 'missile-launch') {
      view.flash.visible = true;
      const angle = turretPivot.rotation.y;
      const isPlayer = Math.hypot(x, z) < 3;
      view.flash.position.set(isPlayer ? Math.sin(angle) * 2.8 : x, isPlayer ? 2.2 : 1, isPlayer ? Math.cos(angle) * 2.8 : z);
      view.flash.scale.set(.4 * life + .05, .35 * life + .05, .4 * life + .05);
    } else if (kind === 'shot' || kind === 'charge') {
      // Cannon shots travel as engine projectiles. Never draw an instant damage beam.
      view.flash.visible = true; view.flash.position.set(x, 2.1, z); view.flash.scale.setScalar(.16 * life);
    } else {
      view.wave.visible = true; view.wave.position.set(x, .08, z);
      const radius = kind === 'pulse' ? .3 + age * 13 : .3 + age * (kind === 'explosion' ? 3 : 1.7);
      view.wave.scale.setScalar(radius);
      if (kind !== 'pulse') {
        view.particles.visible = true;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU + effect.id;
          const r = age * (kind === 'explosion' ? 3 : 1.5);
          scratch.position.set(x + Math.sin(a) * r, .3 + Math.sin(age * Math.PI) * (1 + i % 3) * .5, z + Math.cos(a) * r);
          scratch.scale.setScalar((.14 + (i % 3) * .045) * life); scratch.rotation.set(age * 3, a, 0); scratch.updateMatrix(); view.particles.setMatrixAt(i, scratch.matrix);
        }
        view.particles.instanceMatrix.needsUpdate = true;
        view.flash.visible = true; view.flash.position.set(x, .5, z); view.flash.scale.setScalar((kind === 'explosion' ? 1 : .5) * life);
      }
    }
  }
  function render(game, dt) {
    if (document.hidden) return;
    stamp++; if (!reducedMotion) time += dt;
    oceanMaterial.uniforms.uTime.value = time;
    equip(game.weapon);
    for (const event of game.events) {
      let view = seaEvents.get(event.id);
      if (!view) {
        view = seaEventFree.pop(); if (!view) continue;
        view.root.name = `sea-event-${event.id}`; view.root.visible = true;
        view.cargo.material = event.type === 'repair' || event.type === 'supply' ? mat.cyan : mat.amber;
        seaEvents.set(event.id, view);
      }
      view.stamp = stamp;
      view.root.position.set(event.x, reducedMotion ? 0 : Math.sin(time * 2.5 + event.id) * .08, event.z);
      view.beacon.rotation.z = time * .6;
    }
    for (const [id, view] of seaEvents) if (view.stamp !== stamp) {
      view.root.visible = false; view.root.name = ''; seaEvents.delete(id); seaEventFree.push(view);
    }
    let nearest = null, nearestDistance = Infinity;
    for (const enemy of game.enemies) {
      let view = enemyViews.get(enemy.id);
      if (!view) {
        const free = enemyFree.get(enemy.type) || enemyFree.get('skiff');
        view = free.pop() || makeActor(enemy.type); view.root.visible = true;
        view.body.position.y = 0; enemyViews.set(enemy.id, view); scene.add(view.root);
      }
      view.stamp = stamp; setActorModel(view);
      view.root.position.set(enemy.x, reducedMotion ? 0 : Math.sin(time * 2 + enemy.id) * .035, enemy.z);
      view.root.rotation.y = Math.atan2(-enemy.x, -enemy.z);
      view.root.rotation.z = reducedMotion || enemy.stunnedFor > 0 ? 0 : Math.sin(time * 1.4 + enemy.id) * .018;
      const targetDepth = enemy.submerged ? -2.4 : 0;
      view.body.position.y += (targetDepth - view.body.position.y) * Math.min(1, Math.max(.08, dt * 4));
      view.silhouette.visible = !!enemy.submerged;
      view.wake.visible = !enemy.submerged && !(enemy.stunnedFor > 0);
      view.electric.visible = enemy.stunnedFor > 0;
      if (view.electric.visible) { view.electric.rotation.y = reducedMotion ? 0 : Math.sin(time * 18 + enemy.id) * .15; view.electric.scale.y = 1 + Math.sin(time * 32 + enemy.id) * .2; }
      const hp = Math.max(0, enemy.hp / enemy.maxHp);
      view.health.visible = hp < .99 && !enemy.submerged;
      view.bar.scale.x = DIMENSIONS[view.type] * .62 * hp;
      view.bar.position.x = -(1 - hp) * DIMENSIONS[view.type] * .31;
      const d = Math.hypot(enemy.x, enemy.z);
      if (d < nearestDistance && !enemy.submerged) { nearestDistance = d; nearest = enemy; }
    }
    for (const [id, view] of enemyViews) if (view.stamp !== stamp) { scene.remove(view.root); enemyViews.delete(id); enemyFree.get(view.type)?.push(view); }
    const aim = visualAim(game, nearest);
    if (aim) {
      const target = Math.atan2(aim.x, aim.z), current = turretPivot.rotation.y;
      if (aim === game.lastShot && game.lastShot.manual) turretPivot.rotation.y = target;
      else turretPivot.rotation.y += Math.atan2(Math.sin(target - current), Math.cos(target - current)) * Math.min(1, dt * 18);
    }
    recoil *= Math.exp(-dt * 11); gunBody.position.z = -recoil;
    const marker = game.aim || (aim === game.lastShot ? game.lastShot : null);
    reticle.visible = !!marker;
    if (marker) reticle.position.set(marker.x, .03, marker.z);
    for (const projectile of game.projectiles) {
      let view = projectileViews.get(projectile.id);
      if (!view) {
        view = projectileFree.pop(); if (!view) continue;
        view.root.visible = true; view.fresh = true; view.initialTtl = projectile.ttl;
        projectileViews.set(projectile.id, view);
      }
      view.stamp = stamp;
      const kind = projectile.kind;
      const missile = kind === 'missile', torpedo = kind === 'torpedo', enemyShot = kind === 'enemy-shell', tesla = kind === 'tesla-orb';
      const progress = 1 - projectile.ttl / Math.max(.001, view.initialTtl);
      let y = torpedo ? .08 : missile ? .85 : tesla ? 1.5 : .5 + Math.sin(Math.min(1, progress * 2) * Math.PI) * 1.5;
      if (!enemyShot && !missile && !torpedo && !tesla) y += Math.max(0, 1 - Math.hypot(projectile.x, projectile.z) / 5) * 1.7;
      view.root.position.set(projectile.x, y, projectile.z);
      view.root.rotation.y = Math.atan2(projectile.vx || projectile.tx - projectile.x, projectile.vz || projectile.tz - projectile.z);
      view.head.material = enemyShot || torpedo ? mat.redLight : tesla ? mat.cyan : missile ? mat.edge : mat.orange;
      view.head.scale.setScalar(tesla ? .22 : enemyShot ? .2 : .15); view.head.scale.z *= 2;
      view.body.visible = missile || torpedo; view.flame.visible = missile;
      view.body.material = torpedo ? mat.dark : mat.edge;
      if (missile) view.flame.scale.y = .5 + Math.sin(time * 45) * .15;
      view.trail.visible = missile || torpedo || enemyShot || tesla;
      view.material.color.setHex(torpedo ? 0xc4eee5 : enemyShot ? 0xff7751 : tesla ? 0x77ffff : 0xffdb9a);
      if (view.fresh) { for (let i = 0; i < 10; i++) { view.positions[i * 3] = projectile.x; view.positions[i * 3 + 1] = y; view.positions[i * 3 + 2] = projectile.z; } view.fresh = false; }
      else { view.positions.copyWithin(3, 0, 27); view.positions[0] = projectile.x; view.positions[1] = y; view.positions[2] = projectile.z; }
      view.trail.geometry.attributes.position.needsUpdate = true;
    }
    for (const [id, view] of projectileViews) if (view.stamp !== stamp) { view.root.visible = false; view.trail.visible = false; projectileViews.delete(id); projectileFree.push(view); }
    for (const effect of game.effects) {
      if (effect.delay > 0) continue;
      let view = effectViews.get(effect.id);
      if (!view) {
        view = effectFree.pop(); if (!view) continue;
        view.root.visible = true; view.effect = effect; effectViews.set(effect.id, view);
        if (effect.kind === 'muzzle' && Math.hypot(effect.x || 0, effect.z || 0) < 3) recoil = Math.max(recoil, .32);
        if (effect.kind === 'rail') { recoil = .9; if (!reducedMotion) shake = .22; }
        sound(effect.kind);
      }
      view.stamp = stamp; updateEffect(view, effect);
    }
    for (const [id, view] of effectViews) if (view.stamp !== stamp) { view.root.visible = false; effectViews.delete(id); effectFree.push(view); }
    chargeGroup.visible = !!game.charge; chargeLine.visible = !!game.charge;
    if (game.charge) {
      if (!wasCharging) sound('charge');
      const charge = game.charge, p = Math.max(0, Math.min(1, 1 - charge.remaining / charge.duration));
      const angle = Math.atan2(charge.x, charge.z), x = Math.sin(angle) * 2.7, z = Math.cos(angle) * 2.7;
      chargeGroup.position.set(x, 2.2, z);
      chargeRing.scale.setScalar(1.4 - p * 1.1); chargeRing.rotation.z = time * 4;
      chargeOrb.scale.setScalar(.08 + p * .62); chargeMaterial.opacity = .25 + p * .7;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU + time * 2, r = (.8 + (i % 3) * .4) * (1 - p * .85);
        scratch.position.set(Math.sin(a) * r, Math.cos(a * 2) * r * .4, Math.cos(a) * r);
        scratch.scale.setScalar(.045 + p * .04); scratch.updateMatrix(); chargeParticles.setMatrixAt(i, scratch.matrix);
      }
      chargeParticles.instanceMatrix.needsUpdate = true;
      beam(chargeLine, x, 2.2, z, charge.x, .15, charge.z, .018 + p * .018);
    }
    wasCharging = !!game.charge;
    if (shake > .001 && !reducedMotion) { shake *= Math.exp(-dt * 12); camera.position.x = Math.sin(time * 70) * shake; camera.position.y = 45 + Math.cos(time * 65) * shake; camera.updateMatrixWorld(); }
    else if (camera.position.x !== 0 || camera.position.y !== 45) { camera.position.set(0, 45, 32); camera.updateMatrixWorld(); }
    renderer.render(scene, camera);
  }
  function reset() {
    for (const view of seaEvents.values()) { view.root.visible = false; view.root.name = ''; seaEventFree.push(view); }
    seaEvents.clear();
    for (const view of enemyViews.values()) { scene.remove(view.root); enemyFree.get(view.type)?.push(view); }
    enemyViews.clear();
    for (const view of effectViews.values()) { view.root.visible = false; effectFree.push(view); } effectViews.clear();
    for (const view of projectileViews.values()) { view.root.visible = false; view.trail.visible = false; projectileFree.push(view); } projectileViews.clear();
    recoil = 0; shake = 0; wasCharging = false;
  }
  return { renderer, scene, camera, assetsReady, render, reset, project, unproject, resize, get models() { return models; } };
}
