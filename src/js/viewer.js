// Real-time 3D viewer for one project. Rotate by dragging (or arrow keys); zoom and pan are off.
// The canvas uses touch-action: pan-y, so vertical swipes always scroll the page.
//
// API (used by projects.js and motion.js):
//   const viewer = await createViewer(rootEl)   // rootEl = .viewer with data-models='[{id,label,url}]'
//   viewer.setModel(id)      // switch between models of one project
//   viewer.setScroll(p)      // p in 0..1, project scroll progress; adds a slow turn
//   viewer.dispose()
import { Box3, Group, MathUtils, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { createStage } from "./render.js";

const BASE_YAW = MathUtils.degToRad(-35);
const CREASE = MathUtils.degToRad(35);

export async function createViewer(root) {
  const models = JSON.parse(root.dataset.models);
  const stage = await createStage(root, {
    fov: 28,
    exposure: 1.1,
    label: `${root.getAttribute("aria-label")}. Drag or use the arrow keys to rotate.`,
  });
  const { canvas, scene } = stage;
  canvas.tabIndex = 0;

  const pivot = new Group();
  scene.add(pivot);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  let current = null;

  // ---- loading: center the part, bake its contact shadow once ----
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
    const size = box.getSize(new Vector3());
    const holder = new Group();
    holder.add(object);
    const footprint = Math.max(size.x, size.z) * 1.5;
    stage.contactShadow(holder, {
      size: [footprint, footprint],
      bottom: -size.y / 2 - size.y * 0.002,
      height: size.y * 0.5,
    });
    holder.userData.radius = size.length() / 2;
    cache.set(model.id, holder);
    return holder;
  };

  const setModel = async (id) => {
    const model = models.find((m) => m.id === id) || models[0];
    const holder = await load(model);
    if (current) pivot.remove(current);
    current = holder;
    pivot.add(holder);
    stage.frame({ radius: holder.userData.radius });
    root.querySelectorAll("[data-model]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === model.id)));
    stage.wake();
  };

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
    stage.wake();
  });
  const end = () => { dragging = false; stage.wake(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { yaw -= 0.15; stage.wake(); e.preventDefault(); }
    if (e.key === "ArrowRight") { yaw += 0.15; stage.wake(); e.preventDefault(); }
  });
  root.querySelectorAll("[data-model]").forEach((b) => b.addEventListener("click", () => setModel(b.dataset.model)));

  // ---- per frame: inertia and the scroll-linked turn; stops once everything settles ----
  stage.setStep(() => {
    if (!current) return false;
    if (!dragging && Math.abs(velocity) > 0.0002) { yaw += velocity; velocity *= 0.92; } else if (!dragging) velocity = 0;
    scrollYaw += (scrollTarget - scrollYaw) * 0.12;
    const settling = Math.abs(scrollTarget - scrollYaw) > 0.0005;
    pivot.rotation.y = yaw + scrollYaw;
    return dragging || settling || Math.abs(velocity) > 0.0002;
  });

  await setModel(models[0].id);
  root.dataset.state = "ready";

  return {
    setModel,
    setScroll(p) { scrollTarget = (p - 0.5) * Math.PI * 0.9; stage.wake(); },
    dispose() {
      for (const holder of cache.values()) holder.traverse((n) => n.userData.dispose?.());
      stage.dispose();
    },
  };
}
