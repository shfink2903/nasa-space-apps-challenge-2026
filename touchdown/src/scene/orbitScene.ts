import * as THREE from "three";
import { DEG, enuBasis, latLonToUnit, type Vec3 } from "../data/astro";
import type { Site } from "../data/dataset";
import { arcPoint, clamp01, descentRadius, easeInOutCubic, HOLD_RADIUS, mix, smoothstep } from "../flight/timeline";
import { createMoonMaterial, type MoonMaterial } from "./moonMaterial";
import { createShipRig, hullYaw, type ShipRig } from "./ship";
import { createEarth, createStars, createSun, type Earth, type SkyBody, type Stars } from "./sky";

const toV3 = (a: Vec3): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
const UP = new THREE.Vector3(0, 1, 0);

/** Scene distances are in Moon radii. Ship size here is for the picture only. */
const SHIP_CRUISE_SIZE = 0.1;
const SHIP_ORBIT_SIZE = 0.03;
const CHASE_FAR = 0.2;
const CHASE_NEAR = 0.082;
const CRUISE_FAR = 9.6;
const CRUISE_NEAR = 4.3;
/** Cruise camera: over the southern hemisphere, so the south pole faces the viewer. */
const CRUISE_LAT_DEG = -44;
const CRUISE_LON_DEG = 10;
/** Focus view: the camera stands above the site, but never straight over a pole. */
const FOCUS_DISTANCE = 2.85;
const FOCUS_MAX_LAT_DEG = 56;
const BLEND_SECONDS = 1.7;
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

export interface PinScreen {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * Far view: the georeferenced Moon, Sun, Earth and stars, with the ship drawn
 * in its own overlay scene (same camera, fresh depth buffer).
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
  private readonly sunDir = new THREE.Vector3(1, 0.1, 0.4).normalize();
  /** Pose wanted by the current shot. `applied` is what the camera really has (after a blend). */
  private readonly pose: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: UP.clone() };
  private readonly applied: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: UP.clone() };
  private blendFrom: Pose | null = null;
  private blendK = 1;
  private focusSite: Site | null = null;
  /** 0 = ship at its cruise place, 1 = ship small, beside the selected site. Eased every frame. */
  private shipFocus = 0;

  // Flight: captured at the click, then interpolated.
  private from: Pose = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: UP.clone() };
  private fromShip = new THREE.Vector3();
  private fromShipQuat = new THREE.Quaternion();
  private fromShipSize = SHIP_CRUISE_SIZE;
  private siteDir = new THREE.Vector3(0, 0, 1);
  private chaseDir = new THREE.Vector3();

  constructor(assets: OrbitAssets) {
    this.moon = createMoonMaterial(assets.moonColor, assets.moonSlope);
    const globe = new THREE.SphereGeometry(1, 256, 128);
    // SphereGeometry puts the image centre (longitude 0) on +X. Turn it to +Z.
    globe.rotateY(-Math.PI / 2);
    this.scene.add(new THREE.Mesh(globe, this.moon.material));

    this.stars = createStars(STAR_RADIUS);
    this.sun = createSun();
    this.earth = createEarth(assets.earth);
    this.scene.add(this.stars.object, this.sun.object, this.earth.object);

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

    this.rig = createShipRig(assets.ship, assets.hullEnv, 0);
    this.shipScene.add(this.rig.root, this.shipSun, this.moonFill, new THREE.AmbientLight(0x8fa0c0, 0.05));
  }

  /** Sun and Earth directions in the Moon-fixed frame, with their angular radii from the dataset. */
  setSky(sunDir: Vec3, earthDir: Vec3, sunRadiusDeg: number, earthRadiusDeg: number, timeS: number): void {
    this.sunDir.set(sunDir[0], sunDir[1], sunDir[2]);
    const earth = toV3(earthDir);
    this.moon.setSun(this.sunDir);
    // Lit part of Earth seen from the Moon: full when the Sun is behind the Moon.
    this.moon.setEarth(earth, (1 - this.sunDir.dot(earth)) / 2);
    this.sun.place(this.camera.position, this.sunDir, SUN_DISTANCE, sunRadiusDeg);
    this.earth.place(new THREE.Vector3(), earth, EARTH_DISTANCE, earthRadiusDeg);
    this.earth.setSun(this.sunDir);
    this.earth.spin(timeS * 0.02);
    this.shipSun.position.copy(this.sunDir).multiplyScalar(10);
  }

  /** Slow approach. p = 0 far, 1 near. */
  setCruise(p: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(p));
    const aspect = this.camera.aspect;
    const wide = smoothstep(0.75, 1.5, aspect);
    const distance = mix(CRUISE_FAR, CRUISE_NEAR, e);
    const drift = Math.sin(timeS * 0.03) * 2.5;
    const dir = toV3(latLonToUnit(CRUISE_LAT_DEG + Math.sin(timeS * 0.021) * 1.2, CRUISE_LON_DEG + drift));
    this.pose.position.copy(dir).multiplyScalar(distance);

    // Aim beside the Moon so it sits right of centre and a little high, as in the sketch.
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    this.pose.target
      .set(0, 0, 0)
      .addScaledVector(right, -distance * Math.tan(4.6 * DEG) * wide)
      // Narrow screens: the panels fill the lower half, so the Moon is shown in the upper part.
      .addScaledVector(up, -distance * Math.tan(mix(9, 2.2, wide) * DEG));
    this.pose.up.copy(UP);
    this.applyPose();
    this.placeCruiseShip(e, timeS, 0);
    this.moon.setDetail(0);
    this.setReticle(0, timeS);
  }

  /** Starts a smooth camera move from the current view to the next shot (cruise or focus). */
  startBlend(): void {
    this.blendFrom = { position: this.applied.position.clone(), target: this.applied.target.clone(), up: this.applied.up.clone() };
    this.blendK = 0;
  }

  advanceBlend(dt: number): void {
    if (this.blendK < 1) this.blendK = Math.min(1, this.blendK + dt / BLEND_SECONDS);
  }

  /** Aims the focus view at a site. `snap` skips the camera move (used behind a fade). */
  beginFocus(site: Site, snap: boolean): void {
    this.focusSite = site;
    this.siteDir = toV3(latLonToUnit(site.latDeg, site.lonDeg));
    this.reticle.position.copy(this.siteDir).multiplyScalar(1.003);
    this.reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.siteDir);
    if (snap) {
      this.blendFrom = null;
      this.blendK = 1;
    } else this.startBlend();
  }

  /** Zoomed view of the selected site, with the site in the middle of the free part of the screen. */
  setFocus(timeS: number): void {
    const site = this.focusSite;
    if (!site) return;
    const lat = THREE.MathUtils.clamp(site.latDeg, -FOCUS_MAX_LAT_DEG, FOCUS_MAX_LAT_DEG);
    const dir = toV3(latLonToUnit(lat, site.lonDeg + Math.sin(timeS * 0.05) * 1.5));
    this.pose.position.copy(dir).multiplyScalar(FOCUS_DISTANCE);
    this.pose.target.copy(this.siteDir).multiplyScalar(0.94);
    // Narrow screens: the panels cover the lower part, so the site is shown higher.
    const narrow = 1 - smoothstep(0.75, 1.5, this.camera.aspect);
    const screenUp = UP.clone().addScaledVector(dir, -UP.dot(dir)).normalize();
    this.pose.target.addScaledVector(screenUp, -FOCUS_DISTANCE * Math.tan(9 * DEG) * narrow);
    this.pose.up.copy(UP);
    this.applyPose();
    this.placeCruiseShip(1, timeS, 1);
    this.moon.setDetail(0.25 * this.blendK);
    this.setReticle(this.blendK, timeS);
  }

  /** Ship fixed in the camera frame, bottom-left, nose toward the Moon. e = 0 far, 1 near. */
  private placeCruiseShip(e: number, timeS: number, focus: number): void {
    this.shipFocus += (focus - this.shipFocus) * 0.07;
    const f = this.shipFocus;
    const wide = smoothstep(0.75, 1.5, this.camera.aspect);
    const cam = this.camera;
    // Wide screens: upper left, above the title of the overview. Narrow screens: lower left.
    const local = new THREE.Vector3(mix(-0.045, -0.1, wide) + 0.02 * e, mix(-0.07, 0.05, wide) + 0.012 * e, mix(-0.42, -0.34, wide) - 0.1 * e);
    // Focus: up and to the right of the site, clear of the panels and of the caption.
    local.lerp(new THREE.Vector3(mix(0.02, 0.062, wide), 0.045, -0.44), f);
    local.y += Math.sin(timeS * 0.5) * 0.0025;
    this.rig.root.position.copy(local).applyMatrix4(cam.matrixWorld);
    const nose = new THREE.Vector3(0.74, 0.5, -0.62).normalize().transformDirection(cam.matrixWorld);
    this.rig.root.quaternion.setFromUnitVectors(UP, nose);
    this.rig.root.rotateY(hullYaw(this.rig.root.quaternion, this.rig.root.position, cam.position) + 0.5 + Math.sin(timeS * 0.11) * 0.3);
    this.rig.root.scale.setScalar((SHIP_CRUISE_SIZE * mix(1, 0.42, f)) / this.rig.height);
    this.rig.setThrottle(0, timeS);
    this.lightShip();
  }

  /** Stores the start of a flight and the chase-camera side for the site. Returns the swing angle in radians. */
  beginFlight(site: Site): number {
    this.from = { position: this.applied.position.clone(), target: this.applied.target.clone(), up: this.applied.up.clone() };
    this.blendFrom = null;
    this.blendK = 1;
    this.fromShip.copy(this.rig.root.position);
    this.fromShipQuat.copy(this.rig.root.quaternion);
    this.fromShipSize = SHIP_CRUISE_SIZE * mix(1, 0.42, this.shipFocus);

    const basis = enuBasis(site.latDeg, site.lonDeg);
    this.siteDir = toV3(basis.up);
    // The chase camera flies beside the ship, on the equator side and a little above it.
    const side = toV3(basis.north).multiplyScalar(site.latDeg > 0 ? -1 : 1);
    this.chaseDir.copy(side).addScaledVector(this.siteDir, 0.5).addScaledVector(toV3(basis.east), 0.55).normalize();
    this.reticle.position.copy(this.siteDir).multiplyScalar(1.003);
    this.reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.siteDir);
    return this.from.position.clone().normalize().angleTo(this.siteDir);
  }

  /** Ship orientation for the descent: nose up, steel side toward the camera, a little heat shield in view. */
  private tailDown(shipPosition: THREE.Vector3, cameraPosition: THREE.Vector3): THREE.Quaternion {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, this.siteDir);
    const yaw = hullYaw(q, shipPosition, cameraPosition) + 0.55;
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  }

  /** Camera station beside the ship, and the point it looks at (the middle of the ship). */
  private chase(shipBase: THREE.Vector3, distance: number): { position: THREE.Vector3; target: THREE.Vector3 } {
    const target = shipBase.clone().addScaledVector(this.siteDir, SHIP_ORBIT_SIZE * 0.5);
    return { position: target.clone().addScaledVector(this.chaseDir, distance), target };
  }

  /** Shot 1: the camera swings around the Moon behind the ship, which stays in frame all the way. */
  setTransfer(k: number, timeS: number): void {
    const e = easeInOutCubic(clamp01(k));
    const site = this.siteDir;
    const hold = site.clone().multiplyScalar(HOLD_RADIUS);
    const end = this.chase(hold, CHASE_FAR);
    const from: Vec3 = [this.from.position.x, this.from.position.y, this.from.position.z];
    const to: Vec3 = [end.position.x, end.position.y, end.position.z];
    const cameraAt = (kk: number): THREE.Vector3 => toV3(arcPoint(from, to, kk));

    // The ship flies ahead of the camera, on the line to the hold point above the site.
    const lead0 = this.fromShip.distanceTo(this.from.position);
    const lead1 = end.position.distanceTo(hold);
    const shipAt = (kk: number): THREE.Vector3 => {
      const c = clamp01(kk);
      const camera = cameraAt(c);
      const toHold = hold.clone().sub(camera);
      const lead = Math.min(toHold.length(), mix(lead0, lead1, easeInOutCubic(c)) + 0.2 * Math.sin(Math.PI * c));
      const onLine = camera.clone().addScaledVector(toHold.normalize(), lead);
      const carried = this.fromShip.clone().add(camera).sub(this.from.position);
      return carried.lerp(onLine, smoothstep(0, 0.4, c));
    };
    const position = shipAt(k);
    const ahead = shipAt(k + 0.012).sub(shipAt(k - 0.012));
    const prograde = new THREE.Quaternion().setFromUnitVectors(UP, ahead.lengthSq() > 1e-12 ? ahead.normalize() : site);
    const tailDown = this.tailDown(hold, end.position);
    this.rig.root.position.copy(position);
    this.rig.root.quaternion
      .copy(this.fromShipQuat)
      .slerp(prograde, smoothstep(0, 0.25, k))
      .slerp(tailDown, smoothstep(0.6, 0.97, k));
    this.rig.root.scale.setScalar(mix(this.fromShipSize, SHIP_ORBIT_SIZE, smoothstep(0, 0.7, k)) / this.rig.height);
    // A short burn to leave, then a coast.
    this.rig.setThrottle(smoothstep(0, 0.05, k) * (1 - smoothstep(0.2, 0.45, k)), timeS);

    this.pose.position.copy(cameraAt(k));
    // Look at the hold point: the ship is on that line, with the Moon behind it.
    this.pose.target.lerpVectors(this.from.target, end.target, smoothstep(0, 0.6, k));
    const upTurn = new THREE.Quaternion().setFromUnitVectors(this.from.up, site);
    this.pose.up.copy(this.from.up).applyQuaternion(new THREE.Quaternion().slerp(upTurn, e));
    this.applyPose();

    this.lightShip();
    this.moon.setDetail(smoothstep(0.5, 1, e) * 0.6);
    this.setReticle(smoothstep(0.1, 0.5, k), timeS);
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
    this.pose.target.copy(station.target);
    this.pose.up.copy(site);
    this.applyPose();
    this.rig.root.quaternion.copy(this.tailDown(this.rig.root.position, station.position));
    this.lightShip();
    this.moon.setDetail(mix(0.6, 1, e));
    this.setReticle(1, timeS);
  }

  /** Lunar coordinates under a screen point (x, y in -1..1), or null when the point is off the Moon. */
  pick(ndcX: number, ndcY: number): { latDeg: number; lonDeg: number } | null {
    const origin = this.camera.position;
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera).sub(origin).normalize();
    // Ray against the unit sphere at the centre: nearest crossing.
    const b = origin.dot(dir);
    const disc = b * b - (origin.lengthSq() - 1);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    const p = origin.clone().addScaledVector(dir, t);
    return { latDeg: Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) / DEG, lonDeg: Math.atan2(p.x, p.z) / DEG };
  }

  /** Screen positions of the sites that face the camera. */
  projectPins(sites: Site[], width: number, height: number): PinScreen[] {
    const p = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    return sites.map((site) => {
      const dir = latLonToUnit(site.latDeg, site.lonDeg);
      p.set(dir[0], dir[1], dir[2]).multiplyScalar(1.002);
      toCamera.copy(this.camera.position).sub(p).normalize();
      const facing = toCamera.dot(p) > 0.06;
      p.project(this.camera);
      return {
        id: site.id,
        x: (p.x * 0.5 + 0.5) * width,
        y: (-p.y * 0.5 + 0.5) * height,
        visible: facing && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05,
      };
    });
  }

  private applyPose(): void {
    const from = this.blendFrom;
    if (from && this.blendK < 1) {
      // Turn around the Moon on a great circle: the camera never cuts through the globe.
      const a: Vec3 = [from.position.x, from.position.y, from.position.z];
      const b: Vec3 = [this.pose.position.x, this.pose.position.y, this.pose.position.z];
      const e = easeInOutCubic(this.blendK);
      this.applied.position.copy(toV3(arcPoint(a, b, this.blendK)));
      this.applied.target.lerpVectors(from.target, this.pose.target, e);
      this.applied.up.lerpVectors(from.up, this.pose.up, e).normalize();
    } else {
      this.applied.position.copy(this.pose.position);
      this.applied.target.copy(this.pose.target);
      this.applied.up.copy(this.pose.up);
    }
    this.camera.position.copy(this.applied.position);
    this.camera.up.copy(this.applied.up);
    this.camera.lookAt(this.applied.target);
    this.camera.updateMatrixWorld();
    this.stars.object.position.copy(this.camera.position);
  }

  /** Light that the sunlit Moon sends back to the ship. */
  private lightShip(): void {
    const toShip = this.rig.root.position.clone().normalize();
    this.moonFill.position.copy(toShip).multiplyScalar(-10);
    this.moonFill.intensity = 0.55 * clamp01(0.5 + 0.5 * this.sunDir.dot(toShip));
  }

  private setReticle(level: number, timeS: number): void {
    const material = this.reticle.material as THREE.MeshBasicMaterial;
    material.opacity = level * (0.75 + 0.25 * Math.sin(timeS * 4));
    this.reticle.visible = level > 0.001;
    this.reticle.scale.setScalar(1 + 0.12 * Math.sin(timeS * 2));
  }
}
