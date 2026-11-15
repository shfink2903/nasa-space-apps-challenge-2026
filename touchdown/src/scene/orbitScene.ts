import * as THREE from "three";
import { enuBasis, latLonToUnit, type Vec3 } from "../data/astro";
import type { Site } from "../data/dataset";
import { arcPoint, clamp01, descentRadius, easeInOutCubic, HOLD_RADIUS, mix, smoothstep } from "../flight/timeline";
import { createMoonMaterial, type MoonMaterial } from "./moonMaterial";
import { createShipRig, hullYaw, type ShipRig } from "./ship";
import { createEarth, createStars, createSun, type Earth, type SkyBody, type Stars } from "./sky";

const toV3 = (a: Vec3): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
const UP = new THREE.Vector3(0, 1, 0);
const SOUTH_POLE = new THREE.Vector3(0, -1, 0);

/** Scene distances are in Moon radii. Ship size here is for the picture only. */
// Small and in the corner: the ship invites the landing, the Moon carries the information.
const SHIP_CRUISE_SIZE = 0.034;
const SHIP_PARKED_SIZE = 0.03;
const SHIP_ORBIT_SIZE = 0.03;
const CHASE_FAR = 0.2;
const CHASE_NEAR = 0.082;
const CRUISE_FAR = 6.6;
// Near enough that the polar sites (69° S to 89.5° S) fill the frame and separate.
const CRUISE_NEAR = 2.25;
/** The overview looks at the Moon from under the south pole. */
const CRUISE_LAT_DEG = -79;
const CRUISE_LON_DEG = 4;
/** Site view: this far above the site and this far back, on its south side. */
const FOCUS_UP = 0.5;
const FOCUS_BACK = 0.42;
const BEAM_LENGTH = 0.24;
const STAR_RADIUS = 3000;
const SUN_DISTANCE = 2500;
const EARTH_DISTANCE = 221.3; // 384 400 km in Moon radii

export interface OrbitAssets {
  moonColor: THREE.Texture;
  moonSlope: THREE.Texture;
  earth: THREE.Texture | null;
  ship: THREE.Object3D;
  hullEnv: THREE.Texture;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface PinScreen extends ScreenPoint {
  id: string;
}

interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const LOOK = new THREE.Matrix4();
/** Camera orientation that looks from `eye` to `target` with `up` toward the top of the picture. */
function lookQuat(eye: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(LOOK.lookAt(eye, target, up));
}

function beam(color: THREE.Color): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.0022, 0.0006, 1, 8, 1, true);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(1, BEAM_LENGTH, 1);
  mesh.visible = false;
  return mesh;
}

/** Rings at 80°, 85° and 88° S, and meridians every 30° from 75° S to the pole, just above the ground. */
function createGraticule(): THREE.LineSegments {
  const points: number[] = [];
  const at = (lat: number, lon: number) => {
    const p = latLonToUnit(lat, lon);
    points.push(p[0] * 1.0015, p[1] * 1.0015, p[2] * 1.0015);
  };
  for (const lat of [-80, -85, -88]) {
    for (let lon = 0; lon < 360; lon += 3) {
      at(lat, lon);
      at(lat, lon + 3);
    }
  }
  for (let lon = 0; lon < 360; lon += 30) {
    for (let lat = -75; lat < -89.5; lat -= 0.5) {
      at(lat, lon);
      at(lat - 0.5, lon);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x9dbcff, transparent: true, opacity: 0.3, depthWrite: false });
  return new THREE.LineSegments(geometry, material);
}

/**
 * Far view: the georeferenced Moon seen from under its south pole, Sun, Earth
 * and stars, with the ship drawn in its own overlay scene (same camera, fresh
 * depth buffer).
 */
export class OrbitScene {
  readonly scene = new THREE.Scene();
  readonly shipScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.01, 4000);

  private readonly moon: MoonMaterial;
  private readonly stars: Stars;
  private readonly sun: SkyBody;
  private readonly earth: Earth;
  private readonly rig: ShipRig;
  private readonly shipSun = new THREE.DirectionalLight(0xfff4e6, 3.4);
  private readonly moonFill = new THREE.DirectionalLight(0x9a948c, 0);
  private readonly reticle: THREE.Mesh;
  private readonly sunBeam = beam(new THREE.Color(2.6, 1.7, 0.6));
  private readonly earthBeam = beam(new THREE.Color(0.7, 1.1, 2.8));
  private readonly sunDir = new THREE.Vector3(1, 0.1, 0.4).normalize();
  private readonly earthDir = new THREE.Vector3(0, 0, 1);
  private readonly pose: Pose = { position: new THREE.Vector3(0, 0, 8), quaternion: new THREE.Quaternion() };

  // Captured when a move starts, then interpolated.
  private from: Pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private fromShip = new THREE.Vector3();
  private fromShipQuat = new THREE.Quaternion();
  private fromShipSize = SHIP_CRUISE_SIZE;
  private siteDir = new THREE.Vector3(0, -1, 0);
  private chaseDir = new THREE.Vector3();
  private focusPose: Pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private beamLevel = 0;
  private graticule!: THREE.LineSegments;

  constructor(assets: OrbitAssets) {
    this.moon = createMoonMaterial(assets.moonColor, assets.moonSlope);
    const globe = new THREE.SphereGeometry(1, 256, 128);
    // SphereGeometry puts the image centre (longitude 0) on +X. Turn it to +Z.
    globe.rotateY(-Math.PI / 2);
    this.scene.add(new THREE.Mesh(globe, this.moon.material));

    this.stars = createStars(STAR_RADIUS);
    this.sun = createSun();
    this.earth = createEarth(assets.earth);
    this.scene.add(this.stars.object, this.sun.object, this.earth.object, this.sunBeam, this.earthBeam);

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.0235, 72),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.4, 1.5, 0.5),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.scene.add(this.reticle);
    this.graticule = createGraticule();
    this.scene.add(this.graticule);

    this.rig = createShipRig(assets.ship, assets.hullEnv, 0);
    this.shipScene.add(this.rig.root, this.shipSun, this.moonFill, new THREE.AmbientLight(0x8fa0c0, 0.05));
  }

  /**
   * Sun and Earth directions in the Moon-fixed frame, with their angular radii
   * from the dataset. `sunVisible` and `earthVisible` are the published states
   * at the selected site: they switch the two beams drawn from the site.
   */
  setSky(
    sunDir: Vec3,
    earthDir: Vec3,
    sunRadiusDeg: number,
    earthRadiusDeg: number,
    timeS: number,
    sunVisible: boolean,
    earthVisible: boolean,
  ): void {
    this.sunDir.set(sunDir[0], sunDir[1], sunDir[2]);
    this.earthDir.set(earthDir[0], earthDir[1], earthDir[2]);
    this.moon.setSun(this.sunDir);
    // Lit part of Earth seen from the Moon: full when the Sun is behind the Moon.
    this.moon.setEarth(this.earthDir, (1 - this.sunDir.dot(this.earthDir)) / 2);
    this.sun.place(this.camera.position, this.sunDir, SUN_DISTANCE, sunRadiusDeg);
    this.earth.place(new THREE.Vector3(), this.earthDir, EARTH_DISTANCE, earthRadiusDeg);
    this.earth.setSun(this.sunDir);
    this.earth.spin(timeS * 0.02);
    this.shipSun.position.copy(this.sunDir).multiplyScalar(10);

    const base = this.siteDir.clone().multiplyScalar(1.002);
    const pulse = 0.8 + 0.2 * Math.sin(timeS * 3);
    for (const [mesh, dir, on] of [
      [this.sunBeam, this.sunDir, sunVisible],
      [this.earthBeam, this.earthDir, earthVisible],
    ] as const) {
      const level = this.beamLevel * (on ? 1 : 0);
      mesh.visible = level > 0.01;
      mesh.position.copy(base);
      mesh.quaternion.setFromUnitVectors(UP, dir);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * level * pulse;
    }
  }

  /** Slow approach to the south pole. p = 0 far, 1 near. */
  setCruise(p: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(p));
    const distance = mix(CRUISE_FAR, CRUISE_NEAR, e);
    const dir = toV3(latLonToUnit(CRUISE_LAT_DEG + Math.sin(timeS * 0.021) * 1.2, CRUISE_LON_DEG + Math.sin(timeS * 0.03) * 2.5));
    this.pose.position.copy(dir).multiplyScalar(distance);
    // Far away, look at the whole Moon. Closer, turn to the pole itself.
    const target = SOUTH_POLE.clone().multiplyScalar(0.35 * e + 0.62 * smoothstep(0.4, 1, e));
    this.pose.quaternion.copy(lookQuat(this.pose.position, target, UP));
    this.applyPose();
    this.parkShip(timeS, SHIP_CRUISE_SIZE, 1 - 0.25 * e);
    this.moon.setDetail(0);
    this.beamLevel = 0;
    this.setReticle(0, timeS);
    this.setGraticule(0.18 + 0.32 * e);
  }

  /** Remembers where the camera and the ship are, as the start of the next move. */
  private capture(): void {
    this.from = { position: this.pose.position.clone(), quaternion: this.pose.quaternion.clone() };
    this.fromShip.copy(this.rig.root.position);
    this.fromShipQuat.copy(this.rig.root.quaternion);
    this.fromShipSize = this.rig.root.scale.x * this.rig.height;
  }

  private setSite(site: Site): void {
    const basis = enuBasis(site.latDeg, site.lonDeg);
    this.siteDir = toV3(basis.up);
    const north = toV3(basis.north);
    // Stand on the south side of the site and look north across it: north stays at the top, as in the overview.
    const eye = this.siteDir.clone().multiplyScalar(1 + FOCUS_UP).addScaledVector(north, -FOCUS_BACK);
    this.focusPose = { position: eye, quaternion: lookQuat(eye, this.siteDir, this.siteDir) };
    this.chaseDir.copy(north).multiplyScalar(-1).addScaledVector(this.siteDir, 0.5).addScaledVector(toV3(basis.east), 0.55).normalize();
    this.reticle.position.copy(this.siteDir).multiplyScalar(1.003);
    this.reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.siteDir);
  }

  /** Starts the move to the site view. */
  beginFocus(site: Site): void {
    this.capture();
    this.setSite(site);
  }

  /** Site view: the camera glides above the site, the ship waits in the corner. k runs 0..1. */
  setFocus(k: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(k));
    this.pose.position.copy(toV3(arcPoint(toVec3(this.from.position), toVec3(this.focusPose.position), k)));
    this.pose.quaternion.copy(this.from.quaternion).slerp(this.focusPose.quaternion, e);
    this.applyPose();
    this.parkShip(timeS, mix(this.fromShipSize, SHIP_PARKED_SIZE, e), 0.75);
    this.moon.setDetail(0.55 * e);
    this.beamLevel = e;
    this.setReticle(e, timeS);
    this.setGraticule(0.5 - 0.2 * e);
  }

  /** Starts a flight to a site. Returns the angle the camera swings around the Moon, in radians. */
  beginFlight(site: Site): number {
    this.capture();
    this.setSite(site);
    return this.from.position.clone().normalize().angleTo(this.siteDir);
  }

  /** Camera station beside the ship, and the point it looks at (the middle of the ship). */
  private chase(shipBase: THREE.Vector3, distance: number): { position: THREE.Vector3; target: THREE.Vector3 } {
    const target = shipBase.clone().addScaledVector(this.siteDir, SHIP_ORBIT_SIZE * 0.5);
    return { position: target.clone().addScaledVector(this.chaseDir, distance), target };
  }

  /** Ship orientation for the descent: nose up, steel side toward the camera, a little heat shield in view. */
  private tailDown(shipPosition: THREE.Vector3, cameraPosition: THREE.Vector3): THREE.Quaternion {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, this.siteDir);
    const yaw = hullYaw(q, shipPosition, cameraPosition) + 0.55;
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  }

  /** Shot 1: the camera swings around the Moon behind the ship, which stays in frame all the way. */
  setTransfer(k: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(k));
    const site = this.siteDir;
    const hold = site.clone().multiplyScalar(HOLD_RADIUS);
    const end = this.chase(hold, CHASE_FAR);
    const endQuat = lookQuat(end.position, end.target, site);
    const from = toVec3(this.from.position);
    const to = toVec3(end.position);
    const cameraAt = (kk: number): THREE.Vector3 => toV3(arcPoint(from, to, kk));
    const quatAt = (kk: number): THREE.Quaternion => this.from.quaternion.clone().slerp(endQuat, easeInOutCubic(clamp01(kk)));

    // The ship flies ahead of the camera, on its line of sight, and ends at the hold point above the site.
    const lead0 = this.fromShip.distanceTo(this.from.position);
    const lead1 = end.position.distanceTo(end.target);
    const shipAt = (kk: number): THREE.Vector3 => {
      const c = clamp01(kk);
      const camera = cameraAt(c);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quatAt(c));
      const lead = mix(lead0, lead1, easeInOutCubic(c)) + 0.2 * Math.sin(Math.PI * c);
      const onAxis = camera.clone().addScaledVector(forward, lead).addScaledVector(site, -SHIP_ORBIT_SIZE * 0.5 * c);
      const carried = this.fromShip.clone().add(camera).sub(this.from.position);
      return carried.lerp(onAxis, smoothstep(0, 0.4, c));
    };
    const position = shipAt(k);
    const ahead = shipAt(k + 0.012).sub(shipAt(k - 0.012));
    const prograde = new THREE.Quaternion().setFromUnitVectors(UP, ahead.lengthSq() > 1e-12 ? ahead.normalize() : site);
    this.rig.root.position.copy(position);
    this.rig.root.quaternion
      .copy(this.fromShipQuat)
      .slerp(prograde, smoothstep(0, 0.25, k))
      .slerp(this.tailDown(hold, end.position), smoothstep(0.6, 0.97, k));
    this.rig.root.scale.setScalar(mix(this.fromShipSize, SHIP_ORBIT_SIZE, smoothstep(0, 0.7, k)) / this.rig.height);
    // A short burn to leave, then a coast.
    this.rig.setThrottle(smoothstep(0, 0.05, k) * (1 - smoothstep(0.2, 0.45, k)), timeS);

    this.pose.position.copy(cameraAt(k));
    this.pose.quaternion.copy(quatAt(k));
    this.applyPose();
    this.lightShip();
    this.setGraticule(0.3 * (1 - smoothstep(0, 0.5, k)));
    this.moon.setDetail(mix(0.55, 0.7, e));
    this.beamLevel = 1 - smoothstep(0.3, 0.8, k);
    this.setReticle(1, timeS);
  }

  /** Shot 2: tail first, engines on, the camera goes down with the ship. */
  setDescent(k: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(k));
    const site = this.siteDir;
    this.rig.root.position.copy(site).multiplyScalar(descentRadius(k));
    this.rig.root.scale.setScalar(SHIP_ORBIT_SIZE / this.rig.height);
    this.rig.setThrottle(smoothstep(0, 0.12, k), timeS);

    const station = this.chase(this.rig.root.position, mix(CHASE_FAR, CHASE_NEAR, e));
    this.pose.position.copy(station.position);
    this.pose.quaternion.copy(lookQuat(station.position, station.target, site));
    this.applyPose();
    this.rig.root.quaternion.copy(this.tailDown(this.rig.root.position, station.position));
    this.lightShip();
    this.setGraticule(0);
    this.moon.setDetail(mix(0.7, 1, e));
    this.beamLevel = 0;
    this.setReticle(1, timeS);
  }

  /** Screen positions of the sites that face the camera. */
  projectPins(sites: Site[], width: number, height: number): PinScreen[] {
    return sites.map((site) => ({ id: site.id, ...this.project(toV3(latLonToUnit(site.latDeg, site.lonDeg)).multiplyScalar(1.002), width, height, true) }));
  }

  /** Screen positions for the labels of the Sun and Earth beams at the selected site. */
  projectBeams(width: number, height: number): { sun: ScreenPoint; earth: ScreenPoint } {
    // A little over half-way along each beam, so the label stays inside the picture.
    const end = (dir: THREE.Vector3): THREE.Vector3 => this.siteDir.clone().multiplyScalar(1.002).addScaledVector(dir, BEAM_LENGTH * 0.55);
    return {
      sun: { ...this.project(end(this.sunDir), width, height, false), visible: this.sunBeam.visible },
      earth: { ...this.project(end(this.earthDir), width, height, false), visible: this.earthBeam.visible },
    };
  }

  private project(point: THREE.Vector3, width: number, height: number, onSurface: boolean): ScreenPoint {
    const facing = !onSurface || this.camera.position.clone().sub(point).normalize().dot(point) > 0.06;
    const p = point.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * width,
      y: (-p.y * 0.5 + 0.5) * height,
      visible: facing && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05,
    };
  }

  private applyPose(): void {
    this.camera.position.copy(this.pose.position);
    this.camera.quaternion.copy(this.pose.quaternion);
    this.camera.updateMatrixWorld();
    this.stars.object.position.copy(this.camera.position);
  }

  /** Ship fixed in the camera frame: low, left of centre, clear of the side panels, nose toward the Moon. */
  private parkShip(timeS: number, size: number, spread: number): void {
    const cam = this.camera;
    const wide = smoothstep(0.75, 1.5, cam.aspect);
    const local = new THREE.Vector3(mix(-0.03, -0.074, wide) * spread, mix(-0.075, -0.07, wide), mix(-0.44, -0.34, wide));
    local.y += Math.sin(timeS * 0.5) * 0.0025;
    this.rig.root.position.copy(local).applyMatrix4(cam.matrixWorld);
    const nose = new THREE.Vector3(0.74, 0.5, -0.62).normalize().transformDirection(cam.matrixWorld);
    this.rig.root.quaternion.setFromUnitVectors(UP, nose);
    this.rig.root.rotateY(hullYaw(this.rig.root.quaternion, this.rig.root.position, cam.position) + 0.5 + Math.sin(timeS * 0.11) * 0.3);
    this.rig.root.scale.setScalar(size / this.rig.height);
    this.rig.setThrottle(0, timeS);
    this.lightShip();
  }

  /** Light that the sunlit Moon sends back to the ship. */
  private lightShip(): void {
    const toShip = this.rig.root.position.clone().normalize();
    this.moonFill.position.copy(toShip).multiplyScalar(-10);
    this.moonFill.intensity = 0.55 * clamp01(0.5 + 0.5 * this.sunDir.dot(toShip));
  }

  /** Polar grid: latitude rings and meridians, for orientation. Faint, off during the descent. */
  private setGraticule(level: number): void {
    (this.graticule.material as THREE.LineBasicMaterial).opacity = level;
    this.graticule.visible = level > 0.01;
  }

  private setReticle(level: number, timeS: number): void {
    const material = this.reticle.material as THREE.MeshBasicMaterial;
    material.opacity = level * (0.75 + 0.25 * Math.sin(timeS * 4));
    this.reticle.visible = level > 0.001;
    this.reticle.scale.setScalar(1 + 0.12 * Math.sin(timeS * 2));
  }
}
