import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { azElToEnu, DEG, enuToSurface, MOON_RADIUS_KM } from "../data/astro";
import type { HorizonProfile, Sample, Site } from "../data/dataset";
import { clamp01, dustLevel, easeInOutCubic, finalAltitudeM, mix, smoothstep, throttle } from "../flight/timeline";
import { createDust, type Dust } from "./dust";
import { createShipRig, hullYaw, type ShipRig } from "./ship";
import { createEarth, createStars, createSun, mulberry32, type Earth, type SkyBody, type Stars } from "./sky";
import { hash2, sampleGround, seedFromId } from "./terrain";

/** Scene units are metres. +X east, +Y up, +Z south. */
const PATCH_RADIUS = 7000;
const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
const RINGS = 230;
const SECTORS = 256;
const SUN_POWER = 10;
const FLAME_POWER = 5200;
const SKY_SUN = 150_000;
const SKY_EARTH = 120_000;
const SKY_STARS = 180_000;
const SHIP_MID = 24;

export interface SurfaceAssets {
  earth: THREE.Texture | null;
  ship: THREE.Object3D;
  hullEnv: THREE.Texture;
}

const surfaceDir = (azDeg: number, elDeg: number): THREE.Vector3 => {
  const s = enuToSurface(azElToEnu(azDeg, elDeg));
  return new THREE.Vector3(s[0], s[1], s[2]);
};

const groundY = (x: number, z: number, seed: number): number =>
  sampleGround(x, z, seed).height - (x * x + z * z) / (2 * MOON_RADIUS_M);

/** Polar grid: fine near the pad, coarse far away, with the Moon's curvature. */
function buildGround(seed: number): THREE.BufferGeometry {
  const growth = 0.025;
  const first = PATCH_RADIUS / (Math.exp(growth * RINGS) - 1);
  const count = RINGS * SECTORS + 1;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const put = (i: number, x: number, z: number): void => {
    const g = sampleGround(x, z, seed);
    position.set([x, g.height - (x * x + z * z) / (2 * MOON_RADIUS_M), z], i * 3);
    color.set([0.37 * g.tone, 0.355 * g.tone, 0.335 * g.tone], i * 3);
    uv.set([x / 31, z / 31], i * 2);
  };
  put(0, 0, 0);
  for (let i = 1; i <= RINGS; i++) {
    const r = first * (Math.exp(growth * i) - 1);
    for (let j = 0; j < SECTORS; j++) {
      const a = (j / SECTORS) * Math.PI * 2;
      put(1 + (i - 1) * SECTORS + j, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const index: number[] = [];
  const at = (i: number, j: number): number => 1 + (i - 1) * SECTORS + (j % SECTORS);
  for (let j = 0; j < SECTORS; j++) index.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Far hills from the published horizon profile. For each azimuth the crest is
 * at the elevation the dataset gives, seen from the pad. The hills are drawn as
 * a long slope that starts on the plain and climbs to the crest, so they read
 * as terrain and not as a wall. Only the crest height is data; the slope shape
 * is for the picture. Unknown values are drawn at 0°.
 */
function buildHorizon(profile: HorizonProfile): THREE.BufferGeometry {
  const n = profile.horizonElevationDeg.length;
  const position = new Float32Array(n * 2 * 3);
  const color = new Float32Array(n * 2 * 3);
  const foot = PATCH_RADIUS * 0.45;
  for (let i = 0; i < n; i++) {
    const az = i * profile.azimuthStepDeg;
    const el = profile.horizonElevationDeg[i] ?? 0;
    const d = surfaceDir(az, 0);
    const crest = Math.max(-60, PATCH_RADIUS * Math.tan(el * DEG));
    position.set([d.x * foot, -14, d.z * foot], i * 6);
    position.set([d.x * PATCH_RADIUS, crest, d.z * PATCH_RADIUS], i * 6 + 3);
    // Same grey as the regolith, with a slow change around the horizon.
    const shade = 0.3 * (0.92 + 0.08 * Math.sin(az * DEG * 7) + 0.05 * Math.sin(az * DEG * 23 + 1.3));
    color.set([shade, shade * 0.97, shade * 0.93, shade, shade * 0.97, shade * 0.93], i * 6);
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    index.push(a, b, a + 1, b, b + 1, a + 1); // front faces look inward and up, toward the pad
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setIndex(index);
  // Real slope normals: the side facing the Sun is lit, the other side falls in shadow.
  geometry.computeVertexNormals();
  return geometry;
}

/** Small tiling normal map for the grain of the soil close to the camera. */
function soilNormalMap(): THREE.DataTexture {
  const size = 256;
  const rand = mulberry32(99);
  const height = new Float32Array(size * size);
  for (const [cells, amp] of [[8, 1], [16, 0.6], [32, 0.35], [64, 0.2]] as const) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const h = (a: number, b: number): number => hash2(a % cells, b % cells, cells * 7);
        const top = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx;
        const bottom = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
        height[y * size + x] += (top + (bottom - top) * sy) * amp;
      }
    }
  }
  for (let c = 0; c < 70; c++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 3 + rand() * rand() * 22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        const d = Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy)) / r;
        if (d < 1) height[y * size + x] += (d * d - 1) * r * 0.09;
        else if (d < 1.6) height[y * size + x] += r * 0.02 * (1.6 - d);
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = new THREE.Vector3(at(x - 1, y) - at(x + 1, y), at(x, y - 1) - at(x, y + 1), 0.55).normalize();
      data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Near view: the ship on a local ground patch, lit by the Sun and Earth at the
 * azimuth and elevation the dataset gives for the site.
 */
export class SurfaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 250_000);
  /** Tone-mapping exposure that suits the current light. */
  exposure = 1;

  private readonly controls: OrbitControls;
  private readonly rig: ShipRig;
  private readonly dust: Dust;
  private readonly stars: Stars;
  private readonly sun: SkyBody;
  private readonly earth: Earth;
  private readonly sunLight = new THREE.DirectionalLight(0xfff3e2, 0);
  private readonly earthLight = new THREE.DirectionalLight(0x9db8ff, 0);
  private readonly bounce = new THREE.HemisphereLight(0x000000, 0x8a8377, 0);
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly glow: THREE.Mesh;
  private ground: THREE.Mesh | null = null;
  private horizon: THREE.Mesh | null = null;
  private seed = 0;
  private cameraAzDeg = 0;
  private shipYaw = 0;
  private readonly look = new THREE.Vector3(0, SHIP_MID, 0);
  private readonly sunColor = new THREE.Color();

  private frameKey = "";

  constructor(assets: SurfaceAssets, private readonly dom: HTMLElement) {
    this.groundMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      normalMap: soilNormalMap(),
      normalScale: new THREE.Vector2(0.5, 0.5),
    });

    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.5;
    this.sunLight.shadow.camera.near = 500;
    this.sunLight.shadow.camera.far = 6500;
    this.sunLight.target.position.set(0, 20, 0);
    this.scene.add(this.sunLight, this.sunLight.target, this.earthLight, this.bounce, new THREE.AmbientLight(0x8fa0c0, 0.012));

    this.stars = createStars(SKY_STARS);
    this.sun = createSun();
    this.earth = createEarth(assets.earth);
    this.scene.add(this.stars.object, this.sun.object, this.earth.object);

    this.rig = createShipRig(assets.ship, assets.hullEnv, FLAME_POWER, 0.3);
        this.scene.add(this.rig.root);

    this.dust = createDust();
    this.scene.add(this.dust.object);

    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: new THREE.Color(1.6, 2.1, 3.2),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.glow.position.y = 0.35;
    this.scene.add(this.glow);

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enabled = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 75;
    this.controls.maxDistance = 1400;
    this.controls.maxPolarAngle = 96 * DEG;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.addEventListener("start", () => (this.controls.autoRotate = false));
  }

  /** Builds the ground for a site. Call once per flight, before the first frame of the shot. */
  prepare(site: Site, profile: HorizonProfile | null, sample: Sample): void {
    this.seed = seedFromId(site.id);
    this.ground?.geometry.dispose();
    this.horizon?.geometry.dispose();
    if (this.ground) this.scene.remove(this.ground);
    if (this.horizon) this.scene.remove(this.horizon);

    this.ground = new THREE.Mesh(buildGround(this.seed), this.groundMaterial);
    this.ground.receiveShadow = true;
    this.ground.castShadow = true;
    this.scene.add(this.ground);

    this.horizon = null;
    if (profile) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
      this.horizon = new THREE.Mesh(buildHorizon(profile), material);
      this.scene.add(this.horizon);
    }

    // Camera on the far side of the light, off axis: the ship is lit from the side and a little from behind.
    const lightAz = sample.sunState ? sample.sunAzDeg : sample.earthAzDeg;
    this.cameraAzDeg = lightAz + 150;
    // Steel side toward the first camera position, turned a little so the heat shield edge shows.
    const az = this.cameraAzDeg * DEG;
    this.shipYaw = hullYaw(new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(Math.sin(az), 0, -Math.cos(az))) + 0.55;
    this.dust.reset();
    this.controls.enabled = false;
  }

  /** Sun and Earth from the dataset sample for this site. */
  setSky(sample: Sample, timeS: number): void {
    const origin = this.camera.position;
    const sunDir = surfaceDir(sample.sunAzDeg, sample.sunElDeg);
    const earthDir = surfaceDir(sample.earthAzDeg, sample.earthElDeg);
    this.sun.place(origin, sunDir, SKY_SUN, sample.sunRadiusDeg);
    this.earth.place(origin, earthDir, SKY_EARTH, sample.earthRadiusDeg);
    this.earth.setSun(sunDir);
    this.earth.spin(timeS * 0.02);
    this.stars.object.position.copy(origin);

    // Light follows the published visibility state: 2 = whole disc, 1 = part, 0 or unknown = none.
    const sunLevel = sample.sunState === 2 ? 1 : sample.sunState === 1 ? 0.45 : 0;
    const earthLevel = sample.earthState ? 1 : 0;
    const lightEl = Math.max(sample.sunElDeg, 0.9);
    const lightDir = surfaceDir(sample.sunAzDeg, lightEl);
    this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(lightDir, 3000);
    this.sunLight.intensity = SUN_POWER * sunLevel;
    // Low Sun: long shadows. Widen the shadow area so the ship shadow stays inside.
    const half = THREE.MathUtils.clamp((52 / Math.tan(lightEl * DEG)) * 0.8, 150, 560);
    const cam = this.sunLight.shadow.camera;
    if (cam.right !== half) {
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.updateProjectionMatrix();
    }
    this.sunColor.copy(this.sunLight.color).multiplyScalar(sunLevel * (0.25 + 0.75 * Math.sin(lightEl * DEG)) * 2.2);

    this.earthLight.position.copy(earthDir).multiplyScalar(1000);
    this.earthLight.intensity = 0.22 * earthLevel * (1 - sunLevel * 0.8);
    this.bounce.intensity = SUN_POWER * 0.2 * sunLevel * Math.max(Math.sin(sample.sunElDeg * DEG), 0.22);
    this.rig.setSurroundings(0.08 + 0.92 * sunLevel);
    this.stars.setIntensity(mix(1, 0.4, sunLevel));
    // High Sun makes the ground very bright: close the exposure. Low Sun: open it.
    const low = 1 - smoothstep(0, 35, sample.sunElDeg);
    this.exposure = sunLevel > 0 ? mix(0.7, 1.3, low) : 1.9;
  }

  /** Shot 3: the last metres, seen from the ground. k runs 0..1. */
  setFinal(k: number, timeS: number, dt: number): void {
    this.frame();
    const altitude = finalAltitudeM(k);
    const power = throttle(k);
    const sway = clamp01(altitude / 320);
    this.rig.root.position.set(0, altitude, 0);
    this.rig.root.rotation.set(Math.sin(timeS * 1.3) * 0.014 * sway, this.shipYaw, Math.cos(timeS * 1.1) * 0.014 * sway);
    this.rig.setThrottle(power, timeS, 0.15);
    // The flame light sits under the ship, so it lights the ground more than the hull.
    // Near the ground it stays just above the soil and gets weaker.
    const lightY = Math.max(2 - altitude, -14);
    this.rig.engineLight.position.y = lightY;
    this.rig.engineLight.intensity *= THREE.MathUtils.clamp((altitude + lightY) / 14 + 0.12, 0.12, 1);

    const near = 1 - smoothstep(8, 150, altitude);
    this.dust.update(dt, dustLevel(k), this.sunColor, power * near);
    const glow = this.glow.material as THREE.MeshBasicMaterial;
    glow.opacity = power * near * (0.85 + 0.15 * Math.sin(timeS * 47));
    this.glow.scale.setScalar(mix(30, 85, near));

    const e = easeInOutCubic(clamp01(k));
    const distance = mix(215, 160, e);
    const az = (this.cameraAzDeg + 14 * e) * DEG;
    const x = Math.sin(az) * distance;
    const z = -Math.cos(az) * distance;
    this.camera.position.set(x, groundY(x, z, this.seed) + mix(2.2, 5.5, e), z);
    const shake = 0.5 * power * near;
    this.look.set(
      Math.sin(timeS * 53) * shake,
      altitude + SHIP_MID + Math.sin(timeS * 61 + 1) * shake,
      Math.cos(timeS * 47) * shake,
    );
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }

  /**
   * On wide screens the caption sits left of centre. Shift the picture to the
   * right so the ship and its pad stay clear of it.
   */
  private frame(): void {
    const w = this.dom.clientWidth;
    const h = this.dom.clientHeight;
    const key = `${w}x${h}`;
    if (key === this.frameKey) return;
    this.frameKey = key;
    if (w > 1180) this.camera.setViewOffset(w, h, -0.13 * w, 0, w, h);
    else this.camera.clearViewOffset();
  }

  /** Puts the ship on the pad with no animation (skip, or reduced motion). */
  snapLanded(): void {
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.rotation.set(0, this.shipYaw, 0);
    this.rig.setThrottle(0, 0);
    this.dust.reset();
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0;
    const az = (this.cameraAzDeg + 14) * DEG;
    const x = Math.sin(az) * 160;
    const z = -Math.cos(az) * 160;
    this.camera.position.set(x, groundY(x, z, this.seed) + 5.5, z);
    this.look.set(0, SHIP_MID, 0);
    this.camera.lookAt(this.look);
  }

  /** Hands the camera to the user. */
  enterLanded(): void {
    this.look.set(0, SHIP_MID, 0);
    this.controls.target.copy(this.look);
    this.controls.enabled = true;
    this.controls.autoRotate = true;
    this.controls.update();
  }

  /** Shot 4: the ship stands, the user looks around, the dust falls back. */
  setLanded(timeS: number, dt: number): void {
    this.frame();
    this.rig.setThrottle(0, timeS);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0;
    this.dust.update(dt, 0, this.sunColor, 0);
    this.controls.update(dt);
    const p = this.camera.position;
    const floor = groundY(p.x, p.z, this.seed) + 1.6;
    if (p.y < floor) p.y = floor;
    this.camera.updateMatrixWorld();
  }

  leave(): void {
    this.controls.enabled = false;
  }
}
