import { azElToMoonFixed } from "../data/astro";
import type { HorizonProfile, Sample, Site } from "../data/dataset";
import { clamp01, DESCENT_SECONDS, FINAL_SECONDS, smoothstep, transferSeconds, type Phase } from "../flight/timeline";
import type { OrbitScene } from "./orbitScene";
import type { Stage } from "./renderer";
import type { SurfaceScene } from "./surfaceScene";

interface Fade {
  t: number;
  done: boolean;
  /** Runs once, when the screen is fully covered. */
  atPeak: () => void;
}

const FADE_IN_S = 0.3;
const FADE_OUT_S = 0.55;
const APPROACH_SECONDS = 150;
const FOCUS_SECONDS = 1.5;

/**
 * Runs the views and the shots:
 * cruise (whole south pole) -> focus (one site, from orbit) -> transfer ->
 * descent -> cut to the ground camera -> final -> surface.
 */
export class Director {
  phase: Phase = "cruise";
  private t = 0;
  private progress = 0;
  private transferS = 6;
  private horizon: HorizonProfile | null = null;
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

  /** Shows a site from orbit. From the overview or another site the camera glides; from a flight it cuts. */
  focus(site: Site): void {
    this.skipAsked = false;
    if (this.phase === "cruise" || this.phase === "focus") {
      this.orbit.beginFocus(site);
      this.setPhase("focus");
      return;
    }
    this.cut(() => {
      this.showOrbit();
      this.orbit.beginFocus(site);
      this.setPhase("focus");
      this.t = FOCUS_SECONDS;
    });
  }

  /** Back to the whole south pole. */
  overview(): void {
    this.skipAsked = false;
    if (this.phase === "cruise") return;
    this.cut(() => {
      this.showOrbit();
      this.setPhase("cruise");
    });
  }

  /** Starts the illustrative landing on a site. `horizon` is its terrain profile, or null. */
  startFlight(site: Site, horizon: HorizonProfile | null, instant: boolean): void {
    this.horizon = horizon;
    this.skipAsked = instant;
    const begin = (): void => {
      this.showOrbit();
      this.transferS = transferSeconds(this.orbit.beginFlight(site));
      this.setPhase("transfer");
    };
    if (this.phase === "final" || this.phase === "surface") this.cut(begin);
    else begin();
  }

  /** Jumps to the landed view. */
  skip(): void {
    if (this.phase === "transfer" || this.phase === "descent" || this.phase === "final") this.skipAsked = true;
  }

  /** The terrain profile changed (other mast height or model) while the ship is on the ground. */
  setHorizon(horizon: HorizonProfile | null): void {
    this.horizon = horizon;
    if (this.phase === "final" || this.phase === "surface") this.surface.setHorizon(horizon);
  }

  /**
   * One frame. `site` is the selected site and `sample` its Sun and Earth at the chosen time.
   * dt drives the animation. realDt is the true frame time, used to keep the frame rate up.
   */
  update(dt: number, timeS: number, sample: Sample, site: Site, realDt = dt): void {
    let veilAlpha = 0;
    let veilWhite = false;

    if (this.skipAsked && !this.fade) {
      this.skipAsked = false;
      this.cut(() => {
        this.surface.prepare(site, this.horizon, sample);
        this.surface.snapLanded();
        this.stage.show(this.surface.scene, this.surface.camera, null);
        this.surface.enterLanded();
        this.setPhase("surface");
      });
    }

    const inOrbit = this.phase !== "final" && this.phase !== "surface";
    if (inOrbit) {
      this.orbit.setSky(
        azElToMoonFixed(sample.sunAzDeg, sample.sunElDeg, site.latDeg, site.lonDeg),
        azElToMoonFixed(sample.earthAzDeg, sample.earthElDeg, site.latDeg, site.lonDeg),
        sample.sunRadiusDeg,
        sample.earthRadiusDeg,
        timeS,
        (sample.sunState ?? 0) > 0,
        (sample.earthState ?? 0) > 0,
      );
    }

    switch (this.phase) {
      case "cruise":
        this.progress = clamp01(this.progress + dt / APPROACH_SECONDS);
        this.orbit.setCruise(this.progress, timeS);
        break;
      case "focus":
        this.t += dt;
        this.orbit.setFocus(clamp01(this.t / FOCUS_SECONDS), timeS);
        break;
      case "transfer": {
        this.t += dt;
        const k = clamp01(this.t / this.transferS);
        this.orbit.setTransfer(k, timeS);
        if (k >= 1) this.setPhase("descent");
        break;
      }
      case "descent": {
        this.t += dt;
        const k = clamp01(this.t / DESCENT_SECONDS);
        this.orbit.setDescent(k, timeS);
        veilAlpha = smoothstep(0.95, 1, k);
        veilWhite = true;
        if (k >= 1) {
          // The screen is white with engine glare: build the ground and cut to it.
          this.surface.prepare(site, this.horizon, sample);
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
        veilAlpha = 1 - smoothstep(0, 0.05, k);
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
      f.t += Math.max(dt, Math.min(realDt, 0.05)); // fades also run when the flight is paused
      if (!f.done && f.t >= FADE_IN_S) {
        f.atPeak();
        f.done = true;
        f.t = FADE_IN_S;
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

  /** Short fade to black, then `atPeak`, then fade back in. */
  private cut(atPeak: () => void): void {
    this.fade = { t: 0, done: false, atPeak };
  }

  private showOrbit(): void {
    this.surface.leave();
    this.stage.show(this.orbit.scene, this.orbit.camera, this.orbit.shipScene);
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
    this.onPhase(phase);
  }
}
