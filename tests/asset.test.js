import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('generated Meshy platform is a real GLB and has a safe optional engine loader', async () => {
  const moduleURL = new URL('../src/meshy-base.js', import.meta.url);
  assert.ok(existsSync(moduleURL), 'optional Meshy scene loader must exist');
  const bytes = readFileSync(new URL('../public/assets/meshy-platform.glb', import.meta.url));
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const data = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert.ok(data.meshes.length > 0);
  assert.ok(!data.images?.some(image => image.uri?.startsWith('http')), 'no remote texture dependency');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { Box3, Vector3 } = await import('three');
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
});
