import * as THREE from "three";
import { createPlume, type Plume } from "./plume";

export interface ShipRig {
  /** Origin at the centre of the base. +Y is the nose. Height is in model units (metres). */
  root: THREE.Group;
  height: number;
  plume: Plume;
  /** Light of the flame on nearby surfaces. Power is set by the scene. */
  engineLight: THREE.PointLight;
  setThrottle(throttle: number, timeS: number, groundY?: number): void;
  /** 0..1: how bright the surroundings are. Scales the reflections on the hull. */
  setSurroundings(level: number): void;
}

/**
 * Turn around the ship's long axis that shows the steel side to the camera.
 * In the model the steel side looks toward local -Z and the heat shield toward +Z.
 * `base` is the ship orientation before that turn.
 */
export function hullYaw(base: THREE.Quaternion, shipPosition: THREE.Vector3, cameraPosition: THREE.Vector3): number {
  const toCamera = cameraPosition.clone().sub(shipPosition).applyQuaternion(base.clone().invert());
  return Math.atan2(-toCamera.x, -toCamera.z);
}

/**
 * Builds a ship from the loaded model. The model keeps its own proportions.
 * Preserve the model's materials, including its markings.
 */
export function createShipRig(model: THREE.Object3D, envMap: THREE.Texture, lightPower: number, plumeGain = 1): ShipRig {
  const body = model.clone(true);
  const materials: THREE.MeshStandardMaterial[] = [];
  const clonedMaterials = new Map<THREE.Material, THREE.Material>();
  const copyMaterial = (material: THREE.Material): THREE.Material => {
    let copy = clonedMaterials.get(material);
    if (!copy) {
      copy = material.clone();
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.envMap = envMap;
        copy.envMapIntensity = 1;
        materials.push(copy);
      }
      clonedMaterials.set(material, copy);
    }
    return copy;
  };
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(copyMaterial)
      : copyMaterial(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  body.position.set(-center.x, -box.min.y, -center.z);
  const height = box.max.y - box.min.y;

  const plume = createPlume(plumeGain);
  const engineLight = new THREE.PointLight(0xbcd2ff, 0, 0, 2);
  engineLight.position.set(0, -4, 0);

  const root = new THREE.Group();
  root.add(body, plume.object, engineLight);
  return {
    root,
    height,
    plume,
    engineLight,
    setThrottle(throttle, timeS, groundY) {
      plume.set(throttle, timeS, groundY);
      engineLight.intensity = lightPower * throttle;
    },
    setSurroundings(level) {
      for (const material of materials) material.envMapIntensity = level;
    },
  };
}
