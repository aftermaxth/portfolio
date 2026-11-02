// QA proof for the live hero: headless Chrome, prefers-reduced-motion OFF, 3 hero frames 500 ms apart
// per width, and the pixel difference inside the plume's screen rectangle. Also reports whether the
// headline box overlaps the engine box and whether the page scrolls sideways.
// No dependencies: drives Chrome over the DevTools protocol with Node's built-in fetch and WebSocket.
//
// Usage (after `npm run build` and `npx vite preview --port 4173`):
//   node tools/hero_frames.mjs [--url http://localhost:4173/portfolio/] [--out <dir>] [--widths 1440,375]
// CHROME env var overrides the browser path. A throwaway profile is created inside --out.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_ = arg("url", "http://localhost:4173/portfolio/");
const OUT = resolve(arg("out", "hero-frames"));
const WIDTHS = arg("widths", "1440,375").split(",").map(Number);
const HEIGHTS = { 1440: 900, 768: 1024, 375: 812 };
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = join(OUT, ".chrome-profile");
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nextId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(200); }
  }
  if (!target) throw new Error("Chrome did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");

  const report = {};
  for (const width of WIDTHS) {
    const height = HEIGHTS[width] || 900;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await send("Page.navigate", { url: URL_ });
    let state = "";
    for (let i = 0; i < 150 && state !== "ready"; i++) {
      await sleep(200);
      state = await evaluate(`document.querySelector("[data-hero-stage]")?.dataset.state || ""`).catch(() => "");
    }
    if (state !== "ready") throw new Error(`hero not ready at ${width} (state "${state}")`);
    await sleep(2500); // intro animation and canvas fade settle
    await evaluate("window.scrollTo(0, 0)");
    await sleep(300);

    const info = await evaluate(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
      const hero = document.querySelector("[data-hero-stage]").__hero;
      // Headline glyph lines (not the full-width block), tested against the engine's screen box.
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(".hero__title"));
      const lines = [...range.getClientRects()].map((b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom }));
      const title = r(document.querySelector(".hero__title"));
      const engine = hero.engineRect(), plume = hero.plumeRect();
      let overlap = 0;
      for (const l of lines) {
        const ix = Math.max(0, Math.min(l.right, engine.right) - Math.max(l.left, engine.left));
        const iy = Math.max(0, Math.min(l.bottom, engine.bottom) - Math.max(l.top, engine.top));
        overlap += ix * iy;
      }
      const frame = r(document.querySelector(".hero__frame"));
      return { title, lines, engine, plume, frame, titleEngineOverlapPx: Math.round(overlap),
        scrollWidth: document.documentElement.scrollWidth, innerWidth, innerHeight };
    })()`);

    // Whole first screen, for composition.
    const view = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `hero-${width}-view.png`), Buffer.from(view.data, "base64"));

    // Capture the visible part of the frame (where the plume is).
    const clip = {
      x: 0, y: Math.max(0, info.frame.top),
      width: info.innerWidth, height: Math.min(info.innerHeight, info.frame.bottom) - Math.max(0, info.frame.top), scale: 1,
    };
    const shots = [];
    for (let k = 0; k < 3; k++) {
      if (k) await sleep(500);
      const { data } = await send("Page.captureScreenshot", { format: "png", clip });
      shots.push(data);
      writeFileSync(join(OUT, `hero-${width}-frame${k + 1}.png`), Buffer.from(data, "base64"));
    }

    // Pixel difference inside the plume rectangle (clamped to the capture).
    const region = {
      x: Math.max(0, Math.round(info.plume.left)), y: Math.max(0, Math.round(info.plume.top - clip.y)),
      x1: Math.min(clip.width, Math.round(info.plume.right)), y1: Math.min(clip.height, Math.round(info.plume.bottom - clip.y)),
    };
    const diff = await evaluate(`(async () => {
      const shots = ${JSON.stringify(shots)};
      const R = ${JSON.stringify(region)};
      const w = R.x1 - R.x, h = R.y1 - R.y;
      const pixels = await Promise.all(shots.map(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
        const c = new OffscreenCanvas(w, h), g = c.getContext("2d");
        g.drawImage(bmp, -R.x, -R.y);
        return g.getImageData(0, 0, w, h).data;
      }));
      const compare = (a, b) => {
        let sum = 0, changed = 0;
        for (let i = 0; i < a.length; i += 4) {
          const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
          sum += d; if (d > 8) changed++;
        }
        const n = a.length / 4;
        return { meanAbsDiff: +(sum / n).toFixed(2), changedPct: +(100 * changed / n).toFixed(2) };
      };
      return { region: { x: R.x, y: R.y, width: w, height: h }, frame1to2: compare(pixels[0], pixels[1]), frame2to3: compare(pixels[1], pixels[2]) };
    })()`);

    // Drag: a horizontal drag across the canvas should turn the engine (its screen box moves).
    const drag = await evaluate(`(async () => {
      const root = document.querySelector("[data-hero-stage]"), c = root.querySelector("canvas"), hero = root.__hero;
      const b = c.getBoundingClientRect(), x = b.left + b.width * 0.55, y = b.top + b.height * 0.5;
      const before = hero.engineRect();
      const ev = (type, dx) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x + dx, clientY: y, pointerType: "mouse", buttons: 1 }));
      ev("pointerdown", 0);
      for (let k = 1; k <= 10; k++) { ev("pointermove", k * 24); await new Promise((r) => setTimeout(r, 30)); }
      ev("pointerup", 240);
      await new Promise((r) => setTimeout(r, 120));
      const after = hero.engineRect();
      return { leftShiftPx: Math.round(after.left - before.left), widthChangePx: Math.round((after.right - after.left) - (before.right - before.left)) };
    })()`);

    // Off screen: scroll the hero away; the hero's frame counter should stop.
    const pause = await evaluate(`(async () => {
      const hero = document.querySelector("[data-hero-stage]").__hero;
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 800));
      const a = hero.frames();
      await new Promise((r) => setTimeout(r, 1000));
      const b = hero.frames();
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 800));
      const c = hero.frames();
      return { offscreenFramesIn1s: b - a, resumedFrames: c - b };
    })()`);

    report[width] = { ...info, clip, plumeDiff: diff, drag, pause };
    console.log(`\n== ${width}x${height} ==`);
    console.log(`scrollWidth ${info.scrollWidth} / innerWidth ${info.innerWidth}; headline over engine box: ${info.titleEngineOverlapPx} px2`);
    console.log(`plume region (in capture) ${JSON.stringify(diff.region)}`);
    console.log(`frame 1->2: mean abs diff ${diff.frame1to2.meanAbsDiff}/255, ${diff.frame1to2.changedPct}% of pixels changed by more than 8`);
    console.log(`frame 2->3: mean abs diff ${diff.frame2to3.meanAbsDiff}/255, ${diff.frame2to3.changedPct}% of pixels changed by more than 8`);
    console.log(`drag 240 px: engine box left edge moved ${drag.leftShiftPx} px, width changed ${drag.widthChangePx} px`);
    console.log(`scrolled away: ${pause.offscreenFramesIn1s} frames drawn in 1 s; back on screen: ${pause.resumedFrames} frames in 0.8 s`);
  }
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nframes and report.json in ${OUT}`);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
