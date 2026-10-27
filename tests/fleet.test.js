import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../public/', import.meta.url);
const ids = ['cannon', 'tesla', 'rail', 'skiff', 'frigate', 'armored', 'boss', 'submarine'];
test('every required combat actor has a real local Meshy GLB and bounded provenance', () => {
  const manifestURL = new URL('assets/fleet/manifest.json', root);
  assert.ok(existsSync(manifestURL), 'new fleet manifest must exist');
  const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
  assert.deepEqual(Object.keys(manifest.assets).sort(), [...ids].sort());
  assert.ok(Number.isFinite(manifest.totalCredits) && manifest.totalCredits > 0 && manifest.totalCredits <= 160);
  for (const id of ids) {
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
