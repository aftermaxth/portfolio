// Real-time 3D viewer for one project. Rotate by dragging (or arrow keys); zoom and pan are off.
// The canvas uses touch-action: pan-y, so vertical swipes always scroll the page.
//
// API (used by projects.js and motion.js):
//   const viewer = await createViewer(rootEl)   // rootEl = .viewer with data-models='[{id,label,url}]'
//   viewer.setModel(id)      // switch between models of one project
//   viewer.setScroll(p)      // p in 0..1, project scroll progress; adds a slow turn
//   viewer.dispose()
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, MathUtils, PerspectiveCamera, PMREMGenerator,
  Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const FOV = 28;
const ELEVATION = MathUtils.degToRad(18);
const BASE_YAW = MathUtils.degToRad(-35);
const CREASE = MathUtils.degToRad(35);

export async function createViewer(root) {
  const models = JSON.parse(root.dataset.models);
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${root.getAttribute("aria-label")}. Drag or use the arrow keys to rotate.`);
  root.prepend(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  const pivot = new Group();
  scene.add(pivot);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  let current = null;
  let radius = 1;

  // ---- loading and framing ----
  const load = async (model) => {
    if (cache.has(model.id)) return cache.get(model.id);
    const gltf = await loader.loadAsync(model.url);
    const object = gltf.scene;
    object.traverse((node) => {
      if (!node.isMesh) return;
      // Parts are stored as welded positions only; crease at 35 degrees so they read as machined surfaces.
      node.geometry = toCreasedNormals(node.geometry, CREASE);
    });
    const box = new Box3().setFromObject(object);
    object.position.sub(box.getCenter(new Vector3()));
    const holder = new Group();
    holder.add(object);
    holder.userData.radius = box.getSize(new Vector3()).length() / 2;
    cache.set(model.id, holder);
    return holder;
  };

  const frame = () => {
    const vfov = MathUtils.degToRad(FOV);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08;
    camera.position.set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(dist - radius * 1.2, dist * 0.2);
    camera.far = dist + radius * 1.2;
    camera.updateProjectionMatrix();
  };

  const setModel = async (id) => {
    const model = models.find((m) => m.id === id) || models[0];
    const holder = await load(model);
    if (current) pivot.remove(current);
    current = holder;
    radius = holder.userData.radius;
    pivot.add(holder);
    frame();
    root.querySelectorAll("[data-model]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === model.id)));
    wake();
  };

  // ---- size ----
  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frame();
    wake();
  };
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(root);

  // ---- interaction: yaw only ----
  let yaw = BASE_YAW, velocity = 0, scrollYaw = 0, scrollTarget = 0;
  let dragging = false, lastX = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; velocity = 0;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const step = (e.clientX - lastX) * 0.008;
    lastX = e.clientX; yaw += step; velocity = step;
    wake();
  });
  const end = () => { dragging = false; wake(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { yaw -= 0.15; wake(); e.preventDefault(); }
    if (e.key === "ArrowRight") { yaw += 0.15; wake(); e.preventDefault(); }
  });
  root.querySelectorAll("[data-model]").forEach((b) => b.addEventListener("click", () => setModel(b.dataset.model)));

  // ---- render loop: runs only while visible and something is moving ----
  let raf = 0, visible = false;
  const tick = () => {
    raf = 0;
    if (!dragging && Math.abs(velocity) > 0.0002) { yaw += velocity; velocity *= 0.92; } else if (!dragging) velocity = 0;
    scrollYaw += (scrollTarget - scrollYaw) * 0.12;
    const settling = Math.abs(scrollTarget - scrollYaw) > 0.0005;
    pivot.rotation.y = yaw + scrollYaw;
    renderer.render(scene, camera);
    if (dragging || settling || Math.abs(velocity) > 0.0002) raf = requestAnimationFrame(tick);
  };
  function wake() { if (visible && current && !raf) raf = requestAnimationFrame(tick); }
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  visibility.observe(root);

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); root.dataset.state = "fallback"; });
  canvas.addEventListener("webglcontextrestored", () => { root.dataset.state = "ready"; wake(); });

  resize();
  await setModel(models[0].id);
  root.dataset.state = "ready";

  return {
    setModel,
    setScroll(p) { scrollTarget = (p - 0.5) * Math.PI * 0.9; wake(); },
    dispose() {
      sizeObserver.disconnect(); visibility.disconnect();
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose(); canvas.remove();
    },
  };
}
