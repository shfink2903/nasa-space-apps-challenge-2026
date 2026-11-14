import * as THREE from "three";

export interface MoonMaterial {
  material: THREE.ShaderMaterial;
  setSun(direction: THREE.Vector3): void;
  /** direction to Earth and its lit fraction seen from the Moon (0..1). */
  setEarth(direction: THREE.Vector3, litFraction: number): void;
  /** 0 = far view, 1 = close view with extra fine detail. */
  setDetail(x: number): void;
}

const SLOPE_GAIN = 2.5; // must match scripts/prepare-assets.mjs

const vertexShader = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uColor, uSlope;
  uniform vec3 uSunDir, uEarthDir;
  uniform float uEarthshine, uDetail, uRelief, uSunPower;
  varying vec2 vUv; varying vec3 vPos;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  // Small craters: one bowl with a raised rim per cell. p is in cell units.
  // Returns the slope vector of the height field. The slope is computed
  // directly, not from height differences, so one pass is enough. It has no
  // unit, so it is the same in world units.
  vec3 craters(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 slope = vec3(0.0);
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 gap = max(max(g - f, f - g - 1.0), 0.0); // distance to that cell
      if (dot(gap, gap) > 0.85) continue;           // too far for any crater in it to reach here
      vec3 id = i + g;
      vec3 c = g + vec3(hash(id), hash(id + 7.1), hash(id + 13.7));
      float r = 0.16 + 0.3 * hash(id + 3.3);
      vec3 v = f - c;
      float dist = length(v);
      float d = dist / r;
      if (d >= 2.0) continue;
      // Height is (-0.24 + 0.285 d^2) r in the bowl and 0.045 r exp(-5 (d - 1)) outside.
      float dh = d < 1.0 ? 0.57 * d * r : -0.225 * r * exp(-(d - 1.0) * 5.0);
      slope += v * (dh / (r * max(dist, 1e-5)));
    }
    return slope;
  }
  // Three crater sizes. Each one fades out before it gets smaller than a pixel, and is skipped then.
  vec3 fineSlope(vec3 p, float pixel) {
    vec3 slope = vec3(0.0);
    float w = 1.0 - smoothstep(0.0012, 0.004, pixel);
    if (w > 0.0) slope += craters(p * 90.0) * w;
    w = 1.0 - smoothstep(0.0004, 0.0013, pixel);
    if (w > 0.0) slope += craters(p * 270.0) * w;
    w = 1.0 - smoothstep(0.00013, 0.00045, pixel);
    if (w > 0.0) slope += craters(p * 800.0) * w;
    return slope;
  }

  void main() {
    vec3 n0 = normalize(vPos);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n0) + vec3(1e-6, 0.0, 0.0)); // defined at the poles too
    vec3 north = cross(n0, east);
    vec2 s = (texture2D(uSlope, vUv).rg * 2.0 - 1.0) / ${SLOPE_GAIN.toFixed(1)} * uRelief;
    vec3 n = normalize(n0 + east * s.x + north * s.y);

    vec3 albedo = texture2D(uColor, vUv).rgb;
    if (uDetail > 0.001) {
      // Close view: the map is too coarse, so add procedural craters and grain.
      float pixel = length(fwidth(vPos));
      vec3 slope = fineSlope(vPos, pixel);
      n = normalize(n - (east * dot(slope, east) + north * dot(slope, north)) * uDetail * 1.6);
      albedo *= 1.0 + (noise(vPos * 420.0) - 0.5) * 0.12 * uDetail * (1.0 - smoothstep(0.0008, 0.003, pixel));
    }

    // The globe is not moved or turned, so object space is world space.
    vec3 v = normalize(cameraPosition - vPos);
    float mu0 = max(dot(n, uSunDir), 0.0);
    float mu = max(dot(n, v), 0.0);
    float seeliger = 2.0 * mu0 / (mu0 + mu + 1e-4);
    float lit = mix(mu0, min(seeliger, 1.25), 0.65);
    lit *= smoothstep(-0.012, 0.03, dot(n0, uSunDir)); // the globe's own shadow
    vec3 col = albedo * lit * uSunPower;
    col += albedo * max(dot(n0, uEarthDir), 0.0) * uEarthshine * vec3(0.55, 0.72, 1.0);
    gl_FragColor = vec4(col, 1.0);
  }`;

/**
 * Moon surface for a sphere whose object space is the Moon-fixed frame
 * (+Y north, +Z longitude 0, +X longitude 90° E).
 *
 * Light law: mostly Lommel-Seeliger. Lunar soil sends light back toward the
 * Sun, so the full Moon has no dark rim. A plain Lambert sphere looks wrong.
 * Relief comes from a slope map made from LOLA elevation.
 */
export function createMoonMaterial(color: THREE.Texture, slope: THREE.Texture): MoonMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSlope: { value: slope },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uEarthDir: { value: new THREE.Vector3(0, 0, 1) },
      uEarthshine: { value: 0 },
      uDetail: { value: 0 },
      uRelief: { value: 2.2 },
      uSunPower: { value: 2.3 },
    },
    vertexShader,
    fragmentShader,
  });
  return {
    material,
    setSun: (direction) => material.uniforms.uSunDir.value.copy(direction),
    setEarth(direction, litFraction) {
      material.uniforms.uEarthDir.value.copy(direction);
      material.uniforms.uEarthshine.value = 0.07 + 0.14 * litFraction;
    },
    setDetail: (x) => (material.uniforms.uDetail.value = x),
  };
}
