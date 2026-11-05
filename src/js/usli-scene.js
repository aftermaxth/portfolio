// USLI scroll scene: the team's rocket (STL export, cut in half by a live clipping plane) flies the
// OpenRocket timeline from content/usli-flight.json as the card scrolls. Lazy chunk, loaded by projects.js
// near the viewport and only when reduced motion is off. Renders only while visible (render.js).
//
//   const scene = await createUsliScene(root)   // root = [data-usli]
//   scene.setProgress(p)                        // p in 0..1 (pin progress)
//   scene.snapshot(t, w, h)                     // still frame as a WebP blob (stills in images/nasa-student-launch/)
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Plane, PointLight, Points, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createStage } from "./render.js";
import { ALT, createTimeline, IN, Z_CHECKPOINTS } from "./usli-timeline.js";
import data from "../../content/usli-flight.json";

const MODEL_URL = `${import.meta.env.BASE_URL}models/usli/rocket.glb`;
const AXIS = 0.19325; // the STL export's rocket axis sits at x = z = 193.25 mm
const CREASE = MathUtils.degToRad(35);
const YAW = 0.32, ELEVATION = 0.1;

const BODY_OF = (name) => (
  /^(Body_Bot|Motor_Mount|centering_ring|newFin|bulkhead2)/.test(name) ? "booster"
    : /^(Body_Mid|Body_Top2|couplerBot)/.test(name) ? "middle"
      : /^(Body_Top-|tube_coupler_top|payloadCenterRing)/.test(name) ? "payload"
        : /^(Nosecone|noseconeBulkhead)/.test(name) ? "nose" : null
);

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export async function createUsliScene(root) {
  const tl = createTimeline(data);
  const S = tl.stations;
  const R = S.radiusIn * IN;
  const C = {
    accent: new Color(token("--color-accent")), ink: new Color(token("--color-ink")), muted: new Color(token("--color-ink-muted")),
    rule: new Color(token("--color-rule")), surface2: new Color(token("--color-surface-2")), grass: new Color(token("--color-grass")),
    bg: new Color(token("--color-bg")),
  };
  const narrow = matchMedia("(max-width: 599px)").matches;
  const mount = root.querySelector("[data-usli-canvas]");
  const stage = await createStage(mount, {
    fov: 30, exposure: 1.05, canvasClass: "usli__canvas",
    label: "Cutaway animation of the team's rocket flying its simulated launch and recovery. The steps are listed below.",
  });
  const { renderer, scene, camera, canvas } = stage;
  canvas.setAttribute("aria-describedby", root.querySelector("[data-usli-sequence]").id);
  renderer.localClippingEnabled = true;
  const cut = [new Plane(new Vector3(0, 0, -1), 0)]; // keep z <= 0: the half facing the camera is cut away

  // ---- the rocket: one group per body, parts in CAD coordinates (axis at x = z = 0, y = meters from the aft end) ----
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const bodies = { booster: new Group(), middle: new Group(), payload: new Group(), nose: new Group() };
  Object.values(bodies).forEach((b) => scene.add(b));
  const solid = (geometry, color, parent, { rough = 0.65 } = {}) => {
    const face = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: rough, metalness: 0, clippingPlanes: cut }));
    // Cap: the inside of a cut solid, drawn flat so it reads as a cut face instead of a hollow shell.
    const cap = new Mesh(geometry, new MeshBasicMaterial({ color: color.clone().multiplyScalar(0.5), side: BackSide, clippingPlanes: cut }));
    parent.add(face, cap);
    return face;
  };
  const parts = [];
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
    const rough = node.material.roughness ?? 0.65;
    parts.push(solid(geometry, node.material.color.clone(), bodies[body], { rough }));
  });
  if (parts.length !== 21) console.info(`USLI scene: ${parts.length} parts loaded`);

  // Motor: not in the CAD, so a plain cylinder inside the motor mount (79.2 mm OD, 508 mm long, from the STL).
  const motor = new CylinderGeometry(0.037, 0.037, 0.5, 32).translate(0, 0.25 + 0.004, 0);
  solid(motor, C.rule, bodies.booster);

  // Shear pins: 3 per joint, each split into an outer and an inner half that part at separation.
  const pinGeo = (r0, r1) => new CylinderGeometry(0.0035, 0.0035, r1 - r0, 8).rotateZ(Math.PI / 2).translate((r0 + r1) / 2, 0, 0);
  const pins = (station, outer, inner) => {
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3;
      for (const [body, r0, r1] of [[outer, R - 0.006, R + 0.004], [inner, R - 0.018, R - 0.006]]) {
        const g = pinGeo(r0, r1).rotateY(-a).translate(0, station * IN, 0);
        solid(g, C.accent, bodies[body]);
      }
    }
  };
  pins(S.pins.apogee, "booster", "middle");
  pins(S.pins.main, "middle", "payload");

  // ---- motor fire (gradients allowed inside an exhaust plume) and smoke ----
  const plumeMat = (inner) => new ShaderMaterial({
    uniforms: { k: { value: 0 }, white: { value: C.ink.clone().lerp(new Color(1, 1, 1), 0.6) }, accent: { value: C.accent } },
    vertexShader: "varying float v; void main(){ v = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float k; uniform vec3 white; uniform vec3 accent; varying float v;
      void main(){ float a = pow(1.0 - v, ${inner ? "2.2" : "1.4"}) * k; vec3 c = ${inner ? "white" : "mix(white, accent, smoothstep(0.0, 0.45, v))"}; gl_FragColor = vec4(c * a, a); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
  });
  const cone = (r, h, inner) => new Mesh(new ConeGeometry(r, h, 24, 1, true).rotateX(Math.PI).translate(0, -h / 2, 0), plumeMat(inner));
  const fire = new Group();
  const fireOuter = cone(0.055, 0.95, false), fireInner = cone(0.03, 0.45, true);
  fire.add(fireOuter, fireInner);
  fire.position.y = 0.004;
  bodies.booster.add(fire);

  const SMOKE = narrow ? 160 : 420;
  const smokeGeo = new BufferGeometry();
  const smokePos = new Float32Array(SMOKE * 3), smokeSize = new Float32Array(SMOKE), smokeAlpha = new Float32Array(SMOKE);
  smokeGeo.setAttribute("position", new BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute("size", new BufferAttribute(smokeSize, 1));
  smokeGeo.setAttribute("alpha", new BufferAttribute(smokeAlpha, 1));
  const smokeMat = new ShaderMaterial({
    uniforms: { color: { value: C.muted }, scale: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float scale;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: "uniform vec3 color; varying float vA; void main(){ if (length(gl_PointCoord - 0.5) > 0.5) discard; gl_FragColor = vec4(color, vA); }",
    transparent: true, depthWrite: false,
  });
  const smoke = new Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const rand = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

  const updateSmoke = (t) => {
    const T = tl.times;
    for (let i = 0; i < SMOKE; i++) {
      const te = T.liftoff + (i / SMOKE) * (T.burnout - T.liftoff);
      const age = t - te, life = 3 + rand(i, 1) * 2;
      if (age < 0 || age > life) { smokeAlpha[i] = 0; smokeSize[i] = 0; continue; }
      const y0 = tl.altShared(te) * ALT;
      const vx = (rand(i, 2) - 0.5) * 1.2, vy = -(2 + rand(i, 3) * 2), tau = 0.5;
      const d = tau * (1 - Math.exp(-age / tau));
      smokePos[i * 3] = vx * d + (rand(i, 4) - 0.5) * 0.04;
      smokePos[i * 3 + 1] = y0 + vy * d + age * 0.05;
      smokePos[i * 3 + 2] = (rand(i, 5) - 0.5) * 0.3 - 0.1;
      smokeSize[i] = 0.1 + age * 0.22;
      smokeAlpha[i] = Math.min(1, age * 6) * (1 - age / life) * 0.55;
    }
    smokeGeo.attributes.position.needsUpdate = smokeGeo.attributes.size.needsUpdate = smokeGeo.attributes.alpha.needsUpdate = true;
  };

  // ---- charge flashes: solid white core, accent shell, and a point light in the bay ----
  const flashLight = new PointLight(C.accent, 0, 1.5, 2);
  scene.add(flashLight);
  const flashes = new Map();
  const flashMesh = (color, opacity) => new Mesh(new SphereGeometry(1, 24, 16), new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  for (const id of ["drogue-charge-primary", "drogue-charge-backup", "main-charge", "main-charge-backup"]) {
    const g = new Group();
    g.add(flashMesh(new Color(1, 1, 1), 1), flashMesh(C.accent, 0.8));
    g.visible = false;
    scene.add(g);
    flashes.set(id, g);
  }

  // ---- parachutes: gores alternate accent and ink (stylized), lines meet at the confluence point ----
  function canopy(gores) {
    const pos = [], col = [], STEPS = 10, ACROSS = 4;
    for (let g = 0; g < gores; g++) {
      const color = g % 2 ? C.ink : C.accent;
      const a0 = (g / gores) * Math.PI * 2, a1 = ((g + 1) / gores) * Math.PI * 2;
      const point = (v, u) => {
        const a = a0 + (a1 - a0) * u;
        const bulge = 1 + 0.06 * Math.sin(Math.PI * u) * Math.sin((v * Math.PI) / 2);
        const r = Math.sin((v * Math.PI) / 2) * bulge, h = Math.cos((v * Math.PI) / 2) * 0.45;
        return [Math.cos(a) * r, h, Math.sin(a) * r];
      };
      for (let s = 0; s < STEPS; s++) for (let u = 0; u < ACROSS; u++) {
        const v0 = s / STEPS, v1 = (s + 1) / STEPS, u0 = u / ACROSS, u1 = (u + 1) / ACROSS;
        const q = [point(v0, u0), point(v1, u0), point(v1, u1), point(v0, u1)];
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); col.push(color.r, color.g, color.b); }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const chutes = {};
  for (const id of ["drogue", "main", "payload"]) {
    const spec = tl.stateAt(0).chutes[id];
    const group = new Group();
    const dome = new Mesh(canopy(spec.gores), new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide }));
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(spec.gores * 6), 3));
    const lines = new LineSegments(lineGeo, new LineBasicMaterial({ color: C.muted }));
    lines.frustumCulled = false;
    const bundleLen = { drogue: 0.2, main: 0.42, payload: 0.18 }[id];
    const bundle = new Mesh(new CylinderGeometry(0.06, 0.06, bundleLen, 20), new MeshStandardMaterial({ color: id === "main" ? C.accent : C.ink, roughness: 0.9 }));
    group.add(dome, lines, bundle);
    if (id === "payload") { // stand-in for the release device band (not modeled in detail)
      const band = new Mesh(new TorusGeometry(0.064, 0.012, 8, 24).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: C.surface2, roughness: 0.5 }));
      bundle.add(band);
      chutes[id] = { group, dome, lines, bundle, band, spec };
    } else chutes[id] = { group, dome, lines, bundle, spec };
    scene.add(group);
  }
  const placeChute = (c, s) => {
    const { group, dome, lines, bundle, band } = c;
    group.position.set(s.pos.x, s.pos.y, -0.02);
    group.rotation.z = s.rot;
    const open = s.deployed ? s.inflate : 0;
    bundle.visible = open < 0.35;
    bundle.scale.setScalar(1 - open);
    if (band) band.visible = s.held;
    dome.visible = lines.visible = s.deployed && open > 0.01;
    if (!dome.visible) return;
    const r = MathUtils.lerp(0.05, s.diameter / 2, open ** 0.8);
    const stretch = MathUtils.lerp(3.2, 1, open);
    const skirt = s.lineLength * MathUtils.lerp(0.7, 1, open);
    dome.scale.set(r, r * stretch, r);
    dome.position.y = skirt;
    const p = lines.geometry.attributes.position.array, n = p.length / 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.set([Math.cos(a) * r, skirt, Math.sin(a) * r, 0, 0, 0], i * 6);
    }
    lines.geometry.attributes.position.needsUpdate = true;
  };

  // ---- shock cords (fat lines, a slight sag) ----
  const cordMat = new LineMaterial({ color: C.ink, linewidth: 2, worldUnits: false });
  const cords = new Map();
  const SAG_POINTS = 9;
  const placeCord = (id, a, b) => {
    let c = cords.get(id);
    if (!c) { c = new Line2(new LineGeometry(), cordMat); c.frustumCulled = false; scene.add(c); cords.set(id, c); }
    const pts = [], len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / (len || 1), ny = (b.x - a.x) / (len || 1);
    for (let i = 0; i < SAG_POINTS; i++) {
      const u = i / (SAG_POINTS - 1), sag = Math.sin(Math.PI * u) * len * 0.035;
      pts.push(a.x + (b.x - a.x) * u + nx * sag, a.y + (b.y - a.y) * u + ny * sag, -0.01);
    }
    c.geometry.setPositions(pts);
    c.visible = true;
  };

  // ---- landing island (fades in on final approach); its top is the one new color, --color-grass ----
  const island = new Group();
  const { radius: IR, depth: ID } = tl.stateAt(0).island;
  const islandTop = new Mesh(new CylinderGeometry(IR, IR, 0.04, 48).translate(0, -0.02, 0), new MeshStandardMaterial({ color: C.grass, roughness: 0.95, transparent: true }));
  const islandSide = new Mesh(new CylinderGeometry(IR, IR * 0.65, ID, 48).translate(0, -0.04 - ID / 2, 0), new MeshStandardMaterial({ color: C.surface2, roughness: 0.95, transparent: true }));
  island.add(islandTop, islandSide);
  scene.add(island);

  // ---- camera: fit the state's box, place it in the screen lane ----
  let state = tl.stateAt(0);
  // Lanes: from 900 px the text column sits on the right, so the clear lane is the space left of it and
  // the crossing lane is the column itself (measured, so it follows the real layout). Below 900 px: centered.
  const wide = matchMedia("(min-width: 900px)");
  const lanes = { left: 0.5, right: 0.5, fit: 0.82 };
  let snapping = false, measuredFor = "";
  const measure = () => {
    const key = `${canvas.clientWidth}x${canvas.clientHeight}:${wide.matches}:${snapping}`;
    if (key === measuredFor) return;
    measuredFor = key;
    const body = root.querySelector(".usli__row .project__body"), row = root.querySelector(".usli__row");
    if (snapping || !wide.matches || !body || !canvas.clientWidth) return Object.assign(lanes, { left: 0.5, right: 0.5, fit: 0.82 });
    const c = canvas.getBoundingClientRect(), b = body.getBoundingClientRect(), r = row.getBoundingClientRect();
    const start = r.left + parseFloat(getComputedStyle(row).paddingLeft);
    lanes.left = ((start + b.left) / 2 - c.left) / c.width;
    lanes.right = ((b.left + b.right) / 2 - c.left) / c.width;
    lanes.fit = ((b.left - start) * 0.85) / c.width;
  };
  const resolution = new Vector2();
  stage.setFit((cam) => {
    measure();
    const laneFrac = lanes.left, fitWidth = lanes.fit;
    const b = state.box;
    const w = Math.max(b.x1 - b.x0, 1.2), h = Math.max(b.y1 - b.y0, 3.6);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const vfov = MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    // Vertical: fit into the upper 74 percent, centered at 42 percent, so the readout at the bottom stays clear.
    const dist = Math.max((h / 2) / Math.tan(vfov / 2) / 0.74, (w / 2) / Math.tan(hfov / 2) / fitWidth);
    cam.position.set(cx + Math.sin(YAW) * dist, cy + Math.sin(ELEVATION) * dist, Math.cos(YAW) * dist);
    cam.lookAt(cx, cy, 0);
    cam.near = Math.max(0.05, dist * 0.2);
    cam.far = dist * 3 + 10;
    renderer.getSize(resolution);
    const lane = MathUtils.lerp(laneFrac, lanes.right, state.lane);
    cam.setViewOffset(resolution.x, resolution.y, (0.5 - lane) * resolution.x, snapping ? 0 : 0.08 * resolution.y, resolution.x, resolution.y);
    cam.updateProjectionMatrix();
    cordMat.resolution.copy(resolution);
    smokeMat.uniforms.scale.value = resolution.y / (2 * Math.tan(vfov / 2));
  });

  // ---- apply a state ----
  const readout = {
    time: root.querySelector("[data-r-time]"), alt: root.querySelector("[data-r-alt]"), phase: root.querySelector("[data-r-phase]"),
  };
  const ft = (v) => `${Math.round(v).toLocaleString("en-US")} ft`;
  function apply(t) {
    state = tl.stateAt(t);
    for (const [id, pose] of Object.entries(state.bodies)) {
      bodies[id].position.set(pose.x, pose.y, 0);
      bodies[id].rotation.z = pose.rot;
    }
    for (const [id, s] of Object.entries(state.chutes)) placeChute(chutes[id], s);
    for (const c of cords.values()) c.visible = false;
    for (const c of state.cords) placeCord(c.id, c.a, c.b);
    let light = 0;
    for (const f of state.flashes) {
      const g = flashes.get(f.id);
      g.visible = f.k > 0;
      if (!g.visible) continue;
      const grow = 1 - f.k;
      g.position.set(f.x, f.y, -0.02);
      g.children[0].scale.set(R * (0.45 + grow * 0.5), R * (0.6 + grow * 1.2), R * (0.45 + grow * 0.5));
      g.children[1].scale.set(R * (0.8 + grow * 1.4), R * (1.1 + grow * 2.6), R * (0.8 + grow * 1.4));
      g.children[0].material.opacity = f.k;
      g.children[1].material.opacity = f.k * 0.8;
      flashLight.position.set(f.x, f.y, -0.03);
      light = Math.max(light, f.k);
    }
    flashLight.intensity = light * 6;
    fire.visible = state.fire > 0;
    updateSmoke(state.t);
    island.visible = state.island.opacity > 0;
    island.position.set(state.island.x, state.island.y, -0.2);
    islandTop.material.opacity = islandSide.material.opacity = state.island.opacity;
    islandTop.material.depthWrite = islandSide.material.depthWrite = state.island.opacity > 0.99;
    if (readout.time) {
      readout.time.textContent = `T+ ${state.t.toFixed(1)} s`;
      readout.alt.textContent = state.altFt.split ? `Main ${ft(state.altFt.main)} / Payload ${ft(state.altFt.payload)}` : `Altitude ${ft(state.altFt.main)}`;
      readout.phase.textContent = state.phase.label;
    }
    stage.frame();
  }

  stage.setStep((time) => {
    if (state.fire > 0) {
      const f = 1 + Math.sin(time * 0.045) * 0.06 + Math.sin(time * 0.11) * 0.04;
      fireOuter.scale.set(1, f * state.fire, 1);
      fireInner.scale.set(1, (2 - f) * state.fire, 1);
      fireOuter.material.uniforms.k.value = fireInner.material.uniforms.k.value = state.fire;
      return true; // flicker while the motor burns
    }
    return false;
  });

  let currentT = -1;
  const setTime = (t) => { if (Math.abs(t - currentT) < 1e-4) return; currentT = t; apply(t); stage.wake(); };
  setTime(0);
  root.dataset.state = "live";
  stage.resize();

  return {
    timeline: tl,
    setProgress(p) { setTime(tl.timeAt(p)); },
    setTime,
    // Still frame for the no-motion fallback: subject centered, page background, WebP.
    async snapshot(t, width, height) {
      const prev = { dpr: renderer.getPixelRatio(), clear: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
      snapping = true;
      apply(t);
      state = { ...state, lane: 0 };
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      stage.frame();
      renderer.setClearColor(C.bg, 1);
      fireOuter.material.uniforms.k.value = fireInner.material.uniforms.k.value = state.fire;
      fireOuter.scale.set(1, state.fire || 1, 1); fireInner.scale.set(1, state.fire || 1, 1);
      renderer.render(scene, camera);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.9));
      snapping = false;
      renderer.setClearColor(prev.clear, prev.alpha);
      renderer.setPixelRatio(prev.dpr);
      currentT = -1;
      stage.resize();
      return blob;
    },
    dispose() { stage.dispose(); },
  };
}

// Pins the scene to the card's scroll: progress drives the flight time, and two checkpoints move the
// canvas behind the text column for the drogue descent crossing (Z_CHECKPOINTS in usli-timeline.js).
export async function mountUsli(root) {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
  gsap.registerPlugin(ScrollTrigger);
  const scene = await createUsliScene(root);
  const track = root.querySelector("[data-usli-track]");
  const header = () => document.querySelector(".site-header")?.offsetHeight || 0;
  const pin = ScrollTrigger.create({
    trigger: track, start: () => `top ${header()}`, end: "bottom bottom",
    onUpdate: (self) => scene.setProgress(self.progress),
    onRefresh: (self) => scene.setProgress(self.progress),
  });
  const at = (p) => () => pin.start + p * (pin.end - pin.start);
  const [behind, front] = Z_CHECKPOINTS;
  ScrollTrigger.create({
    trigger: track, start: at(behind.p), end: at(front.p),
    onToggle: (self) => track.toggleAttribute("data-behind", self.isActive),
  });
  // The text block sticks inside the pinned span: a short block at the top, a tall one (write-up open)
  // scrolls through first and then holds at its bottom edge, so the rocket can cross it later in the pin.
  const body = root.querySelector(".usli__row .project__body");
  const stick = () => root.style.setProperty("--usli-body-top", `${Math.min(header() + 32, innerHeight - body.offsetHeight - 32)}px`);
  new ResizeObserver(() => { stick(); ScrollTrigger.refresh(); }).observe(body);
  addEventListener("resize", stick);
  stick();
  ScrollTrigger.refresh();
  return scene;
}
