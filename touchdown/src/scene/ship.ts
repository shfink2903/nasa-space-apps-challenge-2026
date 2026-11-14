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
 * Only the two materials are restyled: bare steel and dark heat shield.
 */
export function createShipRig(model: THREE.Object3D, envMap: THREE.Texture, lightPower: number, plumeGain = 1): ShipRig {
  const body = model.clone(true);
  const steel = new THREE.MeshStandardMaterial({
    color: 0xd4d8de,
    metalness: 0.62,
    roughness: 0.4,
    envMap,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
  });
  const shield = new THREE.MeshStandardMaterial({
    color: 0x0c0c0f,
    metalness: 0.15,
    roughness: 0.78,
    envMap,
    envMapIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material).name;
    mesh.material = name === "Protection thermique" ? shield : steel;
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
      steel.envMapIntensity = 1.25 * level;
      shield.envMapIntensity = 0.5 * level;
    },
  };
}
