// USLI launch scene: the team's rocket (STL export, cut in half by a live clipping plane) flies the
// OpenRocket timeline from content/usli-flight.json along one big arc over the card, on its own clock
// (about 40 s, src/js/usli-timeline.js). The canvas sits behind the card text; the page scrolls normally.
// Lazy chunk, loaded by projects.js near the viewport (also with reduced motion, Charles 2026-11-04).
// Renders only while visible (render.js).
//
//   const scene = await mountUsli(root)   // root = the USLI card ([data-usli]); wires controls and autoplay
//   scene.play() / pause() / restart() / seek(t)
//   scene.snapshot(t, w, h)              // still frame as a WebP blob (images/nasa-student-launch/)
//   scene.debug()                        // piece and text rects in client px (tools/check_usli_scene.mjs --browser)
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight,
  DoubleSide, Float32BufferAttribute, Group, LatheGeometry, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, Plane, PlaneGeometry, PointLight, Points, ShaderMaterial, SphereGeometry, Box3,
  TorusGeometry, Vector2, Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createStage } from "./render.js";
import { createTimeline, IN, PLAY_SECONDS } from "./usli-timeline.js";
import data from "../../content/usli-flight.json";

const MODEL_URL = `${import.meta.env.BASE_URL}models/usli/rocket.glb`;
const AXIS = 0.19325; // the STL export's rocket axis sits at x = z = 193.25 mm
const CREASE = MathUtils.degToRad(35);
const FOV = 6; // narrow lens far away: nearly orthographic, so the scale stays the same across the card
const YAW = 0.2; // a slight turn so the cut-open interior reads in depth
const COSY = Math.cos(YAW);
const FADE_TO = 0.35; // opacity while a piece overlaps a text block
const ROCKET_LEN_M = 129 * IN;

// Part classes by node name (the GLB keeps the STL file names).
const BODY_OF = (n) => (/^(Body_Bot|Motor_Mount|centering_ring|newFin|bulkhead2)/.test(n) ? "booster"
  : /^(Body_Mid|Body_Top2|couplerBot)/.test(n) ? "middle"
    : /^(Body_Top-|tube_coupler_top|payloadCenterRing)/.test(n) ? "payload"
      : /^(Nosecone|noseconeBulkhead)/.test(n) ? "nose" : null);
const CLASS_OF = (n) => (/^Body_Mid/.test(n) ? "switchband"
  : /^(Body_Bot|Body_Top|Nosecone)/.test(n) ? "tube"
    : /Bulkhead/i.test(n) ? "metal"
      : /^newFin/.test(n) ? "fin" : "inner");

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export async function createUsliScene(root) {
  const C = {
    accent: new Color(token("--color-accent")), ink: new Color(token("--color-ink")), muted: new Color(token("--color-ink-muted")),
    rule: new Color(token("--color-rule")), surface2: new Color(token("--color-surface-2")), grass: new Color(token("--color-grass")),
    bg: new Color(token("--color-bg")),
  };
  const narrow = matchMedia("(max-width: 599px)").matches;
  const mount = root.querySelector("[data-usli-canvas]");
  const stage = await createStage(mount, {
    fov: FOV, exposure: 1.0, canvasClass: "usli__canvas",
    label: "Animation of the team's rocket, drawn cut in half, flying its simulated launch and recovery along an arc. The steps are listed below.",
  });
  const { renderer, scene, camera, canvas } = stage;
  canvas.setAttribute("aria-describedby", root.querySelector("[data-usli-sequence]").id);
  renderer.localClippingEnabled = true;
  const cut = [new Plane(new Vector3(0, 0, -1), 0)]; // keep z <= 0: the half facing the camera is cut away
  // A weak rim light from behind, in this scene only (createStage output for other viewers is unchanged).
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  let tl = createTimeline(data);
  const S = tl.stations;
  const D = tl.diameterScale;
  const R = tl.radius;

  // ---- materials: physically based, neutral structure, one accent part (the switchband) ----
  // Subtle procedural grain: roughness varies along a winding pattern, so tubes read as composite layup.
  const grain = (m, amount) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGrain;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrain = position;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGrain;").replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float gw = sin(vGrain.y * 620.0 + atan(vGrain.z, vGrain.x) * 9.0) * 0.5 + 0.5;
        float gs = fract(sin(dot(floor(vGrain * 900.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        roughnessFactor = clamp(roughnessFactor + ${amount.toFixed(3)} * (gw - 0.5) + ${(amount * 0.5).toFixed(3)} * (gs - 0.5), 0.04, 1.0);`,
      );
    };
    m.customProgramCacheKey = () => `grain${amount}`;
    return m;
  };
  const physical = (color, { grain: amount = 0.08, ...o }) => grain(new MeshPhysicalMaterial({ color, envMapIntensity: 1.0, clippingPlanes: cut, ...o }), amount);
  const graphite = C.muted.clone().multiplyScalar(0.45);
  const MAT = {
    tube: () => physical(C.ink.clone().multiplyScalar(0.92), { roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    switchband: () => physical(C.accent, { roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    inner: () => physical(C.muted.clone().multiplyScalar(0.85), { roughness: 0.62, metalness: 0, clearcoat: 0.1 }),
    metal: () => physical(graphite, { roughness: 0.3, metalness: 0.85, grain: 0.05 }),
    fin: () => physical(graphite.clone().multiplyScalar(1.3), { roughness: 0.45, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  };
  const fadeables = new Map(); // piece id -> materials that fade together
  const track = (id, ...mats) => { if (!fadeables.has(id)) fadeables.set(id, []); fadeables.get(id).push(...mats); };
  // Solid part: lit outer faces plus a darker cap drawn from the inside, so cut solids read as solid walls.
  const solid = (geometry, material, parent, id) => {
    const face = new Mesh(geometry, material);
    const cap = new Mesh(geometry, new MeshBasicMaterial({ color: material.color.clone().multiplyScalar(0.28), side: BackSide, clippingPlanes: cut }));
    parent.add(face, cap);
    track(id, face.material, cap.material);
    return face;
  };

  // ---- the rocket: body group (pose) > scaler (diameter x D) > parts in CAD coordinates ----
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const bodies = {}, scalers = {};
  for (const id of ["booster", "middle", "payload", "nose"]) {
    bodies[id] = new Group();
    scalers[id] = new Group();
    scalers[id].scale.set(D, 1, D);
    bodies[id].add(scalers[id]);
    scene.add(bodies[id]);
  }
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const body = BODY_OF(node.name);
    if (!body) return;
    // Positions are quantized (int16) in the GLB: copy them to floats before baking the node transform.
    const src = node.geometry.attributes.position, flat = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) flat.set([src.getX(i), src.getY(i), src.getZ(i)], i * 3);
    const raw = new BufferGeometry();
    raw.setAttribute("position", new BufferAttribute(flat, 3));
    if (node.geometry.index) raw.setIndex(node.geometry.index.clone());
    const geometry = toCreasedNormals(raw.applyMatrix4(node.matrixWorld), CREASE);
    geometry.translate(-AXIS, 0, -AXIS);
    solid(geometry, MAT[CLASS_OF(node.name)](), scalers[body], body);
  });

  // Motor: not in the CAD, so a plain cylinder inside the motor mount (79.2 mm OD, 508 mm long, from the STL).
  solid(new CylinderGeometry(0.037, 0.037, 0.5, 32).translate(0, 0.254, 0), MAT.metal(), scalers.booster, "booster");
  // Shear pins: 3 per joint, each split into an outer and an inner half that part at separation.
  const r0 = (S.radiusIn) * IN;
  const pins = (station, outer, inner) => {
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3;
      for (const [body, a0, a1] of [[outer, r0 - 0.006, r0 + 0.003], [inner, r0 - 0.016, r0 - 0.006]]) {
        const g = new CylinderGeometry(0.003, 0.003, a1 - a0, 8).rotateZ(Math.PI / 2).translate((a0 + a1) / 2, 0, 0).rotateY(-a).translate(0, station * IN, 0);
        solid(g, MAT.metal(), scalers[body], body);
      }
    }
  };
  pins(S.pins.apogee, "booster", "middle");
  pins(S.pins.main, "middle", "payload");

  // ---- motor fire: a soft camera-facing plume (gradient allowed inside the plume only) ----
  const fireMat = new ShaderMaterial({
    uniforms: { k: { value: 0 }, time: { value: 0 }, white: { value: new Color(1, 0.97, 0.9) }, accent: { value: C.accent } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float k; uniform float time; uniform vec3 white; uniform vec3 accent; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float along = vUv.y;                                   // 0 at the nozzle, 1 at the tail
        float across = abs(vUv.x - 0.5) * 2.0;
        float turb = n(vec2(vUv.x * 5.0, along * 7.0 - time * 9.0)) * 0.6 + n(vec2(vUv.x * 11.0, along * 15.0 - time * 17.0)) * 0.4;
        float width = mix(0.55, 1.0, smoothstep(0.0, 0.35, along)) * (1.0 - along * 0.55) * (0.8 + 0.4 * turb);
        float body = 1.0 - smoothstep(width * 0.35, width, across);
        float fade = pow(1.0 - along, 1.3) * smoothstep(0.0, 0.04, along);
        float a = body * fade * k * (0.75 + 0.5 * turb);
        float hot = 1.0 - smoothstep(0.0, 0.55, across / max(width, 0.01) + along * 0.9);
        gl_FragColor = vec4(mix(accent, white, hot) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
  });
  const FIRE_LEN = 1.5, FIRE_W = R * 3.2;
  const fire = new Mesh(new PlaneGeometry(FIRE_W, FIRE_LEN).translate(0, -FIRE_LEN / 2, 0), fireMat);
  fire.geometry.attributes.uv.array.forEach((v, i, arr) => { if (i % 2) arr[i] = 1 - v; }); // uv.y 0 at the nozzle
  fire.position.set(0, -0.01, 0.05);
  bodies.booster.add(fire);
  const fireLight = new PointLight(C.accent, 0, 3, 2);
  fireLight.position.set(0, -0.3, 0.3);
  bodies.booster.add(fireLight);

  // ---- smoke: soft billboard sprites with a noise-based alpha, drifting and growing ----
  const SMOKE = narrow ? 90 : 220;
  const smokeGeo = new BufferGeometry();
  const smokePos = new Float32Array(SMOKE * 3), smokeSize = new Float32Array(SMOKE), smokeAlpha = new Float32Array(SMOKE), smokeSeed = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) smokeSeed[i] = Math.random() * 100;
  smokeGeo.setAttribute("position", new BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute("size", new BufferAttribute(smokeSize, 1));
  smokeGeo.setAttribute("alpha", new BufferAttribute(smokeAlpha, 1));
  smokeGeo.setAttribute("seed", new BufferAttribute(smokeSeed, 1));
  const smokeMat = new ShaderMaterial({
    uniforms: { color: { value: C.ink.clone().lerp(C.muted, 0.5) }, scale: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; attribute float seed; varying float vA; varying float vS; uniform float scale;
      void main(){ vA = alpha; vS = seed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying float vA; varying float vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
        float puff = n(p * 3.5 + vS) * 0.65 + n(p * 7.0 - vS) * 0.35;
        float a = (1.0 - smoothstep(0.25, 1.0, d + (puff - 0.5) * 0.5)) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(color * (0.85 + 0.25 * puff), a);
      }`,
    transparent: true, depthWrite: false,
  });
  const smoke = new Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const rnd = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  let smokeEmit = []; // per particle: emission time, world point at the nozzle, exhaust direction (recomputed on layout)

  // ---- charge flash: a brief burst at the avionics bulkhead, inside the tube, venting toward the open bay ----
  const flashes = new Map();
  for (const id of ["drogue-charge-primary", "drogue-charge-backup", "main-charge", "main-charge-backup"]) {
    const g = new Group();
    const core = new Mesh(new SphereGeometry(1, 20, 12), new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    const gas = new Mesh(new SphereGeometry(1, 20, 12), new MeshBasicMaterial({ color: C.accent, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    g.add(core, gas);
    g.visible = false;
    scalers.middle.add(g);
    flashes.set(id, g);
  }
  const flashLight = new PointLight(C.accent, 0, 2.5, 2);
  scalers.middle.add(flashLight);

  // ---- parachutes: cloth gores (accent and ink, stylized) with darker seams, sheen, double-sided ----
  function canopy(gores) {
    const pos = [], col = [], STEPS = 12, ACROSS = 5;
    for (let g = 0; g < gores; g++) {
      const base = g % 2 ? C.ink : C.accent;
      const a0 = (g / gores) * Math.PI * 2, a1 = ((g + 1) / gores) * Math.PI * 2;
      const point = (v, u) => {
        const a = a0 + (a1 - a0) * u;
        const bulge = 1 + 0.07 * Math.sin(Math.PI * u) * Math.sin((v * Math.PI) / 2);
        const r = Math.sin((v * Math.PI) / 2) * bulge, h = Math.cos((v * Math.PI) / 2) * 0.48;
        return [Math.cos(a) * r, h, Math.sin(a) * r];
      };
      const shade = (u) => (u < 0.06 || u > 0.94 ? 0.62 : 1); // seam
      for (let s = 0; s < STEPS; s++) for (let u = 0; u < ACROSS; u++) {
        const v0 = s / STEPS, v1 = (s + 1) / STEPS, u0 = u / ACROSS, u1 = (u + 1) / ACROSS;
        const q = [[v0, u0], [v1, u0], [v1, u1], [v0, u1]];
        for (const i of [0, 1, 2, 0, 2, 3]) {
          pos.push(...point(q[i][0], q[i][1]));
          const k = shade(q[i][1]) * (q[i][0] > 0.93 ? 0.8 : 1); // reinforced skirt band
          col.push(base.r * k, base.g * k, base.b * k);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const chutes = {};
  const spec0 = tl.stateAt(0).chutes;
  for (const id of ["drogue", "main", "payload"]) {
    const spec = spec0[id];
    const group = new Group();
    const domeMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.72, sheen: 1, sheenRoughness: 0.45, sheenColor: new Color(1, 1, 1), side: DoubleSide, envMapIntensity: 0.8 });
    const dome = new Mesh(canopy(spec.gores), domeMat);
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(spec.gores * 6), 3));
    const lineMat = new LineBasicMaterial({ color: C.muted, transparent: true });
    const lines = new LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    const bundleLen = { drogue: 0.2, main: 0.42, payload: 0.18 }[id];
    const bagMat = new MeshPhysicalMaterial({ color: C.ink.clone().multiplyScalar(0.8), roughness: 0.85, sheen: 0.6, sheenColor: new Color(1, 1, 1) });
    const bundle = new Mesh(new CylinderGeometry(0.06 * D, 0.06 * D, bundleLen, 20), bagMat);
    group.add(dome, lines, bundle);
    const entry = { group, dome, lines, bundle, spec };
    track(`chute-${id}`, domeMat, lineMat, bagMat);
    if (id === "payload") { // stand-in for the release device band (not modeled in detail)
      const bandMat = new MeshPhysicalMaterial({ color: graphite, roughness: 0.35, metalness: 0.6 });
      entry.band = new Mesh(new TorusGeometry(0.064 * D, 0.012 * D, 8, 24).rotateX(Math.PI / 2), bandMat);
      bundle.add(entry.band);
      track(`chute-${id}`, bandMat);
    }
    chutes[id] = entry;
    scene.add(group);
  }
  let clock = 0;
  const placeChute = (c, s, at) => {
    const { group, dome, lines, bundle, band } = c;
    group.position.set(at.x, at.y, -0.03);
    group.rotation.z = s.rot;
    const open = s.deployed ? s.inflate : 0;
    bundle.visible = open < 0.35;
    bundle.scale.setScalar(1 - open);
    if (band) band.visible = s.held;
    dome.visible = lines.visible = s.deployed && open > 0.01;
    if (!dome.visible) return;
    const billow = 1 + 0.025 * Math.sin(clock * 2.1 + s.diameter) * open;
    const r = MathUtils.lerp(0.05, s.diameter / 2, open ** 0.8);
    const stretch = MathUtils.lerp(3.2, 1, open);
    const skirt = s.lineLength * MathUtils.lerp(0.7, 1, open);
    dome.scale.set(r * billow, r * stretch * (2 - billow), r * billow);
    dome.position.y = skirt;
    const p = lines.geometry.attributes.position.array, n = p.length / 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.set([Math.cos(a) * r * billow, skirt, Math.sin(a) * r * billow, 0, 0, 0], i * 6);
    }
    lines.geometry.attributes.position.needsUpdate = true;
  };

  // ---- shock cords: thin matte tubes ----
  const cordMat = new MeshStandardMaterial({ color: C.muted, roughness: 0.9, transparent: true });
  const cordGeo = new CylinderGeometry(0.018, 0.018, 1, 6).translate(0, 0.5, 0);
  const cords = new Map();
  const placeCord = (id, a, b) => {
    let m = cords.get(id);
    if (!m) { m = new Mesh(cordGeo, cordMat); scene.add(m); cords.set(id, m); }
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    m.position.set(a.x, a.y, -0.04);
    m.scale.set(1, Math.max(len, 1e-4), 1);
    m.rotation.z = Math.atan2(-dx, dy);
    m.visible = true;
  };

  // ---- landing island: low, wide, soft edge, tone variation in --color-grass; fades in on final approach ----
  const island = new Group();
  const isl0 = tl.stateAt(0).island;
  const profile = [];
  const IR = isl0.radius, ID = isl0.depth;
  for (let i = 0; i <= 10; i++) { const u = i / 10; profile.push(new Vector2(IR * 0.86 * u, 0.02 * (1 - u * u))); }
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); profile.push(new Vector2(IR * 0.86 + IR * 0.14 * Math.sin(a), -ID * 0.45 * (1 - Math.cos(a)))); }
  profile.push(new Vector2(IR * 0.8, -ID * 0.85), new Vector2(0, -ID));
  const islGeo = new LatheGeometry(profile.reverse(), 72); // bottom-to-top profile, so the faces point outward
  const islCol = [], ip = islGeo.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const y = ip.getY(i), x = ip.getX(i), z = ip.getZ(i);
    const tone = 0.88 + 0.12 * Math.sin(x * 3.1 + Math.sin(z * 2.3) * 2) * Math.cos(z * 2.7 - x * 0.9);
    const top = y > -0.01 ? 1 : clamp(1 + y / (ID * 0.25));
    const c = C.surface2.clone().multiplyScalar(1.5).lerp(C.grass.clone().multiplyScalar(tone), top);
    islCol.push(c.r, c.g, c.b);
  }
  islGeo.setAttribute("color", new Float32BufferAttribute(islCol, 3));
  // Low environment reflection: at this grazing view the studio HDRI would wash --color-grass out to grey.
  const islMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.12, transparent: true });
  island.add(new Mesh(islGeo, islMat));
  island.rotation.x = 0.32; // tipped toward the camera so the grass top reads (the camera has no pitch)
  // contact shadows under landed pieces (soft blob texture, in the 3D scene only)
  const blob = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(cv);
  })();
  const shadows = ["main", "payload"].map(() => {
    const m = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false }));
    m.renderOrder = 1;
    scene.add(m);
    return m;
  });
  scene.add(island);

  // ---- trail: the path behind the rocket, 2 px, ink-muted, fading out in solid steps ----
  const TRAIL_STEPS = 8;
  const trail = Array.from({ length: TRAIL_STEPS }, (_, i) => {
    const m = new LineMaterial({ color: C.muted, linewidth: 2, transparent: true, opacity: 0.5 * ((i + 1) / TRAIL_STEPS) ** 1.5, depthWrite: false });
    const l = new Line2(new LineGeometry(), m);
    l.frustumCulled = false;
    scene.add(l);
    return l;
  });

  // ---- layout: card px <-> world meters, arc bounds, spacing so events happen in clear areas ----
  const L = { W: 1, apexY: 0, groundY: 1, ppm: 1, shift: 0, text: [] };
  const texts = () => [...root.querySelectorAll("[data-usli-text]")];
  const toWorld = (xPx, yPx) => ({ x: xPx / L.ppm / COSY, y: -yPx / L.ppm });
  // On the descent side the pieces shift left (up to L.shift m, reached at landing) when the main canopy would
  // otherwise cross the card's right edge (narrow screens).
  const anchorWorld = (a) => {
    const w = toWorld(a.x * L.W, L.apexY + a.y * (L.groundY - L.apexY));
    return { x: w.x + L.shift * clamp((a.p - 0.5) / 0.5), y: w.y };
  };
  const extentAbove = (state, chain) => { // meters above the chain anchor reached by its pieces
    let top = 0;
    for (const [id, b] of Object.entries(state.bodies)) {
      if (b.chain !== chain) continue;
      const s = S[id];
      for (const st of [s.aft, s.fwd]) top = Math.max(top, b.y + st * IN * Math.cos(b.rot));
    }
    for (const c of Object.values(state.chutes)) {
      if (c.chain !== chain || !c.deployed) continue;
      top = Math.max(top, c.pos.y + Math.cos(c.rot) * (c.lineLength + (c.diameter / 2) * 0.5 * c.inflate) + 0.1);
    }
    return top;
  };
  const relRect = (el, cr) => { const r = el.getBoundingClientRect(); return { l: r.left - cr.left, t: r.top - cr.top, r: r.right - cr.left, b: r.bottom - cr.top, el }; };

  function layout() {
    const cr = root.getBoundingClientRect();
    L.W = cr.width;
    L.ppm = clamp(0.17 * L.W, 110, 240) / ROCKET_LEN_M;
    const landX = toWorld(data.path.landing[0] * L.W, 0).x, edge = toWorld(L.W - 16, 0).x;
    L.shift = Math.min(0, edge - (landX + tl.stateAt(0).chutes.main.diameter / 2 + 0.15));
    const T = tl.times;
    // Room above the apex line for the pieces that hang above the apex right after apogee.
    let above = 0;
    for (let t = T.apogee; t <= T.apogee + 4; t += 0.25) above = Math.max(above, extentAbove(tl.stateAt(t), "shared"));
    root.style.setProperty("--usli-top", `${Math.ceil(above * L.ppm + 40)}px`);
    // Landing zone under the text: deep enough that the 600 ft and 500 ft moments sit below the text.
    root.style.setProperty("--usli-zone", "0px");
    const measure = () => {
      const c = root.getBoundingClientRect();
      const title = root.querySelector(".project__head").getBoundingClientRect();
      L.apexY = title.top - c.top - 64; // clear margin above the headline
      L.groundY = root.querySelector("[data-usli-ground]").getBoundingClientRect().top - c.top;
      return c;
    };
    let c = measure();
    const bodyBottom = root.querySelector(".usli__row").getBoundingClientRect().bottom - c.top;
    let need = 0;
    for (const t of [T.main, T.main + 0.3, T.payloadRelease, T.payloadRelease + 0.25]) {
      const st = tl.stateAt(t);
      for (const chain of ["main", "payload"]) {
        const y = st.anchors[chain].y; // groundY must satisfy: apexY + y (G - apexY) - E >= bodyBottom + margin
        const E = extentAbove(st, chain) * L.ppm;
        const G = (bodyBottom + 32 + E - L.apexY) / y + L.apexY;
        need = Math.max(need, G - L.groundY);
      }
    }
    root.style.setProperty("--usli-zone", `${Math.ceil(Math.max(0, need))}px`);
    c = measure();
    tl = createTimeline(data, { aspect: L.W / Math.max(1, L.groundY - L.apexY) });
    L.text = texts().map((el) => relRect(el, c));
    // Smoke emission points (fixed per layout): nozzle position and exhaust direction at each emission time.
    smokeEmit = Array.from({ length: SMOKE }, (_, i) => {
      const te = T.liftoff + (i / SMOKE) * (T.burnout - T.liftoff);
      const a = tl.anchorAt(te);
      const w = anchorWorld(a), ang = (a.angle * Math.PI) / 180;
      return { te, x: w.x, y: w.y, dx: -Math.cos(ang), dy: -Math.sin(ang) };
    });
  }

  // ---- camera: the canvas is a viewport-tall window onto the card; follow it as the page scrolls ----
  const res = new Vector2();
  let framing = null; // set by snapshot(): frame a world box instead of the card window
  function fitCamera(cam) {
    renderer.getSize(res);
    let cx, cy, viewH;
    if (framing) { cx = framing.cx; cy = framing.cy; viewH = framing.h; }
    else {
      const mr = mount.getBoundingClientRect(), cr = root.getBoundingClientRect();
      const w = toWorld(mr.left - cr.left + mr.width / 2, mr.top - cr.top + mr.height / 2);
      cx = w.x; cy = w.y; viewH = mr.height / L.ppm;
    }
    const dist = viewH / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
    cam.fov = FOV;
    cam.position.set(cx + Math.sin(YAW) * dist, cy, Math.cos(YAW) * dist);
    cam.lookAt(cx, cy, 0);
    cam.near = Math.max(0.1, dist - 60);
    cam.far = dist + 60;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    smokeMat.uniforms.scale.value = res.y / (2 * Math.tan(MathUtils.degToRad(FOV / 2)));
    for (const l of trail) l.material.resolution.copy(res);
  }
  stage.setFit(fitCamera);

  // ---- apply a state ----
  const readout = { time: root.querySelector("[data-r-time]"), alt: root.querySelector("[data-r-alt]"), phase: root.querySelector("[data-r-phase]") };
  const ft = (v) => `${Math.round(v).toLocaleString("en-US")} ft`;
  let state = null, flightT = 0;
  const fade = new Map(); // piece id -> current opacity
  const box = new Box3(), tmpBox = new Box3(), v3 = new Vector3();

  function apply(t) {
    flightT = t;
    state = tl.stateAt(t);
    const A = Object.fromEntries(Object.entries(state.anchors).map(([k, a]) => [k, anchorWorld(a)]));
    const local = (chain, p) => ({ x: A[chain].x + p.x, y: A[chain].y + p.y });
    for (const [id, pose] of Object.entries(state.bodies)) {
      const w = local(pose.chain, pose);
      bodies[id].position.set(w.x, w.y, 0);
      bodies[id].rotation.z = pose.rot;
    }
    for (const [id, s] of Object.entries(state.chutes)) placeChute(chutes[id], s, local(s.chain, s.pos));
    for (const m of cords.values()) m.visible = false;
    for (const c of state.cords) placeCord(c.id, local(c.chain, c.a), local(c.chain, c.b));

    // charge flashes
    let light = 0;
    for (const f of state.flashes) {
      const g = flashes.get(f.id);
      g.visible = f.k > 0;
      if (!g.visible) continue;
      const grow = 1 - f.k;
      g.position.set(0, (f.station + f.dir * grow * 2.5) * IN, 0);
      g.children[0].scale.set(r0 * (0.55 + grow * 0.3), r0 * (0.35 + grow * 0.5), r0 * (0.55 + grow * 0.3));
      g.children[1].scale.set(r0 * (0.85 + grow * 0.15), r0 * (0.7 + grow * 2.2), r0 * (0.85 + grow * 0.15));
      g.children[0].material.opacity = f.k;
      g.children[1].material.opacity = f.k * 0.75;
      flashLight.position.copy(g.position);
      light = Math.max(light, f.k);
    }
    flashLight.intensity = light * 8;

    // fire and smoke
    fire.visible = state.fire > 0;
    fireMat.uniforms.k.value = state.fire;
    fire.scale.set(1, 0.7 + 0.3 * state.fire, 1);
    fireLight.intensity = state.fire * 5;
    for (let i = 0; i < SMOKE; i++) {
      const e = smokeEmit[i];
      const age = t - (e?.te ?? 1e9), life = 2.5 + rnd(i, 1) * 2;
      if (!e || age < 0 || age > life) { smokeAlpha[i] = 0; smokeSize[i] = 0; continue; }
      const speed = 2.2 + rnd(i, 3) * 2, tau = 0.45;
      const d = speed * tau * (1 - Math.exp(-age / tau));
      const side = (rnd(i, 2) - 0.5) * 0.9 * d;
      smokePos[i * 3] = e.x + e.dx * d - e.dy * side + age * 0.12;
      smokePos[i * 3 + 1] = e.y + e.dy * d + e.dx * side + age * 0.08;
      smokePos[i * 3 + 2] = -0.2 - rnd(i, 5) * 0.4;
      smokeSize[i] = (0.35 + age * 0.5) * D;
      smokeAlpha[i] = Math.min(1, age * 5) * (1 - age / life) * 0.32;
    }
    smokeGeo.attributes.position.needsUpdate = smokeGeo.attributes.size.needsUpdate = smokeGeo.attributes.alpha.needsUpdate = true;

    // island and contact shadows
    const land = { x: toWorld(data.path.landing[0] * L.W, 0).x + L.shift, y: toWorld(0, L.groundY).y };
    island.visible = state.island.opacity > 0;
    island.position.set(land.x + state.island.offsetX, land.y, -0.6);
    islMat.opacity = state.island.opacity;
    islMat.depthWrite = state.island.opacity > 0.99;
    const groundGap = (chain) => clamp(1 - (A[chain].y - land.y) / 2.5);
    [["main", state.bodies.booster], ["payload", state.bodies.nose]].forEach(([chain, b], i) => {
      const m = shadows[i], w = local(chain, b);
      m.visible = island.visible;
      m.position.set(w.x, land.y + 0.005, -0.2);
      m.scale.set(1.8 * D, 1, 0.9);
      m.material.opacity = state.island.opacity * groundGap(chain);
    });

    // trail behind the leading chain
    const lead = state.altFt.split ? state.anchors.main : state.anchors.shared;
    const p1 = lead.p, p0 = Math.max(0, p1 - 0.22);
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const a = p0 + ((p1 - p0) * i) / TRAIL_STEPS, b = p0 + ((p1 - p0) * (i + 1)) / TRAIL_STEPS, pts = [];
      for (let j = 0; j <= 6; j++) {
        const pj = a + ((b - a) * j) / 6;
        const w = anchorWorld({ ...tl.path.pathAt(pj), p: pj });
        pts.push(w.x, w.y, -0.5);
      }
      trail[i].geometry.setPositions(pts);
      trail[i].visible = p1 - p0 > 0.002 && !state.altFt.split;
    }

    if (readout.time) {
      const txt = (el, s) => { if (el.textContent !== s) el.textContent = s; };
      txt(readout.time, `T+ ${state.t.toFixed(1)} s`);
      txt(readout.alt, state.altFt.split ? `Main ${ft(state.altFt.main)} / Payload ${ft(state.altFt.payload)}` : `Altitude ${ft(state.altFt.main)}`);
      txt(readout.phase, state.phase.label);
    }
  }

  // ---- text rule: a piece whose screen rect overlaps a text block fades to FADE_TO ----
  const pieceIds = ["booster", "middle", "payload", "nose", "chute-drogue", "chute-main", "chute-payload"];
  const pieceObject = (id) => (id.startsWith("chute-") ? chutes[id.slice(6)].group : bodies[id]);
  function pieceRects() {
    const cr = root.getBoundingClientRect(), mr = mount.getBoundingClientRect();
    renderer.getSize(res);
    return pieceIds.map((id) => {
      const obj = pieceObject(id);
      box.makeEmpty();
      obj.updateWorldMatrix(true, true);
      // Only meshes that are actually drawn (hidden flash spheres and closed canopies would inflate the rect).
      obj.traverseVisible((o) => { if (o.isMesh && o !== fire) { o.geometry.boundingBox ?? o.geometry.computeBoundingBox(); tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmpBox); } });
      if (box.isEmpty()) return { id, rect: null };
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (let i = 0; i < 8; i++) {
        v3.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        const x = ((v3.x + 1) / 2) * mr.width + mr.left - cr.left, y = ((1 - v3.y) / 2) * mr.height + mr.top - cr.top;
        l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
      }
      return { id, rect: { l, t, r, b } };
    });
  }
  const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  function updateFades(dt, snap = false) {
    let moving = false;
    const opacityOf = {};
    // Pieces of one chain (the whole rocket before separation, then each descending group) fade together.
    const chainOfPiece = (id) => (id.startsWith("chute-") ? state.chutes[id.slice(6)].chain : state.bodies[id].chain);
    const hit = {};
    const rects = pieceRects();
    for (const { id, rect } of rects) if (rect && L.text.some((tr) => overlaps(rect, tr))) hit[chainOfPiece(id)] = true;
    for (const { id } of rects) {
      const target = hit[chainOfPiece(id)] ? FADE_TO : 1;
      const cur = fade.get(id) ?? target;
      const next = snap ? target : cur + (target - cur) * Math.min(1, dt / 0.25);
      if (Math.abs(next - target) > 0.002) moving = true;
      fade.set(id, Math.abs(next - target) <= 0.002 ? target : next);
      opacityOf[id] = fade.get(id);
    }
    for (const [id, mats] of fadeables) {
      const o = opacityOf[id] ?? 1;
      for (const m of mats) {
        const base = m.userData.baseOpacity ?? (m.userData.baseOpacity = m.opacity);
        m.opacity = base * o;
        const want = o < 0.999 || base < 1;
        if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
        m.depthWrite = !want;
      }
    }
    const chain = (c) => Math.min(...Object.entries(state.bodies).filter(([, b]) => b.chain === c).map(([id]) => opacityOf[id] ?? 1));
    cordMat.opacity = Math.min(chain("main"), chain("shared"), chain("payload"));
    fireMat.uniforms.k.value = state.fire * (opacityOf.booster ?? 1);
    return moving;
  }

  // ---- playback clock ----
  let playS = 0, playing = false, last = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f({ playing, finished: playS >= PLAY_SECONDS }));
  stage.setStep((time) => {
    const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
    last = time;
    clock += dt;
    if (playing) {
      playS = Math.min(PLAY_SECONDS, playS + dt);
      apply(tl.flightAt(playS));
      fireMat.uniforms.time.value = clock;
      if (playS >= PLAY_SECONDS) { playing = false; emit(); }
    }
    fitCamera(camera);
    const fading = updateFades(dt);
    if (!playing) last = fading ? last : 0;
    return playing || fading;
  });

  addEventListener("scroll", () => stage.wake(), { passive: true });
  const relayout = () => { layout(); apply(flightT); updateFades(0, true); stage.resize(); stage.wake(); };
  new ResizeObserver(relayout).observe(root.querySelector(".usli__row"));
  addEventListener("resize", relayout);
  layout();
  apply(0);
  root.dataset.state = "live";
  stage.resize();
  updateFades(0, true);

  return {
    play() { if (playS >= PLAY_SECONDS) playS = 0; playing = true; last = 0; stage.wake(); emit(); },
    pause() { playing = false; emit(); stage.wake(); },
    restart() { playS = 0; playing = true; last = 0; apply(0); stage.wake(); emit(); },
    seek(t) { playing = false; playS = tl.playAt(t); apply(t); fitCamera(camera); updateFades(0, true); stage.wake(); emit(); },
    get playing() { return playing; },
    get finished() { return playS >= PLAY_SECONDS; },
    onChange(f) { listeners.add(f); },
    timeline: () => tl,
    debug() {
      fitCamera(camera);
      const cr = root.getBoundingClientRect();
      const toClient = (r) => r && { l: r.l + cr.left, t: r.t + cr.top, r: r.r + cr.left, b: r.b + cr.top };
      return {
        t: flightT,
        pieces: pieceRects().map((p) => ({ id: p.id, rect: toClient(p.rect), opacity: fade.get(p.id) ?? 1 })),
        text: L.text.map((r) => ({ name: r.el.className.split(" ")[0], rect: toClient(r) })),
      };
    },
    // Still frame: frame all visible pieces (and the island) on the page background, WebP.
    async snapshot(t, width, height) {
      const prev = { dpr: renderer.getPixelRatio(), clear: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
      apply(t);
      updateFades(0, true);
      for (const [, mats] of fadeables) for (const m of mats) { m.opacity = m.userData.baseOpacity ?? 1; }
      const all = new Box3();
      for (const id of pieceIds) { const o = pieceObject(id); box.setFromObject(o); if (!box.isEmpty()) all.union(box); }
      if (island.visible) { box.setFromObject(island); all.union(box); }
      const c = all.getCenter(new Vector3()), sz = all.getSize(new Vector3());
      framing = { cx: c.x, cy: c.y, h: Math.max(sz.y * 1.25, (sz.x * 1.25 * height) / width / COSY, 4.2) };
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      fitCamera(camera);
      renderer.setClearColor(C.bg, 1);
      fireMat.uniforms.k.value = state.fire;
      renderer.render(scene, camera);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.92));
      framing = null;
      renderer.setClearColor(prev.clear, prev.alpha);
      renderer.setPixelRatio(prev.dpr);
      stage.resize();
      return blob;
    },
    dispose() { stage.dispose(); },
  };
}

// Wires the controls and the autoplay rule: plays once when at least half the card (or half the viewport)
// is showing, pauses when the card leaves the viewport or the tab is hidden, stops at landing.
export async function mountUsli(root) {
  const scene = await createUsliScene(root);
  const controls = root.querySelector("[data-usli-controls]");
  const toggle = root.querySelector("[data-usli-toggle]");
  const restart = root.querySelector("[data-usli-restart]");
  controls.hidden = false;
  let auto = false, heldByVisibility = false, inView = false;
  const sync = ({ playing }) => {
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.textContent = playing ? "Pause" : "Play";
  };
  scene.onChange(sync);
  sync({ playing: false });
  toggle.addEventListener("click", () => { heldByVisibility = false; scene.playing ? scene.pause() : scene.play(); });
  restart.addEventListener("click", () => { heldByVisibility = false; scene.restart(); });

  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    const enough = e.intersectionRatio >= 0.5 || e.intersectionRect.height >= innerHeight * 0.5;
    if (enough && !auto) { auto = true; scene.play(); }
    if (!inView && scene.playing) { heldByVisibility = true; scene.pause(); }
    if (inView && heldByVisibility && !document.hidden) { heldByVisibility = false; scene.play(); }
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
  io.observe(root);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && scene.playing) { heldByVisibility = true; scene.pause(); }
    else if (!document.hidden && heldByVisibility && inView) { heldByVisibility = false; scene.play(); }
  });
  root.usliScene = scene; // QA hook for tools/check_usli_scene.mjs --browser
  return scene;
}
