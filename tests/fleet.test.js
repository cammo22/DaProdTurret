import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as visuals from '../src/renderer.js';

const root = new URL('../public/', import.meta.url);
const ids = ['cannon', 'tesla', 'rail', 'skiff', 'frigate', 'armored', 'boss', 'submarine'];
test('every required combat actor has a real local Meshy GLB and bounded provenance', () => {
  const manifestURL = new URL('assets/fleet/manifest.json', root);
  assert.ok(existsSync(manifestURL), 'new fleet manifest must exist');
  const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
  assert.deepEqual(Object.keys(manifest.assets).filter(id => id !== 'bomber').sort(), [...ids].sort());
  assert.ok(Number.isFinite(manifest.totalCredits) && manifest.totalCredits > 0 && manifest.totalCredits <= 160);
  for (const id of [...ids, ...(manifest.assets.bomber ? ['bomber'] : [])]) {
    const asset = manifest.assets[id];
    assert.equal(asset.file, `assets/fleet/${id}.glb`);
    assert.ok(typeof asset.taskId === 'string' && asset.taskId.length > 0);
    const bytes = readFileSync(new URL(asset.file, root));
    assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(gltf.meshes?.length > 0);
    assert.ok(!gltf.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'offline models must not require CDN Draco decoder');
    for (const item of [...(gltf.buffers || []), ...(gltf.images || [])]) {
      if (!item.uri) continue;
      assert.ok(!/^https?:/i.test(item.uri) && !item.uri.includes('..'), 'no external credentialed/signed URL or traversal');
      if (!item.uri.startsWith('data:')) assert.ok(existsSync(new URL(item.uri, new URL(asset.file, root))));
    }
    assert.ok(bytes.length < 8_000_000, `${id} must fit the mobile download budget`);
  }
});

test('cinematic perspective fits the complete threat cylinder at every aspect and zoom', () => {
  assert.equal(typeof visuals.createBattleCameraRig, 'function');
  const point = new THREE.Vector3();
  for (const aspect of [320 / 900, 390 / 844, 1, 16 / 9, 21 / 9]) {
    const rig = visuals.createBattleCameraRig({ aspect });
    assert.ok(rig.camera.isPerspectiveCamera);
    const elevation = Math.atan2(rig.camera.position.y, rig.camera.position.z);
    assert.ok(elevation < Math.PI / 4 && elevation > Math.PI / 6, 'models need a lower, readable angle');
    for (const zoom of [.7, 1, 1.4]) {
      rig.setZoom(zoom); rig.fit({ radius: 27, crowd: 40 });
      for (let i = 0; i < 360; i++) for (const y of [0, 5]) {
        const angle = i * Math.PI / 180;
        point.set(Math.cos(angle) * 27, y, Math.sin(angle) * 27).project(rig.camera);
        assert.ok(Math.abs(point.x) < .94 && Math.abs(point.y) < .94 && point.z < 1, `cropped threat: ${aspect}, ${zoom}, ${i}, ${y}`);
      }
    }
  }
});

test('camera zoom is absolute, bounded, resettable, and cannot silently crop threats', () => {
  assert.equal(typeof visuals.createBattleCameraRig, 'function');
  const rig = visuals.createBattleCameraRig({ aspect: 16 / 9 });
  const initial = rig.camera.position.length();
  rig.setZoom(.8); assert.equal(rig.zoom, .8);
  assert.ok(rig.camera.position.length() > initial);
  rig.setZoom(.8); assert.equal(rig.zoom, .8);
  rig.adjustZoom(.2); assert.equal(rig.zoom, 1);
  rig.setZoom(100); assert.equal(rig.zoom, 1.4);
  rig.setZoom(NaN); assert.equal(rig.zoom, 1.4);
  rig.resetZoom(); assert.equal(rig.zoom, 1);
  rig.fit({ radius: 27, crowd: 40 });
  assert.ok(rig.camera.position.length() > initial, 'crowded encounters widen the frame');
});

test('perspective aim projection round trips against the sea plane after zoom and resize', () => {
  assert.equal(typeof visuals.createBattleCameraRig, 'function');
  const rig = visuals.createBattleCameraRig();
  const ray = new THREE.Raycaster(), hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  for (const aspect of [.46, 1.78]) for (const zoom of [.7, 1.4]) {
    rig.resize(aspect); rig.setZoom(zoom);
    for (const [x, z] of [[0, 0], [19, -13], [-17, 11], [0, 23]]) {
      const ndc = new THREE.Vector3(x, 0, z).project(rig.camera);
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), rig.camera);
      assert.ok(ray.ray.intersectPlane(plane, hit));
      assert.ok(hit.distanceTo(new THREE.Vector3(x, 0, z)) < 1e-9);
    }
  }
});

test('missile and bomb poses use engine world altitude and full three-dimensional velocity', () => {
  assert.equal(typeof visuals.updateProjectilePose, 'function');
  const object = new THREE.Group(), nose = new THREE.Vector3(0, 0, 1);
  for (const projectile of [
    { kind: 'missile', phase: 'ascent', x: 1, z: 2, y: 8, vx: 2, vy: 16, vz: -1 },
    { kind: 'missile', phase: 'dive', x: 8, z: -9, y: 11, vx: -2, vy: -22, vz: 3 },
    { kind: 'bomb', x: -7, z: 5, y: 6, vx: 0, vy: -18, vz: 0 },
  ]) {
    visuals.updateProjectilePose(object, projectile, .8);
    assert.deepEqual(object.position.toArray(), [projectile.x, projectile.y, projectile.z]);
    const actual = nose.clone().applyQuaternion(object.quaternion);
    const expected = new THREE.Vector3(projectile.vx, projectile.vy, projectile.vz).normalize();
    assert.ok(actual.distanceTo(expected) < 1e-12);
  }
  visuals.updateProjectilePose(object, { kind: 'shell', x: 3, z: 4, vx: 0, vz: 0, tx: 3, tz: 4 }, 1.7);
  assert.equal(object.position.y, 1.7);
  assert.ok(object.quaternion.toArray().every(Number.isFinite));
});

test('aircraft passes traverse endpoints above the sea and follow their flight direction', () => {
  assert.equal(typeof visuals.updateAircraftPose, 'function');
  const aircraft = new THREE.Group();
  const pass = { x: -30, z: -14, tx: 30, tz: 14, maxTtl: 3, ttl: 3 };
  visuals.updateAircraftPose(aircraft, pass);
  assert.deepEqual(aircraft.position.toArray(), [-30, 14, -14]);
  pass.ttl = 1.5; visuals.updateAircraftPose(aircraft, pass);
  assert.deepEqual(aircraft.position.toArray(), [0, 14, 0]);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(aircraft.quaternion);
  assert.ok(forward.dot(new THREE.Vector3(60, 0, 28).normalize()) > .999);
  pass.ttl = 0; visuals.updateAircraftPose(aircraft, pass);
  assert.deepEqual(aircraft.position.toArray(), [30, 14, 14]);
});

test('bomber normalization preserves its wingspan axis and Meshy PBR material', () => {
  assert.ok(visuals.FLEET_IDS.includes('bomber'));
  const material = new THREE.MeshStandardMaterial({ color: 0x123456, metalness: .4, roughness: .6 });
  const source = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 8), material);
  const aircraft = visuals.normalizeModel(source, 'bomber');
  const size = new THREE.Box3().setFromObject(aircraft).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 6) < 1e-9 && Math.abs(size.z - 4) < 1e-9, 'wide wings must not be mistaken for a boat longitudinal axis');
  assert.equal(source.material, material);
});

test('optional bomber is not requested until the manifest contains it', async () => {
  const requested = [], loaded = [];
  const results = await visuals.preloadFleet({ manifestUrl: '/manifest.json', baseUrl: '/',
    fetcher: async () => ({ ok: true, json: async () => ({ assets: Object.fromEntries(ids.map(id => [id, {}])) }) }),
    loadModel: async url => { requested.push(url); return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), new THREE.MeshStandardMaterial()); },
    onLoaded: id => loaded.push(id),
  });
  assert.equal(requested.length, 8); assert.equal(loaded.length, 8);
  assert.equal(results.length, 9); assert.equal(results[8].status, 'rejected');
  assert.ok(!requested.some(url => url.includes('bomber')));
});

test('environment styles distinguish real storm waves, fog and directional current without hiding danger', () => {
  assert.equal(typeof visuals.environmentStyle, 'function');
  const state = {};
  assert.equal(visuals.environmentStyle({ type: 'calm' }, 80, state), state, 'reuse caller-owned state');
  const calmWaves = state.waveAmplitude, calmSun = state.sunIntensity;
  visuals.environmentStyle({ type: 'storm' }, 80, state);
  assert.ok(state.waveAmplitude > calmWaves * 3);
  assert.ok(state.rain > 0 && state.sunIntensity < calmSun);
  visuals.environmentStyle({ type: 'fog' }, 80, state);
  const dangerFog = (80 + 23 - state.fogNear) / (state.fogFar - state.fogNear);
  assert.ok(dangerFog > .1 && dangerFog < .5, 'fog visible, but silhouettes remain discernible');
  visuals.environmentStyle({ type: 'current', dx: -3, dz: 4 }, 170, state);
  assert.ok(Math.abs(state.flowX + .6) < 1e-12 && Math.abs(state.flowZ - .8) < 1e-12);
  assert.equal(state.current, 1); assert.equal(state.rain, 0);
  visuals.environmentStyle(undefined, 80, state);
  assert.equal(state.current, 0); assert.equal(state.waveAmplitude, calmWaves);
  assert.ok(Number.isFinite(state.flowX) && Number.isFinite(state.flowZ));
});
