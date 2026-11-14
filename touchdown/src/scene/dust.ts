import * as THREE from "three";
import { mulberry32 } from "./sky";

const COUNT = 40000;
const LUNAR_GRAVITY = 1.62; // m/s², physical constant
const MAX_AGE = 8;

export interface Dust {
  object: THREE.Points;
  /** level 0..1 = how much new dust the flame lifts this frame. */
  update(dt: number, level: number, sunColor: THREE.Color, flame: number): void;
  reset(): void;
}

/**
 * Dust thrown out by the flame. There is no air on the Moon: grains do not
 * billow. They leave fast, low and straight, and fall back on simple arcs.
 */
export function createDust(): Dust {
  const rand = mulberry32(7);
  const position = new Float32Array(COUNT * 3);
  const velocity = new Float32Array(COUNT * 3);
  const age = new Float32Array(COUNT).fill(MAX_AGE);
  const info = new Float32Array(COUNT * 2); // size, alpha
  position.fill(-1e6);

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage);
  const infoAttr = new THREE.BufferAttribute(info, 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aInfo", infoAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Color() }, uFlame: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aInfo; uniform float uScale, uFlame; uniform vec3 uSun; varying float vAlpha; varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Grains that fly close to the lens fade out instead of turning into big discs.
        vAlpha = aInfo.y * smoothstep(8.0, 60.0, -mv.z);
        gl_PointSize = clamp(aInfo.x * uScale / max(-mv.z, 1.0), 1.5, 16.0);
        // Soil tone lit by the Sun, plus the flame, which only reaches the grains near it.
        float reach = 1.0 / (1.0 + dot(position.xz, position.xz) / 1600.0);
        vColor = vec3(0.42, 0.4, 0.37) * uSun + vec3(0.5, 0.62, 0.95) * uFlame * reach;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d) * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 5;

  let cursor = 0;

  return {
    object,
    update(dt, level, sunColor, flame) {
      (material.uniforms.uSun.value as THREE.Color).copy(sunColor);
      material.uniforms.uFlame.value = flame;
      material.uniforms.uScale.value = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan((42 * Math.PI) / 360));

      let spawn = Math.round(level * 11000 * dt);
      for (let n = 0; n < COUNT && spawn > 0; n++) {
        const i = cursor;
        cursor = (cursor + 1) % COUNT;
        if (age[i] < MAX_AGE) continue;
        const a = rand() * Math.PI * 2;
        const r = 5 + rand() * 9;
        const speed = 20 + 80 * Math.pow(rand(), 1.6);
        const lift = (0.5 + 6.5 * rand() * rand()) * (Math.PI / 180);
        position.set([Math.cos(a) * r, 0.3, Math.sin(a) * r], i * 3);
        velocity.set([Math.cos(a) * Math.cos(lift) * speed, Math.sin(lift) * speed + 1.5, Math.sin(a) * Math.cos(lift) * speed], i * 3);
        age[i] = 0;
        info[i * 2] = 0.45 + 1.0 * rand();
        spawn--;
      }

      for (let i = 0; i < COUNT; i++) {
        if (age[i] >= MAX_AGE) continue;
        age[i] += dt;
        const j = i * 3;
        velocity[j + 1] -= LUNAR_GRAVITY * dt;
        position[j] += velocity[j] * dt;
        position[j + 1] += velocity[j + 1] * dt;
        position[j + 2] += velocity[j + 2] * dt;
        if (position[j + 1] < 0 || age[i] >= MAX_AGE) {
          age[i] = MAX_AGE;
          position[j + 1] = -1e6;
          info[i * 2 + 1] = 0;
          continue;
        }
        const t = age[i] / MAX_AGE;
        info[i * 2 + 1] = 0.3 * Math.min(1, age[i] * 6) * (1 - t * t);
      }
      positionAttr.needsUpdate = true;
      infoAttr.needsUpdate = true;
    },
    reset() {
      age.fill(MAX_AGE);
      position.fill(-1e6);
      info.fill(0);
      positionAttr.needsUpdate = true;
      infoAttr.needsUpdate = true;
    },
  };
}
