import * as THREE from "three";

export interface Plume {
  object: THREE.Group;
  /** throttle 0..1, time in seconds, groundY = world height under which the flame is cut. */
  set(throttle: number, timeS: number, groundY?: number): void;
}

const vertexShader = /* glsl */ `
  uniform float uLength;
  varying float vH; varying vec3 vNormalV; varying vec3 vViewV; varying vec3 vWorld; varying vec3 vLocal;
  void main() {
    vLocal = position;
    vH = clamp(-position.y / uLength, 0.0, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vNormalV = normalize(normalMatrix * normal);
    vViewV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */ `
  uniform float uThrottle, uTime, uGroundY, uEdge, uGain;
  uniform vec3 uCore, uTail;
  varying float vH; varying vec3 vNormalV; varying vec3 vViewV; varying vec3 vWorld; varying vec3 vLocal;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    if (vWorld.y < uGroundY) discard;
    // Interpolated values can leave [0, 1] by a hair. pow() of a negative number is not a number,
    // and one such pixel spreads over the whole picture through the bloom. Clamp first.
    float h = clamp(vH, 0.0, 1.0);
    float facing = clamp(abs(dot(normalize(vNormalV), normalize(vViewV))), 0.0, 1.0);
    float body = pow(facing, uEdge);
    float along = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.03, h);
    vec2 ring = normalize(vLocal.xz + 1e-4);
    float streak = noise(vec3(ring * 3.5, h * 7.0 - uTime * 9.0));
    float flicker = 0.9 + 0.1 * noise(vec3(uTime * 31.0, 0.0, 0.0));
    float a = body * along * (0.45 + 0.75 * streak) * uThrottle * flicker;
    vec3 col = mix(uTail, uCore, pow(1.0 - h, 3.0));
    gl_FragColor = vec4(col * a * uGain, a);
  }`;

function layer(radiusTop: number, radiusBottom: number, length: number, edge: number, gain: number, core: number, tail: number) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 48, 20, true);
  geometry.translate(0, -length / 2, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uLength: { value: length },
      uThrottle: { value: 0 },
      uTime: { value: 0 },
      uGroundY: { value: -1e9 },
      uEdge: { value: edge },
      uGain: { value: gain },
      uCore: { value: new THREE.Color(core) },
      uTail: { value: new THREE.Color(tail) },
    },
    vertexShader,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Engine flame for a ship whose base is at y = 0 and that is about 52 units tall.
 * In vacuum a flame spreads wide and stays faint at the edges: a hot narrow core
 * inside a broad, soft outer cone.
 */
export function createPlume(gain = 1): Plume {
  const group = new THREE.Group();
  const outer = layer(3.4, 15, 95, 1.6, 2.2 * gain, 0x9fc0ff, 0x5a3cff);
  const inner = layer(2.6, 5.2, 58, 2.4, 7.0 * gain, 0xf2f6ff, 0x6fa0ff);
  group.add(outer, inner);
  group.visible = false;
  return {
    object: group,
    set(throttle, timeS, groundY = -1e9) {
      group.visible = throttle > 0.001;
      for (const mesh of [outer, inner]) {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        u.uThrottle.value = throttle;
        u.uTime.value = timeS;
        u.uGroundY.value = groundY;
      }
    },
  };
}
