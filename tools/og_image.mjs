// Renders the social preview (og-image.png, 1200x630) from the live hero: headless Chrome, the real
// 3D engine and plume, no mock-up. Writes several candidate frames (the throttle cycle changes the
// plume length) so one can be picked, then copies the chosen one into public/.
// No dependencies: drives Chrome over the DevTools protocol, like tools/hero_frames.mjs.
//
// Usage (after `npm run build` and `npx vite preview --port 4173`):
//   node tools/og_image.mjs [--url http://localhost:4173/portfolio/] [--out <dir>] [--pick <n>]
// Without --pick it only writes og-<n>.png candidates into --out. With --pick it also writes
// public/og-image.png. CHROME env var overrides the browser path.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_ = arg("url", "http://localhost:4173/portfolio/");
const OUT = resolve(arg("out", "og-frames"));
const PICK = arg("pick", "");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
// The page is laid out wider and taller than the card so the whole engine, plume and headline fit,
// then a 1200:630 region is captured at scale 1200/VIEW_W.
const VIEW_W = 1600, VIEW_H = 1000;
const CLIP = { x: 0, y: Number(arg("y", "0")), width: VIEW_W, height: Math.round(VIEW_W * 630 / 1200), scale: 1200 / VIEW_W };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, ".chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,1000", "about:blank",
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
  await send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Page.navigate", { url: URL_ });
  let state = "";
  for (let i = 0; i < 150 && state !== "ready"; i++) {
    await sleep(200);
    state = await evaluate(`document.querySelector("[data-hero-stage]")?.dataset.state || ""`).catch(() => "");
  }
  if (state !== "ready") throw new Error(`hero not ready (state "${state}")`);
  await sleep(3000);

  for (let k = 1; k <= 6; k++) {
    const { data } = await send("Page.captureScreenshot", { format: "png", clip: CLIP });
    writeFileSync(join(OUT, `og-${k}.png`), Buffer.from(data, "base64"));
    await sleep(1100);
  }
  console.log(`wrote 6 candidates to ${OUT}`);
  if (PICK) {
    const src = join(OUT, `og-${PICK}.png`);
    copyFileSync(src, join(root, "public", "og-image.png"));
    console.log(`og-${PICK}.png -> public/og-image.png`);
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
