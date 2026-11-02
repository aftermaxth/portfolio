// Shared three.js setup for the hero engine and the project viewers.
// One place for: renderer (MSAA, DPR cap 2, AgX, sRGB), environment light, framing,
// a soft contact shadow, and a render loop that only runs while the canvas is on screen.
import {
  AgXToneMapping, DirectionalLight, Mesh, MeshBasicMaterial, MeshDepthMaterial, MathUtils,
  OrthographicCamera, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial,
  SRGBColorSpace, WebGLRenderer, WebGLRenderTarget, EquirectangularReflectionMapping,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

// Self-hosted studio HDRI (Poly Haven, CC0). Null means the procedural room light is used instead.
export const HDRI_URL = null;

let hdriData = null;
const loadHdri = () => {
  if (!HDRI_URL) return Promise.resolve(null);
  hdriData ??= import("three/addons/loaders/HDRLoader.js")
    .then(({ HDRLoader }) => new HDRLoader().loadAsync(HDRI_URL))
    .catch(() => null);
  return hdriData;
};

export async function createStage(root, { fov = 28, exposure = 1, label = "", canvasClass = "" } = {}) {
  const canvas = document.createElement("canvas");
  if (canvasClass) canvas.className = canvasClass;
  if (label) { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", label); }
  root.prepend(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const hdri = await loadHdri();
  if (hdri) {
    hdri.mapping = EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdri).texture;
  } else {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  pmrem.dispose();

  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);

  // ---- framing: fit a sphere of `radius` around `target`, tight near and far planes ----
  // A caller can replace this with its own fit (the hero frames a wide box, not a sphere).
  const view = { radius: 1, elevation: MathUtils.degToRad(18), fill: 1.08, target: [0, 0, 0] };
  let fit = null;
  const frame = (next = {}) => {
    if (fit) return fit(camera);
    Object.assign(view, next);
    const vfov = MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (view.radius / Math.sin(Math.min(vfov, hfov) / 2)) * view.fill;
    const [tx, ty, tz] = view.target;
    camera.position.set(tx, ty + Math.sin(view.elevation) * dist, tz + Math.cos(view.elevation) * dist);
    camera.lookAt(tx, ty, tz);
    camera.near = Math.max(dist - view.radius * 2, dist * 0.15);
    camera.far = dist + view.radius * 2.5;
    camera.updateProjectionMatrix();
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

  // ---- loop: `step(time)` returns true to keep animating; stops when off screen ----
  let step = () => false;
  let raf = 0, visible = false;
  const tick = (time) => {
    raf = 0;
    const more = step(time);
    renderer.render(scene, camera);
    if (more && visible) raf = requestAnimationFrame(tick);
  };
  function wake() { if (visible && !raf) raf = requestAnimationFrame(tick); }
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  visibility.observe(root);

  const lost = (e) => { e.preventDefault(); root.dataset.state = "fallback"; };
  const restored = () => { root.dataset.state = "ready"; wake(); };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);

  resize();

  return {
    canvas, renderer, scene, camera, key, frame, resize, wake,
    setStep(fn) { step = fn; wake(); },
    setFit(fn) { fit = fn; frame(); wake(); },
    contactShadow: (object, options) => bakeContactShadow(renderer, object, options),
    dispose() {
      sizeObserver.disconnect(); visibility.disconnect();
      if (raf) cancelAnimationFrame(raf);
      scene.environment?.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}

// Soft contact shadow, baked once per object. The object must have no parent yet; `center` is the
// footprint center [x, z] in the object's own space. The shadow plane is added to the object, so it turns with it at no extra cost.
// Method: render the object's depth from below into a small target, then blur it twice.
function bakeContactShadow(renderer, object, { size, bottom, height, center = [0, 0], darkness = 1.4, blur = 3.5, opacity = 0.9, res = 512 }) {
  const [w, d] = size;
  const target = new WebGLRenderTarget(res, res);
  const scratch = new WebGLRenderTarget(res, res);
  target.texture.generateMipmaps = scratch.texture.generateMipmaps = false;

  const cam = new OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, height);
  const [cx, cz] = center;
  cam.position.set(cx, bottom, cz);
  cam.rotation.x = Math.PI / 2;
  cam.updateMatrixWorld();

  const depth = new MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = { value: darkness };
    shader.fragmentShader = "uniform float darkness;\n" + shader.fragmentShader.replace(
      "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
      "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );",
    );
  };
  depth.depthTest = depth.depthWrite = false;

  const temp = new Scene();
  temp.overrideMaterial = depth;
  temp.add(object);

  const clearAlpha = renderer.getClearAlpha();
  renderer.setClearAlpha(0);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(temp, cam);
  temp.remove(object);

  const quad = new Mesh(new PlaneGeometry(w, d).rotateX(Math.PI / 2));
  quad.position.set(cx, bottom, cz);
  quad.updateMatrixWorld();
  const hBlur = new ShaderMaterial(HorizontalBlurShader);
  const vBlur = new ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;
  const pass = (amount) => {
    quad.material = hBlur;
    hBlur.uniforms.tDiffuse.value = target.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(scratch);
    renderer.render(quad, cam);
    quad.material = vBlur;
    vBlur.uniforms.tDiffuse.value = scratch.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(target);
    renderer.render(quad, cam);
  };
  pass(blur);
  pass(blur * 0.4);
  renderer.setRenderTarget(null);
  renderer.setClearAlpha(clearAlpha);

  scratch.dispose(); depth.dispose(); hBlur.dispose(); vBlur.dispose(); quad.geometry.dispose();

  const plane = new Mesh(
    new PlaneGeometry(w, d).rotateX(Math.PI / 2),
    new MeshBasicMaterial({ map: target.texture, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  plane.scale.y = -1; // geometry faces down; flipping y makes it face up without mirroring the map
  plane.position.set(cx, bottom, cz);
  plane.renderOrder = -1;
  plane.userData.dispose = () => { target.dispose(); plane.geometry.dispose(); plane.material.dispose(); };
  object.add(plane);
  return plane;
}
