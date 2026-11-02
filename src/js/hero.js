// Real-time hero. The engine is framed into .hero__frame (an empty zone in the hero layout that bleeds
// past the right edge of the viewport): inlet up and right, off the edge; exhaust trailing down and
// left toward the Projects section. The canvas is transparent, so the engine sits on the page itself.
// The poster image underneath is shown whenever this cannot run (no WebGL, reduced motion, no JS).
//
// Engine model: "Jet Engine" by shogo.gfx, CC BY 4.0 (credited in the hero and THIRD_PARTY.md).
// Changes made here: simplified and compressed (tools/build_hero_model.mjs), fan color set to the site
// accent, afterburner plume added. If the model cannot load, the procedural engine in engine.js is used.
import { AnimationMixer, Box3, Color, Group, MathUtils, PointLight, Vector3 } from "three";
import { createStage } from "./render.js";
import { buildPlume } from "./plume.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/hero/jet-engine.glb`;
const ACCENT = new Color("#ff8100");
const deg = MathUtils.degToRad;

// Pose: yaw shows the cut side at three quarters; roll turns the inlet up and to the right.
const YAW = deg(18);
const ROLL = Math.PI + deg(33);
const ELEVATION = deg(6);
const THROTTLE_PERIOD = 6.5; // seconds per throttle cycle

// Where the engine sits inside the zone (fractions of its width and height) and how long it is.
// "wide" is the side-by-side layout (900 px and up); "medium" (600 to 899) and "narrow" are stacked.
// fade: plume fade widths toward the left, bottom and top canvas edges (fractions of width/height).
const LAYOUT = {
  wide: { cx: 0.7, cy: 0.38, length: 0.58, fade: [0.22, 0.24, 0] },
  medium: { cx: 0.6, cy: 0.53, length: 0.48, fade: [0, 0.24, 0] },
  narrow: { cx: 0.6, cy: 0.42, length: 0.58, fade: [0, 0.24, 0] },
};
const wideQuery = matchMedia("(min-width: 900px)");
const mediumQuery = matchMedia("(min-width: 600px)");
const currentLayout = () => (wideQuery.matches ? "wide" : mediumQuery.matches ? "medium" : "narrow");

async function loadModel() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const model = gltf.scene;
  model.traverse((node) => {
    if (node.isMesh && node.material.name === "accent-yellow") node.material.color.copy(ACCENT);
  });
  // Same frame as the procedural engine: axis on +x, inlet at x = 0.
  const box = new Box3().setFromObject(model);
  model.position.set(-box.min.x, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  const engine = new Group();
  engine.add(model);
  // The model's own clip spins the fan, compressor and turbine; it loops continuously.
  const mixer = new AnimationMixer(model);
  gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  return {
    engine,
    length: box.max.x - box.min.x,
    exit: box.max.x - box.min.x - 0.04, // flame starts just inside the exhaust rim
    exitRadius: 0.5,
    update: (dt, rate) => { mixer.timeScale = rate; mixer.update(dt); },
  };
}

async function proceduralEngine() {
  const { buildEngine, EXIT, EXIT_RADIUS } = await import("./engine.js");
  const engine = buildEngine();
  const fan = engine.userData.fan;
  return { engine, length: EXIT, exit: EXIT, exitRadius: EXIT_RADIUS, update: (dt, rate) => { fan.rotation.x += dt * 6 * rate; } };
}

export async function createHero(root) {
  const stage = await createStage(root, { fov: 24, exposure: 1.05, canvasClass: "hero__canvas" });
  const { canvas, scene, camera, renderer } = stage;
  canvas.setAttribute("aria-hidden", "true");
  const hero = root.closest(".hero") || root;

  let source;
  try { source = await loadModel(); } catch (error) {
    console.info("Hero model unavailable, using the procedural engine:", error.message);
    source = await proceduralEngine();
  }
  const { engine, exit, exitRadius, length } = source;

  const plume = buildPlume({ exit, radius: exitRadius, steps: root.clientWidth < 600 ? 32 : 48 });
  const flameLight = new PointLight(0xc8a8ff, 5, 3, 1.5);
  flameLight.position.set(exit + 0.6, 0, 0);

  // Pivot at the middle of the engine body (the plume hangs off it).
  const body = new Group();
  body.add(engine, plume, flameLight);
  body.position.x = -length / 2;
  const pivot = new Group();
  pivot.rotation.order = "ZYX";
  pivot.add(body);
  scene.add(pivot);
  stage.key.position.set(3, 5, 6);

  let forcedLayout = null; // set while rendering a poster for a given layout
  for (const q of [wideQuery, mediumQuery]) q.addEventListener("change", () => stage.resize());
  const inlet = new Vector3(-length / 2, 0, 0), outlet = new Vector3(length / 2, 0, 0);
  const a = new Vector3(), b = new Vector3();
  const pose = (yaw = YAW, roll = ROLL) => { pivot.rotation.set(0, yaw, roll); pivot.updateMatrixWorld(true); };

  // ---- fit: distance sets the engine's on-screen length; a view offset moves it to its spot ----
  stage.setFit((cam) => {
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const { cx, cy, length: share, fade: edges } = LAYOUT[forcedLayout || currentLayout()];
    plume.userData.setEdges(w, h, edges[0] * w, edges[1] * h, edges[2] * h);
    const dir = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    pose();
    cam.clearViewOffset();
    let lo = 0.5, hi = 400;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(dir).multiplyScalar(d);
      cam.lookAt(0, 0, 0);
      cam.near = 0.1; cam.far = d * 3;
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      a.copy(inlet).applyMatrix4(pivot.matrixWorld).project(cam);
      b.copy(outlet).applyMatrix4(pivot.matrixWorld).project(cam);
      const px = Math.hypot((a.x - b.x) * w / 2, (a.y - b.y) * h / 2);
      if (px > share * w) lo = d; else hi = d;
    }
    cam.position.copy(dir).multiplyScalar(hi);
    cam.lookAt(0, 0, 0);
    const reach = length / 2 + plume.userData.length + 1;
    cam.near = Math.max(hi - reach, 0.05);
    cam.far = hi + reach;
    cam.setViewOffset(w, h, w / 2 - cx * w, h / 2 - cy * h, w, h);
    cam.updateProjectionMatrix();
  });

  // ---- drag to rotate (yaw only). Vertical swipes still scroll the page (touch-action: pan-y). ----
  let dragYaw = 0, velocity = 0, dragging = false, lastX = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; velocity = 0;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const step = (e.clientX - lastX) * 0.006;
    lastX = e.clientX; dragYaw += step; velocity = step;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  // ---- per frame ----
  let last = 0, scrollYaw = 0, fade = 1;
  const state = (t) => {
    const cycle = 0.5 - 0.5 * Math.cos((t / THROTTLE_PERIOD) * Math.PI * 2); // 0 .. 1
    return { cycle, throttle: 0.86 + 0.14 * cycle };
  };
  const drive = (t, dt) => {
    const { cycle, throttle } = state(t);
    source.update(dt, 0.75 + 0.5 * cycle);
    plume.userData.update({ time: t, throttle, pulse: cycle, fade });
    flameLight.intensity = 5 * fade * (0.8 + 0.2 * cycle) * (0.95 + 0.05 * Math.sin(t * 31));
  };
  stage.setStep((ms) => {
    const t = ms / 1000;
    const dt = last ? Math.min(t - last, 0.1) : 0;
    last = t;

    // Scroll: the engine yaws slowly and the plume fades as the hero leaves the screen.
    const rect = hero.getBoundingClientRect();
    const p = MathUtils.clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
    scrollYaw += (deg(16) * p - scrollYaw) * 0.08;
    fade = 1 - MathUtils.smoothstep(p, 0.15, 0.75);

    // Drag inertia, then a slow spring back to the composed pose.
    if (!dragging) {
      dragYaw += velocity; velocity *= 0.92;
      if (Math.abs(velocity) < 0.0005) dragYaw *= 0.97;
    }

    // Idle drift: a slow, small sway that never repeats exactly.
    const drift = deg(2.5) * Math.sin(t * 0.27) + deg(1.2) * Math.sin(t * 0.61 + 1.3);
    const sway = deg(1.2) * Math.sin(t * 0.21 + 0.4);
    pose(YAW + drift + dragYaw + scrollYaw, ROLL + sway);
    drive(t, dt);
    return true;
  });

  // Show the canvas only after the first real frame is drawn.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  root.dataset.state = "ready";

  // Screen rectangles of the engine (from sampled mesh vertices) and the plume volume, in CSS px,
  // viewport space. Used by the QA script tools/hero_frames.mjs.
  const toScreen = (points) => {
    const r = canvas.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of points) {
      v.project(camera);
      const px = (v.x + 1) / 2 * r.width, py = (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return { left: r.left + x0, top: r.top + y0, right: r.left + x1, bottom: r.top + y1 };
  };
  const engineRect = () => {
    const points = [];
    engine.traverse((m) => {
      const pos = m.isMesh && m.geometry.attributes.position;
      if (!pos) return;
      const stride = Math.max(1, Math.floor(pos.count / 600));
      for (let i = 0; i < pos.count; i += stride) points.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    });
    return toScreen(points);
  };
  const plumeRect = () => {
    const box = new Box3().setFromObject(plume), points = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new Vector3(x, y, z));
    return toScreen(points);
  };

  const api = {
    camera,
    engineRect,
    plumeRect,
    frames: stage.frames,
    // Renders one still at a fixed size and pose on the page color (used to make the poster images).
    async snapshot(width, height, which = "wide", type = "image/webp", quality = 0.9) {
      const saveFade = fade;
      forcedLayout = which;
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      stage.frame();
      pose();
      fade = 1;
      drive(2.4, 0);
      renderer.setClearColor(0x0a0b0d, 1);
      renderer.render(scene, camera);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      renderer.setClearColor(0x000000, 0);
      fade = saveFade;
      forcedLayout = null;
      stage.resize();
      return blob;
    },
    dispose: () => stage.dispose(),
  };
  root.__hero = api;
  return api;
}
