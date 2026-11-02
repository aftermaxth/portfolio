// Real-time hero: the engine runs at full afterburner inside .hero__stage.
// The poster image stays underneath and is shown whenever this cannot run (no WebGL, reduced motion, no JS).
// Decorative only: no pointer input, so the page always scrolls normally.
//
// Engine model: "Jet Engine" by shogo.gfx, CC BY 4.0 (credited in the hero caption and THIRD_PARTY.md).
// Changes made here: simplified and compressed (tools/build_hero_model.mjs), fan color set to the site
// accent, afterburner plume added. If the model cannot load, the procedural engine in engine.js is used.
import { AnimationMixer, Box3, Color, Group, MathUtils, PointLight, Vector3 } from "three";
import { createStage } from "./render.js";
import { buildPlume } from "./plume.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/hero/jet-engine.glb`;
const PITCH = MathUtils.degToRad(10);
const ACCENT = new Color("#ff8100");

// Loads the model and puts it in the same frame as the procedural engine: axis on +x, inlet at x = 0.
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
  const box = new Box3().setFromObject(model);
  model.position.set(-box.min.x, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  const engine = new Group();
  engine.add(model);
  const mixer = new AnimationMixer(model);
  gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  return {
    engine,
    exit: box.max.x - box.min.x - 0.04, // flame starts just inside the exhaust rim
    exitRadius: 0.5,
    yaw: MathUtils.degToRad(28),
    update: (dt) => mixer.update(dt),
  };
}

async function proceduralEngine() {
  const { buildEngine, EXIT, EXIT_RADIUS } = await import("./engine.js");
  const engine = buildEngine();
  const fan = engine.userData.fan;
  return { engine, exit: EXIT, exitRadius: EXIT_RADIUS, yaw: MathUtils.degToRad(40), update: (dt) => { fan.rotation.x += dt * 1.6; } };
}

export async function createHero(root) {
  const stage = await createStage(root, { fov: 22, exposure: 1.05, canvasClass: "hero__canvas" });
  const { canvas, scene, camera, renderer } = stage;
  canvas.setAttribute("aria-hidden", "true");

  let source;
  try { source = await loadModel(); } catch (error) {
    console.info("Hero model unavailable, using the procedural engine:", error.message);
    source = await proceduralEngine();
  }
  const { engine, exit, exitRadius } = source;
  const BASE_YAW = source.yaw;

  const box = new Box3().setFromObject(engine);
  const size = box.getSize(new Vector3());
  stage.contactShadow(engine, {
    size: [size.x * 1.15, size.z * 2.4],
    center: [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2],
    bottom: box.min.y - size.y * 0.3,
    height: size.y * 1.2,
    darkness: 1.1, blur: 5, opacity: 0.7,
  });

  const plume = buildPlume({ exit, radius: exitRadius });
  const flameLight = new PointLight(0xff7a2a, 6, 3, 1.5);
  flameLight.position.set(exit + 0.5, 0, 0);

  // Center the whole thing (engine plus plume) on the pivot.
  const body = new Group();
  body.add(engine, plume, flameLight);
  const length = plume.userData.visibleExtent;
  body.position.x = -length / 2;
  const pivot = new Group();
  pivot.add(body);
  scene.add(pivot);
  stage.key.position.set(-2, 5, 6);

  // ---- fit: search the camera distance so the engine and plume fill the frame with a margin ----
  const corners = [];
  const half = new Vector3(length / 2, size.y * 0.6, size.z * 0.6);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(new Vector3(sx * half.x, sy * half.y, sz * half.z));
  const world = new Vector3();
  stage.setFit((cam) => {
    const dir = new Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const margin = cam.aspect < 1.2 ? 0.98 : 0.92;
    let lo = 0.5, hi = 200;
    pivot.rotation.y = BASE_YAW;
    pivot.updateMatrixWorld(true);
    for (let i = 0; i < 24; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(dir).multiplyScalar(d);
      cam.lookAt(0, 0, 0);
      cam.near = 0.1; cam.far = d * 2;
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      const fits = corners.every((c) => {
        world.copy(c).applyMatrix4(pivot.matrixWorld).project(cam);
        return Math.abs(world.x) <= margin && Math.abs(world.y) <= margin;
      });
      if (fits) hi = d; else lo = d;
    }
    cam.position.copy(dir).multiplyScalar(hi);
    cam.lookAt(0, 0, 0);
    const reach = half.length();
    cam.near = Math.max(hi - reach * 1.3, 0.05);
    cam.far = hi + reach * 1.3;
    cam.updateProjectionMatrix();
  });

  // ---- per frame: blades turn, flame flickers, the engine yaws a little as the hero scrolls away ----
  let yaw = BASE_YAW, last = 0;
  const pose = (t, dt) => {
    source.update(dt);
    plume.userData.tick(t);
    flameLight.intensity = 6 * (0.94 + 0.06 * Math.sin(t * 29) * Math.sin(t * 13));
  };
  stage.setStep((ms) => {
    const t = ms / 1000;
    const dt = last ? Math.min(t - last, 0.1) : 0;
    last = t;
    pose(t, dt);
    const p = MathUtils.clamp(window.scrollY / Math.max(root.offsetTop + root.offsetHeight, 1), 0, 1);
    const target = BASE_YAW + p * MathUtils.degToRad(14);
    yaw += (target - yaw) * 0.08;
    pivot.rotation.y = yaw;
    return true;
  });

  // Show the canvas only after the first real frame is drawn.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  root.dataset.state = "ready";

  return {
    camera,
    // Renders one still at a fixed size on the stage color (used to make the poster image).
    async snapshot(width, height, type = "image/webp", quality = 0.9) {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      stage.frame();
      pivot.rotation.y = BASE_YAW;
      pose(1.3, 0);
      renderer.setClearColor(0x111317, 1);
      renderer.render(scene, camera);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      renderer.setClearColor(0x000000, 0);
      stage.resize();
      return blob;
    },
    dispose: () => stage.dispose(),
  };
}
