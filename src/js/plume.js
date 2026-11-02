// Afterburner plume: an outer flame envelope, a hot core and a row of shock diamonds.
// Each layer is a revolved surface drawn additively; brightness follows how squarely the surface
// faces the camera, so the edges fall off cleanly without blur or post-processing.
import { AdditiveBlending, Color, DoubleSide, Group, LatheGeometry, Mesh, ShaderMaterial, Vector2 } from "three";

const vertexShader = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vAxial;
  varying float vAngle;
  uniform float uStart;
  uniform float uLength;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    vAxial = clamp((position.x - uStart) / uLength, 0.0, 1.0);
    vAngle = atan(position.z, position.y);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vAxial;
  varying float vAngle;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFacingPower;
  uniform float uFadePower;
  uniform float uTime;
  uniform float uFlicker;
  void main() {
    float facing = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), uFacingPower);
    float fade = pow(1.0 - vAxial, uFadePower);
    float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 31.0 + vAxial * 23.0) * sin(uTime * 17.0 + vAngle * 5.0));
    gl_FragColor = vec4(uColor * uIntensity * facing * fade * flicker, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function layer(profile, { color, intensity, facing = 1.5, fade = 1, flicker = 0.08 }) {
  const start = profile[0][0], end = profile[profile.length - 1][0];
  const geometry = new LatheGeometry(profile.map(([a, r]) => new Vector2(r, a)), 64).rotateZ(-Math.PI / 2);
  const material = new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uColor: { value: new Color(color) }, uIntensity: { value: intensity },
      uFacingPower: { value: facing }, uFadePower: { value: fade },
      uStart: { value: start }, uLength: { value: end - start },
      uTime: { value: 0 }, uFlicker: { value: flicker },
    },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
  return new Mesh(geometry, material);
}

// Samples r(t) on t in [0, 1] into a profile from x0 to x0 + length.
const sample = (x0, length, n, radius) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n;
  return [x0 + t * length, Math.max(radius(t), 0)];
});

export function buildPlume({ exit, radius }) {
  const plume = new Group();
  const D = radius * 2;

  // Outer flame: leaves the nozzle at full width, swells a little, then closes.
  const outerLength = D * 4.4;
  plume.add(layer(sample(exit, outerLength, 48, (t) => radius * (1 + 0.18 * Math.sin(Math.PI * Math.min(t * 1.6, 1))) * (1 - t ** 2.2)),
    { color: 0xff6a1e, intensity: 0.3, facing: 1.0, fade: 1.6, flicker: 0.1 }));

  // Hot core: shorter and brighter.
  const coreLength = D * 2.4;
  plume.add(layer(sample(exit, coreLength, 32, (t) => radius * 0.82 * (1 - t ** 1.6)),
    { color: 0xffb070, intensity: 0.6, facing: 1.8, fade: 1.2, flicker: 0.06 }));

  // Shock diamonds: double cones that shrink and dim downstream.
  let x = exit + D * 0.5;
  for (let i = 0; i < 5; i++) {
    const length = D * (0.85 - i * 0.08);
    const r = radius * (0.42 - i * 0.05);
    plume.add(layer(sample(x - length / 2, length, 24, (t) => r * (1 - Math.abs(2 * t - 1))),
      { color: 0xfff0d0, intensity: 1.4 * 0.74 ** i, facing: 1.2, fade: 0, flicker: 0.05 }));
    x += D * (1.0 - i * 0.07);
  }

  plume.userData.tick = (time) => plume.children.forEach((mesh) => { mesh.material.uniforms.uTime.value = time; });
  plume.userData.extent = exit + outerLength;
  plume.userData.visibleExtent = exit + outerLength * 0.72; // the last stretch is too faint to count for framing
  return plume;
}
