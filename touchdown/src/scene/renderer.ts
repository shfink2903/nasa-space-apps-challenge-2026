import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Vignette and film grain, applied in linear light before tone mapping. */
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.07 }, uVignette: { value: 0.55 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette; varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.95, 0.25, length(q * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0, v, uVignette);
      float n = hash(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5;
      c.rgb *= 1.0 + n * uGrain;
      c.rgb += n * 0.0025;
      gl_FragColor = max(c, 0.0);
    }`,
};

/**
 * Owns the WebGL renderer and the post-processing chain.
 * A scene can have an overlay scene drawn on top with a fresh depth buffer
 * (used for the ship in the orbit view, which lives at a very different scale).
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly main: RenderPass;
  private readonly overlay: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly film: ShaderPass;
  private camera: THREE.PerspectiveCamera;
  private slowFrames = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 1);

    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    const empty = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.main = new RenderPass(empty, this.camera);
    this.overlay = new RenderPass(empty, this.camera);
    this.overlay.clear = false;
    this.overlay.clearDepth = true;
    this.overlay.enabled = false;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.38, 0.6, 1.6);
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.main);
    this.composer.addPass(this.overlay);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.film);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  get maxTextureSize(): number {
    return this.renderer.capabilities.maxTextureSize;
  }

  show(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: THREE.Scene | null): void {
    this.camera = camera;
    this.main.scene = scene;
    this.main.camera = camera;
    this.overlay.enabled = overlay !== null;
    if (overlay) {
      this.overlay.scene = overlay;
      this.overlay.camera = camera;
    }
    this.resize();
  }

  /** Returns true when the drawing size changed. */
  resize(): boolean {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    const changed = size.x !== w || size.y !== h;
    if (changed) {
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    const aspect = w / h;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    return changed;
  }

  /**
   * Keeps the motion smooth on slower graphics cards: after one second of frames
   * slower than 24 per second, the drawing resolution goes down one step. It never goes below 1.
   */
  private adapt(dt: number): void {
    // One long frame (for example after the tab was hidden) counts for 0.1 s at most.
    this.slowFrames = dt > 1 / 24 ? this.slowFrames + Math.min(dt, 0.1) : Math.max(0, this.slowFrames - dt * 2);
    const ratio = this.renderer.getPixelRatio();
    if (this.slowFrames < 1 || ratio <= 1) return;
    this.slowFrames = 0;
    const next = Math.max(1, ratio - 0.25);
    this.renderer.setPixelRatio(next);
    this.composer.setPixelRatio(next);
    this.composer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  render(timeS: number, dt = 0): void {
    this.adapt(dt);
    this.resize();
    this.film.uniforms.uTime.value = timeS;
    this.composer.render();
  }
}
