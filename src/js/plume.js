// Afterburner plume as a ray-marched volume, colored by an illustrative Mach-number field.
// The field is the same model the old hero's contour art used (tools/mach_field.py, removed; see git history): an underexpanded
// jet with shrinking shock cells, a closing potential core and a spreading shear layer. Colors follow
// the jet colormap from blue (Mach 0) to red (Mach 3.2). Glowing Mach disks sit where the shocks cross
// the axis; they shrink and dim downstream. A soft violet halo stands in for the bloom layer.
// Gradients live only here, inside the plume. Lengths below are in exit radii (R).
import { AddEquation, CustomBlending, CylinderGeometry, FrontSide, Mesh, OneFactor, ShaderMaterial, Vector2, Vector3 } from "three";

const LENGTH = 12;            // volume length, R
const RADIUS_START = 1.8;      // volume radius at the exit, R
const RADIUS_END = 4.2;        // volume radius at the far end, R

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vCam;
  void main() {
    vPos = position;
    vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vCam;
  uniform float uR;          // exit radius, world units
  uniform float uLen;        // volume length, world units
  uniform float uA;          // volume radius at the exit, world units
  uniform float uB;          // volume radius growth per unit length
  uniform float uTime;
  uniform float uThrottle;   // 0.85 .. 1.0, slow cycle
  uniform float uPulse;      // 0 .. 1, same cycle normalized
  uniform float uFade;       // 1 on screen, 0 once the hero has scrolled away
  uniform float uSteps;
  uniform vec2 uRes;         // drawing buffer size, px
  uniform vec3 uEdge;        // fade widths toward the left, bottom and top edges of the canvas, px

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  vec3 jetmap(float t) {
    return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
  }
  // Shock cells shrink linearly downstream; this counts cells up to s.
  float cellCount(float s) { return -log(max(1.0 - 0.12 * s / 1.85, 1e-3)) / 0.12; }

  void main() {
    vec3 ro = vPos;
    vec3 rd = normalize(vPos - vCam);

    // Leave the volume (a cone frustum along x) at the nearest cap or side.
    float tExit = 1e9;
    if (rd.x > 1e-5) tExit = (uLen - ro.x) / rd.x; else if (rd.x < -1e-5) tExit = -ro.x / rd.x;
    float rb = uA + uB * ro.x;
    float qa = rd.y * rd.y + rd.z * rd.z - uB * uB * rd.x * rd.x;
    float qb = 2.0 * (ro.y * rd.y + ro.z * rd.z - uB * rb * rd.x);
    float qc = ro.y * ro.y + ro.z * ro.z - rb * rb;
    float eps = 1e-3 * uR;
    if (abs(qa) > 1e-6) {
      float disc = qb * qb - 4.0 * qa * qc;
      if (disc > 0.0) {
        float sq = sqrt(disc);
        float t1 = (-qb - sq) / (2.0 * qa), t2 = (-qb + sq) / (2.0 * qa);
        float lo = min(t1, t2), hi = max(t1, t2);
        if (lo > eps) tExit = min(tExit, lo); else if (hi > eps) tExit = min(tExit, hi);
      }
    }
    tExit = max(tExit, 0.0);

    float dt = tExit / uSteps;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 acc = vec3(0.0);

    for (int i = 0; i < 64; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * (dt * (float(i) + jitter));
      vec3 q = p / uR;                       // in exit radii
      float s = q.x / uThrottle;             // the whole field stretches with throttle
      float sd = max(s, 0.0);
      float r = length(q.yz);
      float ang = atan(q.z, q.y);

      float core = max(0.95 * (1.0 - sd / 11.5), 0.06);
      float outer = 1.12 + 0.16 * sd;
      float shearMid = 0.5 * (core + outer);
      float shearW = 0.077 + 0.055 * sd;

      // Turbulent shear layer: the edge moves with noise carried downstream.
      float turb = noise(vec3(sd * 2.2 - uTime * 7.0, q.y * 2.6, q.z * 2.6));
      float jet = 0.5 * (1.0 - tanh((r + (turb - 0.5) * shearW * 1.1 - shearMid) / shearW));

      // Mach number (same form as the old tools/mach_field.py).
      float cell = cellCount(sd) - cellCount(0.35);
      float u = fract(cell);
      float rr = r / core + abs(2.0 * u - 1.0);
      float cells = rr < 1.0 ? 1.0 - rr : -0.45 * min(rr - 1.0, 1.0);
      float mach = (2.3 * (1.0 - 0.3 * clamp(sd / 8.5, 0.0, 1.0)) + exp(-sd / 8.5) * cells) * jet;
      mach *= smoothstep(-0.05, 0.12, s);
      float t = clamp(mach / 3.2, 0.0, 1.0);
      float band = mix(t, (floor(t * 16.0) + 0.5) / 16.0, 0.3);   // a hint of the solver's contour bands

      float tail = 1.0 - smoothstep(6.0, 10.5, sd);
      float flicker = 0.85 + 0.3 * noise(vec3(sd * 1.4 - uTime * 11.0, ang * 1.5, uTime * 0.7));

      // Body: Mach-tinted gas, brighter where faster.
      vec3 e = jetmap(band) * jet * (0.2 + 0.8 * t * t) * 2.0;

      // Mach disks: soft glowing disks at the shock crossings, shrinking and dimming downstream.
      float len = max(1.85 - 0.12 * sd, 0.4);
      float du = min(u, 1.0 - u) * len;
      float diskR = 0.62 * core;
      float shimmer = 0.7 + 0.6 * noise(vec3(floor(cell) * 3.7, uTime * 8.0, ang * 2.0));
      float disk = exp(-pow(du / 0.2, 2.0)) * (1.0 - smoothstep(diskR * 0.35, diskR, r));
      e += vec3(1.0, 0.9, 1.0) * disk * exp(-sd / 5.0) * (0.55 + 0.45 * uPulse) * shimmer * 16.0;

      // White-hot gas right at the exit.
      e += vec3(1.0, 0.94, 0.9) * exp(-sd * 1.6) * (1.0 - smoothstep(0.0, core + 0.15, r)) * 1.4;

      // Bloom: a wide violet haze around the jet.
      e += vec3(0.42, 0.28, 1.0) * exp(-pow(r / (outer * 1.15), 2.0) * 1.6) * exp(-sd / 6.0) * 0.2;

      acc += e * tail * flicker * (dt / uR);
    }

    // Hue-preserving tone curve: bright Mach-3 gas stays red instead of washing out to white;
    // only the very brightest spots (the Mach disks) lift toward white.
    // Soft fade toward the canvas edges the plume can reach, so no edge ever shows.
    float edge = smoothstep(0.0, max(uEdge.x, 1.0), gl_FragCoord.x)
      * smoothstep(0.0, max(uEdge.y, 1.0), gl_FragCoord.y)
      * smoothstep(0.0, max(uEdge.z, 1.0), uRes.y - gl_FragCoord.y);
    acc *= uFade * edge * (0.75 + 0.25 * uPulse);
    float peak = max(acc.r, max(acc.g, acc.b));
    vec3 col = acc * (1.0 - exp(-peak)) / max(peak, 1e-4);
    col = mix(col, vec3(1.0), smoothstep(2.5, 7.0, peak) * 0.6);
    // Premultiplied output: alpha is the brightest channel, so the plume reads as light on the page.
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  }
`;

export function buildPlume({ exit, radius, steps = 40 }) {
  const len = LENGTH * radius;
  const a = RADIUS_START * radius;
  const b = ((RADIUS_END - RADIUS_START) * radius) / len;
  // Cone frustum along +x from the exit plane. Rendered by its front faces; the shader finds the far side.
  const geometry = new CylinderGeometry(RADIUS_END * radius, a, len, 48, 1, false)
    .rotateZ(-Math.PI / 2)
    .translate(len / 2, 0, 0);
  const material = new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uR: { value: radius }, uLen: { value: len }, uA: { value: a }, uB: { value: b },
      uTime: { value: 0 }, uThrottle: { value: 1 }, uPulse: { value: 1 }, uFade: { value: 1 }, uSteps: { value: steps },
      uRes: { value: new Vector2(1, 1) }, uEdge: { value: new Vector3() },
    },
    transparent: true, depthWrite: false, side: FrontSide, toneMapped: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    blendSrcAlpha: OneFactor, blendDstAlpha: OneFactor,
  });
  const plume = new Mesh(geometry, material);
  plume.position.x = exit;
  plume.renderOrder = 2;
  plume.frustumCulled = false;
  const u = material.uniforms;
  plume.userData.update = ({ time, throttle, pulse, fade }) => {
    u.uTime.value = time; u.uThrottle.value = throttle; u.uPulse.value = pulse; u.uFade.value = fade;
  };
  plume.userData.setEdges = (width, height, left, bottom, top) => { u.uRes.value.set(width, height); u.uEdge.value.set(left, bottom, top); };
  plume.userData.length = len;
  return plume;
}
