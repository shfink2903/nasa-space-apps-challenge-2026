import { azElToMoonFixed } from "../data/astro";
import type { HorizonProfile, Sample, Site } from "../data/dataset";
import { clamp01, DESCENT_SECONDS, FINAL_SECONDS, smoothstep, transferSeconds, type Phase } from "../flight/timeline";
import type { OrbitScene } from "./orbitScene";
import type { Stage } from "./renderer";
import type { SurfaceScene } from "./surfaceScene";

export interface SurfaceData {
  horizon: HorizonProfile | null;
}

interface Fade {
  t: number;
  done: boolean;
  /** Runs once, when the screen is fully covered. Returns false to wait one more frame. */
  atPeak: () => boolean;
}

const FADE_IN_S = 0.4;
const FADE_OUT_S = 0.7;
const APPROACH_SECONDS = 150;
/** The descent holds here until the site data is loaded. */
const DESCENT_HOLD_K = 0.9;

/**
 * Runs the shots: cruise, transfer, descent, the cut to the ground camera,
 * final descent, then the free surface view.
 */
export class Director {
  phase: Phase = "cruise";
  private t = 0;
  private progress = 0;
  private transferS = 6;
  private site: Site | null = null;
  private data: SurfaceData | null = null;
  private flight = 0;
  private fade: Fade | null = null;
  private skipAsked = false;
  private exposure = 1.05;

  constructor(
    private readonly stage: Stage,
    private readonly orbit: OrbitScene,
    private readonly surface: SurfaceScene,
    private readonly veil: HTMLElement,
    private readonly onPhase: (phase: Phase) => void,
  ) {
    this.stage.show(orbit.scene, orbit.camera, orbit.shipScene);
  }

  /** Manual approach during the cruise (wheel or drag). */
  approach(delta: number): void {
    if (this.phase === "cruise") this.progress = clamp01(this.progress + delta);
  }

  /** Zooms the orbit view on a site. No flight: the ship stays beside the camera. */
  focus(site: Site): void {
    this.flight++;
    this.skipAsked = false;
    this.data = null;
    if (this.phase === "cruise" || this.phase === "focus") {
      this.site = site;
      this.orbit.beginFocus(site, false);
      this.setPhase("focus");
      return;
    }
    this.fade = {
      t: 0,
      done: false,
      atPeak: () => {
        this.surface.leave();
        this.stage.show(this.orbit.scene, this.orbit.camera, this.orbit.shipScene);
        this.site = site;
        this.orbit.beginFocus(site, true);
        this.setPhase("focus");
        return true;
      },
    };
  }

  /** Starts the flight to a site. `data` resolves when the site's series is the active one. */
  startFlight(site: Site, data: Promise<SurfaceData>, instant: boolean): void {
    const flight = ++this.flight;
    this.data = null;
    this.skipAsked = instant;
    data.then(
      (d) => {
        if (flight === this.flight) this.data = d;
      },
      () => undefined, // the caller reports the error and calls back()
    );
    const begin = (): boolean => {
      this.surface.leave();
      this.stage.show(this.orbit.scene, this.orbit.camera, this.orbit.shipScene);
      this.site = site;
      this.transferS = transferSeconds(this.orbit.beginFlight(site));
      this.setPhase("transfer");
      return true;
    };
    if (this.phase === "final" || this.phase === "surface") this.fade = { t: 0, done: false, atPeak: begin };
    else begin();
  }

  /** Jumps to the landed view. */
  skip(): void {
    if (this.phase === "transfer" || this.phase === "descent" || this.phase === "final") this.skipAsked = true;
  }

  /** Returns to the cruise view. */
  back(): void {
    this.flight++;
    this.skipAsked = false;
    if (this.phase === "cruise") return;
    if (this.phase === "focus") {
      this.orbit.startBlend();
      this.site = null;
      this.setPhase("cruise");
      return;
    }
    this.fade = {
      t: 0,
      done: false,
      atPeak: () => {
        this.surface.leave();
        this.stage.show(this.orbit.scene, this.orbit.camera, this.orbit.shipScene);
        this.site = null;
        this.setPhase("cruise");
        return true;
      },
    };
  }

  /** dt drives the animation. realDt is the true frame time, used to keep the frame rate up. */
  update(dt: number, timeS: number, sample: Sample, lightSite: Site, realDt = dt): void {
    let veilAlpha = 0;
    let veilWhite = false;

    if (this.skipAsked && !this.fade && this.site && this.data && lightSite.id === this.site.id) {
      this.skipAsked = false;
      const site = this.site;
      const data = this.data;
      this.fade = {
        t: 0,
        done: false,
        atPeak: () => {
          this.surface.prepare(site, data.horizon, sample);
          this.surface.snapLanded();
          this.stage.show(this.surface.scene, this.surface.camera, null);
          this.surface.enterLanded();
          this.setPhase("surface");
          return true;
        },
      };
    }

    const inOrbit = this.phase === "cruise" || this.phase === "focus" || this.phase === "transfer" || this.phase === "descent";
    this.orbit.advanceBlend(dt);
    if (inOrbit) {
      this.orbit.setSky(
        azElToMoonFixed(sample.sunAzDeg, sample.sunElDeg, lightSite.latDeg, lightSite.lonDeg),
        azElToMoonFixed(sample.earthAzDeg, sample.earthElDeg, lightSite.latDeg, lightSite.lonDeg),
        sample.sunRadiusDeg,
        sample.earthRadiusDeg,
        timeS,
      );
    }

    switch (this.phase) {
      case "cruise":
        this.progress = clamp01(this.progress + dt / APPROACH_SECONDS);
        this.orbit.setCruise(this.progress, timeS);
        break;
      case "focus":
        this.orbit.setFocus(timeS);
        break;
      case "transfer": {
        this.t += dt;
        const k = clamp01(this.t / this.transferS);
        this.orbit.setTransfer(k, timeS);
        if (k >= 1) this.setPhase("descent");
        break;
      }
      case "descent": {
        const ready = this.site !== null && this.data !== null && lightSite.id === this.site.id;
        this.t += dt;
        let k = clamp01(this.t / DESCENT_SECONDS);
        if (!ready && k > DESCENT_HOLD_K) {
          k = DESCENT_HOLD_K;
          this.t = k * DESCENT_SECONDS;
        }
        this.orbit.setDescent(k, timeS);
        veilAlpha = smoothstep(0.9, 1, k);
        veilWhite = true;
        if (k >= 1 && ready) {
          // The screen is white with engine glare: build the ground and cut to it.
          this.surface.prepare(this.site!, this.data!.horizon, sample);
          this.stage.show(this.surface.scene, this.surface.camera, null);
          this.setPhase("final");
        }
        break;
      }
      case "final": {
        this.t += dt;
        const k = clamp01(this.t / FINAL_SECONDS);
        this.surface.setFinal(k, timeS, dt);
        this.surface.setSky(sample, timeS);
        veilAlpha = 1 - smoothstep(0, 0.085, k);
        veilWhite = true;
        if (k >= 1) {
          this.surface.enterLanded();
          this.setPhase("surface");
        }
        break;
      }
      case "surface":
        this.surface.setLanded(timeS, dt);
        this.surface.setSky(sample, timeS);
        break;
    }

    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (!f.done && f.t >= FADE_IN_S) {
        f.done = f.atPeak();
        if (f.done) f.t = FADE_IN_S;
      }
      const alpha = f.done ? 1 - clamp01((f.t - FADE_IN_S) / FADE_OUT_S) : clamp01(f.t / FADE_IN_S);
      if (alpha >= veilAlpha) {
        veilAlpha = alpha;
        veilWhite = false;
      }
      if (f.done && f.t >= FADE_IN_S + FADE_OUT_S) this.fade = null;
    }

    this.veil.style.opacity = veilAlpha.toFixed(3);
    this.veil.classList.toggle("is-flash", veilWhite);

    const onGround = this.phase === "final" || this.phase === "surface";
    const wanted = onGround ? this.surface.exposure : 1.05;
    this.exposure += (wanted - this.exposure) * Math.min(1, dt * 2.5);
    this.stage.renderer.toneMappingExposure = this.exposure;
    this.stage.render(timeS, realDt);
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
    this.onPhase(phase);
  }
}
