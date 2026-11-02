// Real-time hero: the engine runs at full afterburner inside .hero__stage.
// The poster image stays underneath and is shown whenever this cannot run (no WebGL, reduced motion, no JS).
// Decorative only: no pointer input, so the page always scrolls normally.
import { Box3, Group, MathUtils, PointLight, Vector3 } from "three";
import { createStage } from "./render.js";
import { buildEngine, EXIT, EXIT_RADIUS } from "./engine.js";
import { buildPlume } from "./plume.js";

const BASE_YAW = MathUtils.degToRad(40); // inlet turned toward the viewer
const PITCH = MathUtils.degToRad(10);

export async function createHero(root) {
  const stage = await createStage(root, { fov: 22, exposure: 1.05, canvasClass: "hero__canvas" });
  const { canvas, scene, camera } = stage;
  canvas.setAttribute("aria-hidden", "true");

  const engine = buildEngine();
  const box = new Box3().setFromObject(engine);
  const size = box.getSize(new Vector3());
  stage.contactShadow(engine, {
    size: [size.x * 1.15, size.z * 2.4],
    center: [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2],
    bottom: box.min.y - size.y * 0.35,
    height: size.y * 1.2,
    darkness: 1.1, blur: 5, opacity: 0.7,
  });

  const plume = buildPlume({ exit: EXIT, radius: EXIT_RADIUS });
  const flameLight = new PointLight(0xff7a2a, 6, 3, 1.5);
  flameLight.position.set(EXIT + 0.5, 0, 0);

  // Center the whole thing (engine plus plume) on the pivot.
  const body = new Group();
  body.add(engine, plume, flameLight);
  const length = plume.userData.extent;
  body.position.x = -length / 2;
  const pivot = new Group();
  pivot.add(body);
  scene.add(pivot);
  stage.key.position.set(-2, 5, 6);

  // ---- fit: search the camera distance so the engine and plume fill the frame with a margin ----
  const corners = [];
  const half = new Vector3(length / 2, size.y * 0.75, size.z * 0.75);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(new Vector3(sx * half.x, sy * half.y, sz * half.z));
  const world = new Vector3();
  stage.setFit((cam) => {
    const dir = new Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
    const margin = cam.aspect < 1.2 ? 0.98 : 0.9;
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

  // ---- per frame: fan turns, flame flickers, the engine yaws a little as the hero scrolls away ----
  const fan = engine.userData.fan;
  let yaw = BASE_YAW;
  stage.setStep((ms) => {
    const t = ms / 1000;
    fan.rotation.x = t * 1.6;
    plume.userData.tick(t);
    flameLight.intensity = 6 * (0.94 + 0.06 * Math.sin(t * 29) * Math.sin(t * 13));
    const p = MathUtils.clamp(window.scrollY / Math.max(root.offsetTop + root.offsetHeight, 1), 0, 1);
    const target = BASE_YAW + p * MathUtils.degToRad(14);
    yaw += (target - yaw) * 0.08;
    pivot.rotation.y = yaw;
    return true;
  });

  // Show the canvas only after the first real frame is drawn.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  root.dataset.state = "ready";

  return { dispose: () => stage.dispose(), camera };
}
