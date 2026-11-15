import * as THREE from "three";

/** Camera-local heading toward the selected point, with enough tilt to keep the hull readable. */
export function siteHeading(shipLocal: THREE.Vector3, siteWorld: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
  const target = siteWorld.clone().applyMatrix4(camera.matrixWorldInverse);
  if (target.z >= -0.001) return target.sub(shipLocal).normalize();

  // Keep the site's screen position but bring its aim point near the overlay ship.
  // Aiming at the actual, distant surface would show almost only the ship's tail.
  target.multiplyScalar(shipLocal.z / target.z);
  const separation = target.distanceTo(shipLocal);
  target.multiplyScalar(1 + 0.7 * separation / -shipLocal.z);
  return target.sub(shipLocal).normalize();
}

/** Turn along the shortest arc from the current nose; repeated clicks never reset it. */
export function turnHeading(current: THREE.Vector3, target: THREE.Vector3, dt: number): void {
  if (target.lengthSq() < 1e-12 || dt <= 0) return;
  const angle = current.angleTo(target);
  if (angle < 1e-8) return;
  const fraction = Math.min(1 - Math.exp(-8 * dt), 3.5 * dt / angle);
  const rotation = new THREE.Quaternion().setFromUnitVectors(current, target);
  rotation.slerp(new THREE.Quaternion(), 1 - fraction);
  current.applyQuaternion(rotation).normalize();
}
