// hero-engine.js
// Brings the hero photo to life. tools/extract_hero.py splits the test-cell photo into an
// engine layer and a plume layer (the plume as pure emitted light), and tools/mach_field.py
// draws Mach-number contours lined up with the plume. This module draws them with WebGL and
// animates the plume: turbulence carried downstream, shock diamonds shimmering in place,
// flicker, glow, and heat haze bending the grid and the contours behind the exhaust.
//
// The same layers sit in the DOM as plain images, so without JS or WebGL the hero still
// shows the full picture, just still. Motion follows prefers-reduced-motion, pauses
// offscreen and in background tabs, and the visitor can pause or play it.

import { PLUME } from "./hero-plume.js";
import { VERTEX_SHADER, FRAGMENT_SHADER } from "./hero-shaders.js";

const MAX_SCALE = 1.75;        // device pixels per CSS pixel
const MAX_PIXELS = 3_200_000;  // canvas pixel budget, so big screens stay smooth
const STILL_TIME = 6;          // seconds into the animation to show when motion is off
const TIME_WRAP = 900;         // keeps noise inputs small enough for mediump GPUs

const CONTEXT_OPTIONS = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  powerPreference: "low-power",
};

const ICONS = {
  pause: "M2 1h3v10H2zM7 1h3v10H7z",
  play: "M2.5 1l8 5-8 5z",
};

export async function initHeroEngine(hero) {
  const canvas = hero.querySelector("[data-hero-canvas]");
  const toggle = hero.querySelector("[data-hero-toggle]");
  const layers = {
    engine: hero.querySelector('[data-hero-layer="engine"]'),
    flame: hero.querySelector('[data-hero-layer="flame"]'),
    bloom: hero.querySelector('[data-hero-layer="bloom"]'),
    mach: hero.querySelector('[data-hero-layer="mach"]'),
  };
  if (!canvas || Object.values(layers).some((img) => !img)) return;

  const gl =
    canvas.getContext("webgl2", CONTEXT_OPTIONS) || canvas.getContext("webgl", CONTEXT_OPTIONS);
  if (!gl) return;

  try {
    await Promise.all(Object.values(layers).map((img) => img.decode()));
  } catch {
    return; // A layer failed to load. The static images stay as they are.
  }

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return;

  const uniforms = setupScene(gl, program, layers, readTokens(hero));
  let view = measure(hero, canvas, layers.engine);

  const draw = (seconds) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_time, seconds);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_scale, view.scale);
    gl.uniform4fv(uniforms.u_art, view.art);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const clock = createClock(draw);

  // Motion: the visitor's button choice wins; otherwise follow their system setting.
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let choice = null;
  let inView = true;
  const wantsMotion = () => (choice ? choice === "play" : !reducedMotion.matches);
  const update = () => {
    if (wantsMotion() && inView && !document.hidden) clock.start();
    else clock.stop();
    setToggle(toggle, wantsMotion());
  };

  toggle?.addEventListener("click", () => {
    choice = wantsMotion() ? "pause" : "play";
    update();
  });
  reducedMotion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    update();
  }).observe(hero);

  new ResizeObserver(() => {
    view = measure(hero, canvas, layers.engine);
    clock.redraw();
  }).observe(hero);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    clock.stop();
    hero.classList.remove("is-live", "is-covered");
    if (toggle) toggle.hidden = true;
  });

  // First frame, then fade the canvas in over the static layers.
  draw(clock.elapsed);
  update();
  requestAnimationFrame(() => {
    hero.classList.add("is-live");
    const cover = () => hero.classList.add("is-covered");
    canvas.addEventListener("transitionend", cover, { once: true });
    setTimeout(cover, 1500);
  });
}

// ---------------------------------------------------------------- scene

function setupScene(gl, program, layers, tokens) {
  gl.useProgram(program);

  // One triangle that covers the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // WebGL 2 can mipmap non-power-of-two images, which keeps the engine crisp when scaled down.
  const mipmaps = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  uploadTexture(gl, 0, layers.engine, { premultiply: true, mipmaps });
  uploadTexture(gl, 1, layers.flame, { premultiply: false, mipmaps });
  uploadTexture(gl, 2, layers.bloom, { premultiply: false, mipmaps: false });
  uploadTexture(gl, 3, layers.mach, { premultiply: true, mipmaps });

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  gl.uniform1i(uniforms.u_engine, 0);
  gl.uniform1i(uniforms.u_flame, 1);
  gl.uniform1i(uniforms.u_bloom, 2);
  gl.uniform1i(uniforms.u_mach, 3);
  gl.uniform2fv(uniforms.u_artSize, PLUME.artSize);
  gl.uniform2fv(uniforms.u_nozzle, PLUME.nozzle);
  gl.uniform2fv(uniforms.u_end, PLUME.end);
  gl.uniform2fv(uniforms.u_halfWidth, PLUME.halfWidth);
  gl.uniform3fv(uniforms.u_background, tokens.background);
  gl.uniform1f(uniforms.u_gridAlpha, tokens.gridAlpha);
  gl.uniform1f(uniforms.u_gridSize, tokens.gridSize);
  return uniforms;
}

function uploadTexture(gl, unit, image, { premultiply, mipmaps }) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("Hero shader failed to compile:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  console.warn("Hero shader failed to link:", gl.getProgramInfoLog(program));
  return null;
}

// ---------------------------------------------------------------- layout and time

// Sizes the canvas to the hero and finds the art box in canvas pixels. The shader draws the
// engine inside that box, so the live render lands exactly on top of the static images.
function measure(hero, canvas, artImage) {
  const box = hero.getBoundingClientRect();
  const art = artImage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
  const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(box.width * box.height, 1)));
  canvas.width = Math.max(1, Math.round(box.width * scale));
  canvas.height = Math.max(1, Math.round(box.height * scale));
  const sx = canvas.width / Math.max(box.width, 1);
  const sy = canvas.height / Math.max(box.height, 1);
  return {
    scale: sx,
    art: [(art.left - box.left) * sx, (art.top - box.top) * sy, art.width * sx, art.height * sy],
  };
}

function createClock(draw) {
  let elapsed = STILL_TIME;
  let last = 0;
  let frame = 0;
  const tick = (now) => {
    if (last) elapsed = (elapsed + Math.min(now - last, 100) / 1000) % TIME_WRAP;
    last = now;
    draw(elapsed);
    frame = requestAnimationFrame(tick);
  };
  return {
    get elapsed() {
      return elapsed;
    },
    start() {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    },
    redraw() {
      if (!frame) draw(elapsed);
    },
  };
}

// ---------------------------------------------------------------- helpers

function setToggle(toggle, playing) {
  if (!toggle) return;
  toggle.hidden = false;
  toggle.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
  toggle.querySelector("[data-hero-toggle-label]").textContent = playing ? "Pause" : "Play";
  toggle.querySelector("[data-hero-toggle-icon]").setAttribute("d", playing ? ICONS.pause : ICONS.play);
}

function readTokens(element) {
  const styles = getComputedStyle(element);
  const read = (name) => styles.getPropertyValue(name).trim();
  return {
    background: hexToRgb(read("--color-bg")),
    gridAlpha: parseFloat(read("--hero-grid-alpha")) || 0.045,
    gridSize: parseFloat(read("--hero-grid-size")) || 32,
  };
}

function hexToRgb(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
}
