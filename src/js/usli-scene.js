// USLI recovery sequence: the team's rocket (STL export, whole and solid) flies the OpenRocket timeline from
// content/usli-flight.json on its own clock (about 40 s, src/js/usli-timeline.js) and lands on a grey sheet.
// Lazy chunk: projects.js loads it only when the write-up opens (or when Play is pressed with reduced motion).
// Renders only while the player is visible (render.js). Nothing autoplays.
//
//   const scene = await mountUsli(root)   // root = the player ([data-usli]); sets data-state="live"
//   scene.play() / pause() / restart() / seek(t)
//   scene.snapshot(t, w, h)              // still frame as a WebP blob (images/nasa-student-launch/)
//   scene.debug()                        // QA: pieces in canvas px and world meters (tools/check_usli_scene.mjs --browser)
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Group, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  PCFSoftShadowMap, PlaneGeometry, PointLight, ShaderMaterial, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector2, Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { createStage } from "./render.js";
import { createTimeline, IN, PLAY_SECONDS } from "./usli-timeline.js";
import data from "../../content/usli-flight.json";

const MODEL_URL = `${import.meta.env.BASE_URL}models/usli/rocket.glb`;
const AXIS = 0.19325; // the STL export's rocket axis sits at x = z = 193.25 mm
const CREASE = MathUtils.degToRad(35);
// One fixed lens and one view height for the whole run: the camera only translates (smoothed follow), never zooms.
const FOV = 20;
const YAW = 0.24; // camera a little to the left, so the tubes read round against the key light from the right
const PITCH = -0.1; // looking down a little, so the sheet reads as a surface
const VIEW_H = 11.5; // meters of world visible top to bottom (wide canvases)
const MIN_VIEW_W = 10.5; // meters of world visible left to right (narrow canvases grow the view height instead)
const GROUND_MARGIN = 1.1; // the view never drops so low that the sheet line sits more than this above the bottom edge
const FOLLOW_S = 0.55; // follow time constant, seconds
const BAND = 0.3; // the focus never leaves the middle 2 x BAND of the frame (fast climb)
const LADDER_FT = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500];

// Part classes by node name (the GLB keeps the STL file names).
const BODY_OF = (n) => (/^(Body_Bot|Motor_Mount|centering_ring|newFin|bulkhead2)/.test(n) ? "booster"
  : /^(Body_Mid|Body_Top2|couplerBot)/.test(n) ? "middle"
    : /^(Body_Top-|tube_coupler_top|payloadCenterRing)/.test(n) ? "payload"
      : /^(Nosecone|noseconeBulkhead)/.test(n) ? "nose" : null);
const CLASS_OF = (n) => (/^Body_Mid/.test(n) ? "switchband"
  : /^(Body_Bot|Body_Top|Nosecone)/.test(n) ? "tube"
    : /Bulkhead/i.test(n) ? "metal"
      : /^newFin/.test(n) ? "fin" : "inner");
const BODY_IDS = ["booster", "middle", "payload", "nose"];
const CHUTE_IDS = ["drogue", "main", "payload"];

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export async function createUsliScene(root) {
  const C = {
    accent: new Color(token("--color-accent")), ink: new Color(token("--color-ink")), muted: new Color(token("--color-ink-muted")),
    bg: new Color(token("--color-bg")),
  };
  const mount = root.querySelector("[data-usli-canvas]");
  const tagEl = root.querySelector("[data-usli-tag]");
  const stage = await createStage(mount, {
    fov: FOV, exposure: 1.0, canvasClass: "usli__canvas",
    label: "Animation of the team's rocket flying its simulated launch and recovery and landing on a grey sheet. The steps are listed below.",
  });
  const { renderer, scene, camera, canvas, key } = stage;
  canvas.setAttribute("aria-describedby", root.querySelector("[data-usli-sequence]").id);

  // This stage has its own renderer (render.js), so the shadow map and lights below change no other viewer.
  // The key light's shadow map is the one extra render pass.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top = 7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key.target);
  const KEY_DIR = new Vector3(3, 5, 4).normalize();
  const rim = new DirectionalLight(0xffffff, 0.6); // weak light from behind left, so edges separate from the page
  rim.position.set(-4, 3, -5);
  scene.add(rim);

  const tl = createTimeline(data);
  const S = tl.stations;
  const D = tl.diameterScale;
  const R = tl.radius;

  // ---- materials: physically based per part class, neutral structure ----
  // Subtle procedural roughness variation (a winding pattern plus fine grain) so the composite does not read as plastic.
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
  const physical = (color, { grain: amount = 0.06, ...o }) => grain(new MeshPhysicalMaterial({ color, envMapIntensity: 1.0, ...o }), amount);
  const offWhite = C.ink.clone().multiplyScalar(0.94);
  const graphite = C.muted.clone().multiplyScalar(0.32);
  const MAT = {
    tube: physical(offWhite, { roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.22 }),
    fin: physical(offWhite.clone().multiplyScalar(0.9), { roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3, grain: 0.08 }),
    switchband: physical(C.accent, { roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    inner: physical(offWhite.clone().multiplyScalar(0.72), { roughness: 0.6, metalness: 0, clearcoat: 0.1 }),
    metal: physical(graphite, { roughness: 0.3, metalness: 0.9, grain: 0.04 }),
  };

  // ---- the rocket: body group (pose) > scaler (diameter x D) > parts in CAD coordinates ----
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const bodies = {}, scalers = {};
  for (const id of BODY_IDS) {
    bodies[id] = new Group();
    scalers[id] = new Group();
    scalers[id].scale.set(D, 1, D);
    bodies[id].add(scalers[id]);
    scene.add(bodies[id]);
  }
  const part = (geometry, material, parent) => {
    const m = new Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const body = BODY_OF(node.name);
    if (!body) return;
    // Positions are quantized (int16) in the GLB: copy them to floats before baking the node transform.
    const src = node.geometry.attributes.position, flat = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) { flat[i * 3] = src.getX(i); flat[i * 3 + 1] = src.getY(i); flat[i * 3 + 2] = src.getZ(i); }
    const raw = new BufferGeometry();
    raw.setAttribute("position", new BufferAttribute(flat, 3));
    if (node.geometry.index) raw.setIndex(node.geometry.index.clone());
    const geometry = toCreasedNormals(raw.applyMatrix4(node.matrixWorld), CREASE);
    geometry.translate(-AXIS, 0, -AXIS);
    part(geometry, MAT[CLASS_OF(node.name)], scalers[body]);
  });
  // Motor: not in the CAD, so a plain cylinder inside the motor mount (79.2 mm OD, 508 mm long, from the STL).
  part(new CylinderGeometry(0.037, 0.037, 0.5, 32).translate(0, 0.254, 0), MAT.metal, scalers.booster);
  // Rail buttons: 2 (JSON), at the stations measured from the schematic, on the booster wall facing the camera side.
  const buttonGeo = new CylinderGeometry(0.011, 0.011, 0.016, 16).rotateZ(Math.PI / 2);
  for (const st of S.railButtons) part(buttonGeo, MAT.metal, bodies.booster).position.set(-(R + 0.008), st * IN, 0);

  // ---- engine: one soft additive glow and a short plume (white-hot core, orange edge), fading out at burnout ----
  const plumeMat = new ShaderMaterial({
    uniforms: { k: { value: 0 }, time: { value: 0 }, white: { value: new Color(1, 0.96, 0.88) }, accent: { value: C.accent } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float k; uniform float time; uniform vec3 white; uniform vec3 accent; varying vec2 vUv;
      void main(){
        float along = vUv.y;                                   // 0 at the nozzle, 1 at the tail
        float across = abs(vUv.x - 0.5) * 2.0;
        float flicker = 0.92 + 0.08 * sin(time * 31.0 + along * 9.0) * sin(time * 17.0);
        float width = mix(0.42, 1.0, smoothstep(0.0, 0.5, along)) * (1.0 - 0.35 * along);
        float body = 1.0 - smoothstep(width * 0.25, width, across);
        float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.05, along);
        float a = body * fade * k * flicker;
        float hot = 1.0 - smoothstep(0.0, 0.6, across / max(width, 0.01) + along * 1.3);
        gl_FragColor = vec4(mix(accent, white, hot) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
  });
  const PLUME_LEN = 0.95, PLUME_W = R * 2.2;
  const plumeGeo = new PlaneGeometry(PLUME_W, PLUME_LEN).translate(0, -PLUME_LEN / 2, 0);
  const uv = plumeGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // uv.y 0 at the nozzle
  const plume = new Mesh(plumeGeo, plumeMat);
  plume.rotation.y = -YAW; // faces the camera
  bodies.booster.add(plume);
  const glowTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,236,210,1)"); grad.addColorStop(0.25, "rgba(255,160,70,0.55)"); grad.addColorStop(1, "rgba(255,129,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
  })();
  const glow = new Sprite(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  glow.scale.setScalar(1.3);
  scene.add(glow);
  const engineLight = new PointLight(new Color(1, 0.62, 0.3), 0, 9, 1.6);
  scene.add(engineLight);

  // ---- parachutes: cloth gores with seams, slight sheen, double sided, gentle billow ----
  const CLOTH = 0.4; // a darker base keeps the accent orange (not peach) after AgX tone mapping in the lit areas
  function canopyGeometry(gores) {
    const PER = 8, A = gores * PER, V = 16;
    const pos = new Float32Array((A + 1) * (V + 1) * 3), col = new Float32Array((A + 1) * (V + 1) * 3), idx = [];
    for (let v = 0; v <= V; v++) {
      const phi = (v / V) * (Math.PI / 2);
      for (let a = 0; a <= A; a++) {
        const ang = (a / A) * Math.PI * 2, local = (a % PER) / PER, gore = Math.floor(a / PER) % gores;
        const bulge = 1 + 0.055 * Math.sin(Math.PI * local) * Math.sin(phi); // each gore bellies out between its seams
        const r = Math.sin(phi) * bulge, h = Math.cos(phi) * 0.5 - 0.035 * Math.sin(Math.PI * local) * Math.sin(phi * 2);
        const i = (v * (A + 1) + a) * 3;
        pos[i] = Math.cos(ang) * r; pos[i + 1] = h; pos[i + 2] = Math.sin(ang) * r;
        let shade = gore % 2 ? 0.86 : 1; // alternate gores a step darker, all in the accent
        if (local === 0) shade *= 0.6; // seam
        if (v >= V - 1) shade *= 0.72; // reinforced skirt band
        if (v <= 1) shade *= 0.8; // vent band
        col[i] = C.accent.r * shade * CLOTH; col[i + 1] = C.accent.g * shade * CLOTH; col[i + 2] = C.accent.b * shade * CLOTH;
      }
    }
    for (let v = 0; v < V; v++) for (let a = 0; a < A; a++) {
      const p = v * (A + 1) + a, q = p + A + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("color", new BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const clothMat = new MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.5, sheenColor: C.accent.clone().lerp(new Color(1, 1, 1), 0.35),
    side: DoubleSide, envMapIntensity: 0.45,
  });
  const lineMat = new LineBasicMaterial({ color: C.muted.clone().multiplyScalar(0.85) });
  const bagMat = new MeshPhysicalMaterial({ color: offWhite.clone().multiplyScalar(0.7), roughness: 0.85, sheen: 0.4, sheenColor: new Color(1, 1, 1) });
  const chutes = {};
  const spec0 = tl.stateInto(0).chutes;
  for (const id of CHUTE_IDS) {
    const spec = spec0[id];
    const group = new Group();
    const dome = new Mesh(canopyGeometry(spec.gores), clothMat);
    dome.castShadow = dome.receiveShadow = true;
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(spec.gores * 6), 3));
    const lines = new LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    const bundleLen = { drogue: 0.2, main: 0.42, payload: 0.18 }[id];
    const bundle = new Mesh(new CylinderGeometry(0.06 * D, 0.06 * D, bundleLen, 20), bagMat);
    bundle.castShadow = true;
    group.add(dome, lines, bundle);
    const entry = { group, dome, lines, bundle, band: null, phase: id.length * 1.7 };
    if (id === "payload") { // stand-in for the release device band (not modeled in detail)
      entry.band = new Mesh(new TorusGeometry(0.064 * D, 0.012 * D, 8, 24).rotateX(Math.PI / 2), MAT.metal);
      bundle.add(entry.band);
    }
    chutes[id] = entry;
    scene.add(group);
  }
  let clock = 0;
  function placeChute(c, s, x, y) {
    const { group, dome, lines, bundle, band } = c;
    group.position.set(x, y, -0.05);
    group.rotation.z = s.rot;
    const open = s.deployed ? s.inflate : 0;
    group.visible = s.deployed;
    bundle.visible = open < 0.35;
    bundle.scale.setScalar(1 - open);
    if (band) band.visible = s.held;
    dome.visible = lines.visible = s.deployed && open > 0.01;
    if (!dome.visible) return;
    lines.visible = s.settle < 0.5;
    const billow = 1 + 0.022 * Math.sin(clock * 1.7 + c.phase) * open;
    const r = MathUtils.lerp(0.05, s.diameter / 2, open ** 0.8);
    const stretch = MathUtils.lerp(3.2, 1, open);
    const skirt = s.lineLength * MathUtils.lerp(0.7, 1, open);
    const flat = 1 - 0.94 * s.settle;
    dome.scale.set(r * billow * (1 + 0.25 * s.settle), r * stretch * (2 - billow) * flat, r * billow * (1 + 0.25 * s.settle));
    dome.position.y = skirt * flat;
    const p = lines.geometry.attributes.position.array, n = p.length / 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, j = i * 6;
      p[j] = Math.cos(a) * r * billow; p[j + 1] = skirt; p[j + 2] = Math.sin(a) * r * billow;
      p[j + 3] = 0; p[j + 4] = 0; p[j + 5] = 0;
    }
    lines.geometry.attributes.position.needsUpdate = true;
  }

  // ---- shock cords: thin matte tubes ----
  const cordMat = new MeshStandardMaterial({ color: C.muted.clone().multiplyScalar(0.8), roughness: 0.92 });
  const cordGeo = new CylinderGeometry(0.012, 0.012, 1, 8).translate(0, 0.5, 0);
  const cordMeshes = tl.stateInto(0).cords.map(() => {
    const m = new Mesh(cordGeo, cordMat);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return m;
  });
  function placeCord(m, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    m.position.set(ax, ay, -0.05);
    m.scale.set(1, Math.max(len, 1e-4), 1);
    m.rotation.z = Math.atan2(-dx, dy);
    m.visible = true;
  }

  // ---- landing sheet: large grey, shiny but not a mirror, soft shadows; edges fade into the page background ----
  const SHEET_CENTER = new Vector2(0, -2); // follows the camera, so the lit floor is always around the subject
  const res = new Vector2();
  const sheetMat = new MeshPhysicalMaterial({
    color: C.muted.clone().multiplyScalar(0.22), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2,
    envMapIntensity: 0.4, transparent: true,
  });
  sheetMat.onBeforeCompile = (sh) => {
    sh.uniforms.sheetCenter = { value: SHEET_CENTER };
    sh.uniforms.viewRes = { value: res };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSheet;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSheet = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSheet; uniform vec2 sheetCenter; uniform vec2 viewRes;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        float rr = length((vSheet.xz - sheetCenter) * vec2(0.85, 1.6));
        float edge = smoothstep(0.0, 0.08, gl_FragCoord.y / viewRes.y);
        gl_FragColor.a *= (1.0 - smoothstep(2.5, 13.0, rr)) * edge;`);
  };
  sheetMat.customProgramCacheKey = () => "usli-sheet";
  const sheet = new Mesh(new PlaneGeometry(140, 140).rotateX(-Math.PI / 2), sheetMat);
  sheet.position.set((data.scene.ascentDriftM + data.scene.descentDriftM) / 2, 0, -20);
  sheet.receiveShadow = true;
  sheet.renderOrder = -1;
  scene.add(sheet);

  // ---- altitude ladder: faint lines every 500 ft with mono labels, so the climb reads against something ----
  const LADDER_Z = -3;
  const LADDER_DY = LADDER_Z * (-Math.sin(PITCH) / (Math.cos(YAW) * Math.cos(PITCH))); // view ray drop over the 3 m
  const ladderPos = new Float32Array(LADDER_FT.length * 6);
  LADDER_FT.forEach((f, i) => { const y = tl.heightOf(f) + LADDER_DY; ladderPos.set([-40, y, LADDER_Z, 80, y, LADDER_Z], i * 6); });
  const ladderGeo = new BufferGeometry();
  ladderGeo.setAttribute("position", new BufferAttribute(ladderPos, 3));
  const ladder = new LineSegments(ladderGeo, new LineBasicMaterial({ color: C.muted, transparent: true, opacity: 0.16, depthWrite: false }));
  ladder.frustumCulled = false;
  scene.add(ladder);
  try { await document.fonts.load('500 32px "DM Mono"'); } catch { /* falls back to the system mono */ }
  const ladderLabels = LADDER_FT.map((f) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 48;
    const g = cv.getContext("2d");
    g.font = '500 32px "DM Mono", ui-monospace, monospace';
    g.fillStyle = token("--color-ink-muted");
    g.textBaseline = "middle";
    g.fillText(`${f.toLocaleString("en-US")} FT`, 4, 25);
    const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace;
    const sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
    sp.center.set(0, 0);
    sp.userData.y = tl.heightOf(f) + LADDER_DY;
    scene.add(sp);
    return sp;
  });

  // ---- contact shadows: soft blobs under the lowest pieces as they reach the sheet ----
  const blobTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.6)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(cv);
  })();
  const blobGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = [0, 1].map(() => {
    const m = new Mesh(blobGeo, new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
    scene.add(m);
    return m;
  });
  function placeBlob(m, x, h, w) {
    m.visible = h < 1.2;
    m.position.set(x, 0.004, 0);
    m.scale.set(w, 1, w * 0.7);
    m.material.opacity = clamp(1 - h / 1.2);
  }

  // ---- camera: fixed lens and orientation, smoothed follow of the pieces ----
  const v3 = new Vector3();
  const look = new Vector3(-Math.sin(YAW) * Math.cos(PITCH), -Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)); // target to camera
  const cam = { x: 0, y: 0, ready: false };
  const focus = { x: 0, y: 0 };
  let viewH = VIEW_H, viewW = VIEW_H, dist = 1;
  function fitCamera(c) {
    renderer.getSize(res);
    const cssH = Math.max(1, res.y);
    c.aspect = res.x / cssH;
    viewH = Math.max(VIEW_H, MIN_VIEW_W / c.aspect);
    viewW = viewH * c.aspect;
    dist = viewH / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
    c.fov = FOV;
    c.near = 1;
    c.far = dist + 140;
    c.position.set(cam.x + look.x * dist, cam.y + look.y * dist, look.z * dist);
    c.lookAt(cam.x, cam.y, 0);
    c.updateProjectionMatrix();
    res.multiplyScalar(renderer.getPixelRatio()); // device px, for the sheet's edge fade
    // ladder labels: about 13 CSS px tall, pinned near the left edge of the view
    const k = (dist - LADDER_Z) / dist, h = (viewH / cssH) * 13 * k;
    const edgeX = cam.x + LADDER_Z * (look.x / look.z) - (viewW / 2) * k + h * 0.8;
    for (const sp of ladderLabels) {
      sp.scale.set(h * (256 / 48), h, 1);
      sp.position.set(edgeX, sp.userData.y + h * 0.15, LADDER_Z);
      v3.copy(sp.position).project(c); // hide a label the canvas edge would cut
      sp.visible = v3.y < 1 - (2 * 22) / cssH && v3.y > -1 + (2 * 6) / cssH;
    }
  }
  stage.setFit(fitCamera);

  // ---- apply a state ----
  const readout = { time: root.querySelector("[data-r-time]"), alt: root.querySelector("[data-r-alt]"), phase: root.querySelector("[data-r-phase]") };
  const shown = { tenth: -1, main: -2, payload: -2, phase: null, tag: "", tagX: -1e9, tagY: -1e9, tagSide: "" };
  let state = null, flightT = 0;
  const box = { l: 0, r: 0, b: 0, t: 0 };
  const grow = (x, y) => { if (x < box.l) box.l = x; if (x > box.r) box.r = x; if (y < box.b) box.b = y; if (y > box.t) box.t = y; };
  const bodyPoint = (b, s) => grow(state.anchors[b.chain].x + b.x - s * IN * Math.sin(b.rot), state.anchors[b.chain].y + b.y + s * IN * Math.cos(b.rot));

  function updateFocus() {
    box.l = box.b = Infinity; box.r = box.t = -Infinity;
    for (const id of BODY_IDS) { const b = state.bodies[id]; bodyPoint(b, S[id].aft); bodyPoint(b, S[id].fwd); }
    for (const id of CHUTE_IDS) {
      const c = state.chutes[id];
      if (!c.deployed || c.inflate < 0.05) continue;
      const a = state.anchors[c.chain], top = c.lineLength + (c.diameter / 2) * 0.55 * c.inflate;
      const tx = a.x + c.pos.x - Math.sin(c.rot) * top, ty = a.y + c.pos.y + Math.cos(c.rot) * top, half = (c.diameter / 2) * c.inflate;
      grow(tx - half, ty); grow(tx + half, ty);
    }
    focus.x = (box.l + box.r) / 2;
    focus.y = (box.b + box.t) / 2;
  }
  const minCamY = () => viewH / 2 - GROUND_MARGIN;
  function follow(dt, snap) {
    const tx = focus.x, ty = Math.max(focus.y, minCamY());
    if (snap || !cam.ready) { cam.x = tx; cam.y = ty; cam.ready = true; return false; }
    const k = 1 - Math.exp(-dt / FOLLOW_S);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const bx = BAND * viewW, by = BAND * viewH;
    if (focus.x - cam.x > bx) cam.x = focus.x - bx; else if (cam.x - focus.x > bx) cam.x = focus.x + bx;
    if (focus.y - cam.y > by) cam.y = focus.y - by; else if (cam.y - focus.y > by) cam.y = focus.y + by;
    if (cam.y < minCamY()) cam.y = minCamY();
    return Math.abs(tx - cam.x) > 0.002 || Math.abs(ty - cam.y) > 0.002;
  }

  function apply(t) {
    flightT = t;
    state = tl.stateInto(t);
    const A = state.anchors;
    for (const id of BODY_IDS) {
      const b = state.bodies[id], a = A[b.chain];
      bodies[id].position.set(a.x + b.x, a.y + b.y, 0);
      bodies[id].rotation.z = b.rot;
    }
    for (const id of CHUTE_IDS) { const s = state.chutes[id], a = A[s.chain]; placeChute(chutes[id], s, a.x + s.pos.x, a.y + s.pos.y); }
    for (let i = 0; i < state.cords.length; i++) {
      const c = state.cords[i];
      if (!c.on) { cordMeshes[i].visible = false; continue; }
      const a = A[c.chain];
      placeCord(cordMeshes[i], a.x + c.a.x, a.y + c.a.y, a.x + c.b.x, a.y + c.b.y);
    }

    // engine
    const fire = state.fire;
    plume.visible = glow.visible = fire > 0.001;
    plumeMat.uniforms.k.value = fire;
    plumeMat.uniforms.time.value = clock;
    plume.scale.set(1, 0.75 + 0.25 * fire, 1);
    const bo = bodies.booster, sn = Math.sin(bo.rotation.z), cs = Math.cos(bo.rotation.z);
    glow.position.set(bo.position.x + sn * 0.12, bo.position.y - cs * 0.12, 0.25);
    glow.material.opacity = fire * 0.85;
    engineLight.position.set(bo.position.x + sn * 0.5, bo.position.y - cs * 0.5, 0.4);
    engineLight.intensity = fire * 40;

    // contact blobs: under the booster aft end (main) and the nosecone (payload), stronger as they reach the sheet
    placeBlob(blobs[0], bodies.booster.position.x, bodies.booster.position.y, 0.55 * D);
    const nb = bodies.nose, tipX = nb.position.x - S.nose.fwd * IN * Math.sin(nb.rotation.z), tipY = nb.position.y + S.nose.fwd * IN * Math.cos(nb.rotation.z);
    const pb = bodies.payload, pcx = pb.position.x - S.payload.center * IN * Math.sin(pb.rotation.z);
    const landed = t >= tl.times.payloadLanding;
    placeBlob(blobs[1], landed ? (tipX + pcx) / 2 : tipX, Math.max(0, tipY), landed ? 1.6 * D : 0.6 * D);

    updateFocus();
    updateHud();
  }

  const ftText = (v) => `${v.toLocaleString("en-US")} ft`;
  function updateHud() {
    const tenth = Math.round(state.t * 10);
    if (tenth !== shown.tenth) { shown.tenth = tenth; readout.time.textContent = `T+ ${(tenth / 10).toFixed(1)} s`; }
    const m = Math.round(state.altFt.main), p = state.altFt.split ? Math.round(state.altFt.payload) : -1;
    if (m !== shown.main || p !== shown.payload) {
      shown.main = m; shown.payload = p;
      readout.alt.textContent = p < 0 ? `Altitude ${ftText(m)}` : `Main ${ftText(m)} / Payload ${ftText(p)}`;
    }
    if (state.phase !== shown.phase) { shown.phase = state.phase; readout.phase.textContent = state.phase.label; }
  }
  function placeTag() {
    const tag = state.tag;
    if (!tag.on) { if (shown.tag) { tagEl.removeAttribute("data-on"); shown.tag = ""; } return; }
    if (tag.label !== shown.tag) { tagEl.textContent = tag.label; tagEl.setAttribute("data-on", ""); shown.tag = tag.label; }
    const a = state.anchors[tag.chain];
    v3.set(a.x + tag.x, a.y + tag.y, 0).project(camera);
    const w = mount.clientWidth, h = mount.clientHeight;
    const y = ((1 - v3.y) / 2) * h;
    // beside everything drawn: right of the pieces, or left of them when the right side has no room
    v3.set(box.r, a.y + tag.y, 0).project(camera); const right = ((v3.x + 1) / 2) * w;
    v3.set(box.l, a.y + tag.y, 0).project(camera); const left = ((v3.x + 1) / 2) * w;
    const tw = tagEl.offsetWidth;
    const side = right + 24 + tw < w ? "right" : left - 24 - tw > 0 ? "left" : "top"; // "top": no room beside, top left of the canvas
    const x = side === "right" ? right + 6 : left - 6;
    if (side !== shown.tagSide) { tagEl.dataset.side = side; shown.tagSide = side; }
    const px = Math.round(side === "top" ? 0 : side === "left" ? x - tw - 10 : x + 10), py = Math.round(side === "top" ? 8 : y - tagEl.offsetHeight / 2);
    if (px !== shown.tagX || py !== shown.tagY) { tagEl.style.transform = `translate3d(${px}px, ${py}px, 0)`; shown.tagX = px; shown.tagY = py; }
  }
  function placeCameraAndLight() {
    fitCamera(camera);
    // The shadow camera follows the view where it meets the sheet; the shadow pass is skipped while the sheet is out of view.
    const nearGround = cam.y - viewH / 2 < 3;
    renderer.shadowMap.autoUpdate = nearGround;
    SHEET_CENTER.x = cam.x;
    key.target.position.set(cam.x, 0, 0);
    key.position.set(cam.x + KEY_DIR.x * 25, KEY_DIR.y * 25, KEY_DIR.z * 25);
    key.target.updateMatrixWorld();
  }

  // ---- playback clock ----
  let playS = 0, playing = false, last = 0;
  const listeners = new Set();
  const emit = () => { const finished = playS >= PLAY_SECONDS; listeners.forEach((f) => f({ playing, finished })); };
  stage.setStep((time) => {
    const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
    last = time;
    clock += dt;
    if (playing) {
      playS = Math.min(PLAY_SECONDS, playS + dt);
      apply(tl.flightAt(playS));
      if (playS >= PLAY_SECONDS) { playing = false; emit(); }
    }
    const moving = follow(dt, false);
    placeCameraAndLight();
    placeTag();
    if (!playing && !moving) last = 0;
    return playing || moving;
  });

  const snapTo = (t) => { apply(t); follow(0, true); placeCameraAndLight(); renderer.shadowMap.needsUpdate = true; placeTag(); };
  snapTo(0);
  root.dataset.state = "live";
  stage.resize();
  placeTag();

  return {
    play() { if (playS >= PLAY_SECONDS) { playS = 0; snapTo(0); } playing = true; last = 0; stage.wake(); emit(); },
    pause() { playing = false; emit(); stage.wake(); },
    restart() { playS = 0; playing = true; last = 0; snapTo(0); stage.wake(); emit(); },
    seek(t) { playing = false; playS = tl.playAt(t); snapTo(t); stage.wake(); emit(); },
    get playing() { return playing; },
    get finished() { return playS >= PLAY_SECONDS; },
    get playSeconds() { return playS; },
    onChange(f) { listeners.add(f); },
    timeline: () => tl,
    frames: () => stage.frames(),
    debug() {
      const w = mount.clientWidth, h = mount.clientHeight;
      const pieces = BODY_IDS.map((id) => {
        const b = state.bodies[id], a = state.anchors[b.chain];
        let minY = Infinity, l = Infinity, r = -Infinity, top = Infinity, bot = -Infinity;
        for (const st of [S[id].aft, S[id].fwd]) {
          const x = a.x + b.x - st * IN * Math.sin(b.rot), y = a.y + b.y + st * IN * Math.cos(b.rot);
          minY = Math.min(minY, y - Math.abs(Math.sin(b.rot)) * R);
          v3.set(x, y, 0).project(camera);
          const px = ((v3.x + 1) / 2) * w, py = ((1 - v3.y) / 2) * h;
          l = Math.min(l, px); r = Math.max(r, px); top = Math.min(top, py); bot = Math.max(bot, py);
        }
        return { id, minY, rect: { l, r, t: top, b: bot } };
      });
      return { t: flightT, playS, playing, finished: playS >= PLAY_SECONDS, canvas: { w, h }, cam: { x: cam.x, y: cam.y }, viewH, pieces, tag: state.tag.on ? state.tag.label : "" };
    },
    // Still frame at flight time t, framed as the player frames it (snapped camera), WebP.
    async snapshot(t, width, height) {
      const prev = { dpr: renderer.getPixelRatio(), clear: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      snapTo(t);
      renderer.setClearColor(C.bg, 1);
      renderer.render(scene, camera);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.92));
      renderer.setClearColor(prev.clear, prev.alpha);
      renderer.setPixelRatio(prev.dpr);
      stage.resize();
      snapTo(flightT);
      return blob;
    },
    dispose() { stage.dispose(); },
  };
}

// Mounts the scene and keeps the controls in sync. projects.js owns the clicks (Play works before the chunk has
// loaded). Playback pauses when the player leaves the viewport or the tab is hidden and resumes on return.
export async function mountUsli(root) {
  const scene = await createUsliScene(root);
  const toggle = root.querySelector("[data-usli-toggle]");
  const sync = ({ playing }) => {
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.textContent = playing ? "Pause" : "Play";
  };
  scene.onChange(sync);
  sync({ playing: false });

  let held = false, inView = true;
  const hold = () => { if (scene.playing) { scene.pause(); held = true; } };
  const resume = () => { if (held && inView && !document.hidden) { held = false; scene.play(); } };
  scene.onChange(({ playing }) => { if (playing) held = false; }); // a press of Play or Restart clears the hold
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) resume(); else hold(); }).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? hold() : resume()));
  root.usliScene = scene; // QA hook for tools/check_usli_scene.mjs --browser
  root.usliHeld = () => held;
  return scene;
}
