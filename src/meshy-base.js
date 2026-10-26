import { Box3, Vector3, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Optional generated geometry; procedural combat geometry always remains functional. */
export async function loadMeshyBase(scene) {
  try {
    const { scene: model } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/meshy-platform.glb`);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = 7.2 / Math.max(size.x, size.z);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, 0.58 - box.max.y * scale, -center.z * scale);
    model.name = 'meshy-platform';
    model.userData.provider = 'Meshy';
    model.userData.taskId = '01a17a66-78e1-711e-a7b6-bca435553e55';
    const metal = new MeshStandardMaterial({ color: 0x48646c, roughness: 0.63, metalness: 0.65, flatShading: true });
    model.traverse(node => {
      if (node.isMesh) {
        node.material = metal;
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    scene.add(model);
    return model;
  } catch (error) {
    console.warn('Base Meshy non disponibile; geometria procedurale attiva.', error.message);
    return null;
  }
}
