import * as THREE from "three";
import { DEG } from "../data/astro";

/** Small deterministic random source, so the sky is the same on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stars {
  object: THREE.Points;
  setIntensity(x: number): void;
}

/**
 * Procedural star field with a denser band. It is decoration: the dataset has
 * no sky orientation, so a real catalogue would only look precise.
 */
export function createStars(radius: number, count = 5200): Stars {
  const rand = mulberry32(20261114);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const bandAxis = new THREE.Vector3(0.35, 0.82, -0.45).normalize();
  const bandU = new THREE.Vector3(1, 0, 0).cross(bandAxis).normalize();
  const bandV = bandAxis.clone().cross(bandU);
  const v = new THREE.Vector3();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    if (rand() < 0.42) {
      const a = rand() * Math.PI * 2;
      const off = (rand() + rand() + rand() - 1.5) * 0.22;
      v.copy(bandU).multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandAxis, off);
    } else {
      const z = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(a), z, r * Math.sin(a));
    }
    v.normalize().multiplyScalar(radius);
    positions.set([v.x, v.y, v.z], i * 3);
    const mag = Math.pow(rand(), 6); // few bright stars, many faint ones
    sizes[i] = 1.0 + mag * 2.6;
    const warm = rand();
    tint.setRGB(0.75 + 0.25 * warm, 0.82 + 0.1 * warm, 1.0 - 0.3 * warm);
    const b = 0.25 + 0.9 * mag + 0.25 * rand();
    colors.set([tint.r * b, tint.g * b, tint.b * b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: 1 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; uniform float uPixelRatio; varying vec3 vColor;
      void main() {
        vColor = aColor;
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.08, d);
        gl_FragColor = vec4(vColor * a * uIntensity, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = -10;
  return { object, setIntensity: (x) => (material.uniforms.uIntensity.value = x) };
}

function glareTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.035, "rgba(255,250,240,0.85)");
  g.addColorStop(0.11, "rgba(255,238,215,0.24)");
  g.addColorStop(0.3, "rgba(255,225,195,0.06)");
  g.addColorStop(1, "rgba(255,215,180,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface SkyBody {
  object: THREE.Object3D;
  /** Puts the body in a direction from `origin`, with its real angular radius. */
  place(origin: THREE.Vector3, direction: THREE.Vector3, distance: number, angularRadiusDeg: number): void;
}

export function createSun(): SkyBody {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(48, 43, 36), depthWrite: false }),
  );
  const glare = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glareTexture(),
      color: new THREE.Color(2.5, 2.35, 2.15),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  group.add(disc, glare);
  return {
    object: group,
    place(origin, direction, distance, angularRadiusDeg) {
      group.position.copy(origin).addScaledVector(direction, distance);
      const r = distance * Math.tan(angularRadiusDeg * DEG);
      disc.scale.setScalar(r);
      disc.lookAt(origin);
      glare.scale.setScalar(r * 30);
    },
  };
}

export interface Earth extends SkyBody {
  setSun(direction: THREE.Vector3): void;
  spin(angle: number): void;
}

export function createEarth(map: THREE.Texture | null): Earth {
  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uHasMap: { value: map ? 1 : 0 }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vViewW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uSunDir;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vViewW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 base = mix(vec3(0.05, 0.16, 0.42), texture2D(uMap, vUv).rgb, uHasMap);
        float day = smoothstep(-0.08, 0.25, dot(n, uSunDir));
        float rim = pow(1.0 - max(dot(n, normalize(vViewW)), 0.0), 2.5);
        vec3 col = base * day * 1.15 + vec3(0.25, 0.5, 1.0) * rim * day * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), material);
  const group = new THREE.Group();
  group.add(mesh);
  group.rotation.z = 0.41; // axis tilt, for looks only
  return {
    object: group,
    place(origin, direction, distance, angularRadiusDeg) {
      group.position.copy(origin).addScaledVector(direction, distance);
      group.scale.setScalar(distance * Math.tan(angularRadiusDeg * DEG));
    },
    setSun: (direction) => material.uniforms.uSunDir.value.copy(direction),
    spin: (angle) => (mesh.rotation.y = angle),
  };
}

/**
 * Environment used only for reflections on the steel hull: dark sky above,
 * grey ground below, a brighter band at the horizon.
 */
export function createHullEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = normalize(vDir).y;
          vec3 ground = vec3(0.36, 0.35, 0.33) * smoothstep(0.18, -0.4, y);
          vec3 band = vec3(0.3, 0.29, 0.28) * exp(-pow(y * 3.0, 2.0)); // soft, so hull rings do not flicker
          vec3 sky = vec3(0.012, 0.014, 0.02);
          gl_FragColor = vec4(sky + ground + band, 1.0);
        }`,
    }),
  );
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  return texture;
}
