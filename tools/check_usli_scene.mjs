// Checks the USLI launch scene against content/usli-flight.json.
//   node tools/check_usli_scene.mjs              pure checks in Node (timeline, play clock, arc path)
//   node tools/check_usli_scene.mjs --browser    also the text-overlap check in headless Chrome
//        [--url http://localhost:4173/portfolio/] [--widths 1440,375]   (after `npm run build` and `npx vite preview --port 4173`)
// Pure checks: the play time map, the arc path (x monotone, apex at apogee, launch and apex tangents, inside
// the card), the phase and state at every event time in the JSON, the island rule, and that every number in
// the on-screen labels comes from the JSON.
// Browser check (DevTools protocol, no dependencies, same approach as tools/audit_a11y.mjs): at each event
// time, fails if any rocket piece drawn at more than 35 percent opacity has a screen rect overlapping a text block.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTimeline, PLAY_SECONDS } from "../src/js/usli-timeline.js";
import { createPath } from "../src/js/usli-path.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, "content/usli-flight.json"), "utf8");
const data = JSON.parse(raw);
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`  FAIL ${msg}`); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- play time map ----
const tl = createTimeline(data, { aspect: 0.9 });
const W = tl.windows;
const total = data.events.find((e) => e.id === "main-booster-landing").t;
const uniform = total / PLAY_SECONDS;
ok(W[0].s0 === 0 && W[W.length - 1].s1 === PLAY_SECONDS, `windows cover 0..${PLAY_SECONDS} s of play`);
ok(PLAY_SECONDS >= 35 && PLAY_SECONDS <= 45, `whole sequence plays in about 40 s (${PLAY_SECONDS})`);
W.forEach((w, i) => { if (i) { ok(near(w.s0, W[i - 1].s1), `window ${w.id} starts where ${W[i - 1].id} ends`); ok(near(w.t0, W[i - 1].t1), `window ${w.id} flight time continues`); } });
ok(near(W[0].t0, 0) && near(W[W.length - 1].t1, total), "play covers ignition to the last landing");
const rate = (w) => (w.t1 - w.t0) / (w.s1 - w.s0);
for (const id of ["burn", "apogee", "600ft", "500ft"]) {
  const w = W.find((x) => x.id === id);
  ok(w.slowed && rate(w) < uniform, `${id} is slowed: ${rate(w).toFixed(2)} flight s per play s, uniform ${uniform.toFixed(2)}`);
}
const drogue = W.find((w) => w.id === "drogue-descent");
ok(W.every((w) => w === drogue || rate(w) < rate(drogue)), `drogue descent is the most compressed (${rate(drogue).toFixed(2)} flight s per play s)`);
let last = -1, mono = true;
for (let s = 0; s <= PLAY_SECONDS; s += 0.01) { const t = tl.flightAt(s); if (t < last - 1e-9) mono = false; last = t; }
ok(mono, "flightAt is non-decreasing");
for (const t of [0.5, 2, 10, 17.68, 40, 67.663, 68.481, 80, 93.662, 103]) ok(near(tl.flightAt(tl.playAt(t)), t, 1e-6), `flightAt(playAt(${t})) round trip`);
console.log(`play map: ${W.length} windows over ${PLAY_SECONDS} s; drogue descent ${rate(drogue).toFixed(2)} flight s per play s, uniform ${uniform.toFixed(2)}`);

// ---- arc path ----
const path = createPath(data.path);
let prevX = -Infinity, monoX = true, inside = true;
for (let i = 0; i <= 2000; i++) {
  const q = path.pathAt(i / 2000, 0.9);
  if (q.x <= prevX && i < 2000) monoX = false;
  if (q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) inside = false;
  prevX = q.x;
}
ok(monoX, "path x increases monotonically");
ok(inside, "no sampled path point leaves the card bounds (0..1 by 0..1)");
const apogee = data.events.find((e) => e.id === "apogee");
const atApogee = tl.anchorAt(apogee.t);
ok(near(atApogee.p, 0.5, 1e-6) && near(atApogee.y, 0, 1e-9), `apex at the apogee time (p ${atApogee.p.toFixed(6)}, y ${atApogee.y.toExponential(1)})`);
for (const aspect of [0.12, 0.9, 1.6]) {
  ok(Math.abs(path.pathAt(0, aspect).angle - 90) < 3, `tangent near 90 degrees at launch (aspect ${aspect}: ${path.pathAt(0, aspect).angle.toFixed(1)})`);
  ok(Math.abs(path.pathAt(0.5, aspect).angle) < 1e-6, `tangent 0 degrees at the apex (aspect ${aspect})`);
}
let higher = true;
for (let t = 0.1; t < apogee.t; t += 0.25) if (tl.anchorAt(t).y < tl.anchorAt(apogee.t).y) higher = false;
ok(higher, "no point of the ascent is higher on the curve than the apex");
console.log(`path: launch ${path.pathAt(0, 0.9).angle.toFixed(1)} deg, apex at p ${atApogee.p.toFixed(4)}, landing x ${path.pathAt(1).x}`);

// ---- phase and state at every event time ----
const expectPhase = {
  liftoff: "burn", "rail-exit": "burn", burnout: "coast", apogee: "apogee", "drogue-charge-primary": "apogee",
  "drogue-charge-backup": "drogue-deploy", "main-and-payload-separation": "main-deploy",
  "payload-parachute-release": "payload-release", "payload-landing": "payload-landed", "main-booster-landing": "landed",
};
const flashAt = { "drogue-charge-primary": "drogue-charge-primary", "drogue-charge-backup": "drogue-charge-backup", "main-and-payload-separation": "main-charge" };
for (const e of data.events) {
  const s = tl.stateAt(e.t);
  ok(expectPhase[e.id] !== undefined, `event ${e.id} has an expected phase`);
  ok(s.phase.id === expectPhase[e.id], `t=${e.t} ${e.id}: phase ${s.phase.id}, expected ${expectPhase[e.id]}`);
  if (e.altFt !== undefined) {
    const alt = e.id === "payload-landing" || e.id === "payload-parachute-release" ? s.altFt.payload : s.altFt.main;
    ok(near(alt, e.altFt, 1e-9), `t=${e.t} ${e.id}: altitude ${alt} ft, JSON ${e.altFt}`);
  }
  if (flashAt[e.id]) {
    const f = s.flashes.find((x) => x.id === flashAt[e.id]);
    ok(f.k === 1 && f.body === "middle", `t=${e.t} ${e.id}: charge flash at full intensity on the avionics bay`);
  }
  console.log(`  t=${String(e.t).padEnd(7)} ${e.id.padEnd(28)} phase ${s.phase.id.padEnd(16)} alt ${s.altFt.split ? `main ${s.altFt.main.toFixed(0)} / payload ${s.altFt.payload.toFixed(0)}` : s.altFt.main.toFixed(0)} ft, fire ${s.fire.toFixed(2)}, arc p ${s.anchors[s.altFt.split ? "main" : "shared"].p.toFixed(3)}`);
}
const T = tl.times;
ok(tl.stateAt(T.liftoff).fire > 0 && tl.stateAt(1.0).fire > 0, "fire on during the burn");
ok(tl.stateAt(T.burnout).fire === 0 && tl.stateAt(5).fire === 0, "fire off from burnout");
ok(tl.stateAt(T.apogee - 0.01).chutes.drogue.deployed === false, "drogue packed before apogee");
ok(tl.stateAt(T.apogee + 3).chutes.drogue.inflate === 1, "drogue open after apogee");
ok(tl.stateAt(T.main - 0.01).chutes.main.deployed === false, "main packed before 600 ft");
ok(tl.stateAt(T.main + 1.0).chutes.main.inflate === 1, "main open after 600 ft");
ok(tl.stateAt(T.payloadRelease - 0.01).chutes.payload.inflate === 0 && tl.stateAt(T.payloadRelease - 0.01).chutes.payload.held, "payload parachute folded and held until 500 ft");
ok(tl.stateAt(T.payloadRelease + 0.3).chutes.payload.inflate === 1, "payload parachute open after release");
ok(tl.stateAt(T.main - 0.01).cords.length === 2 && tl.stateAt(T.main + 0.5).cords.length === 5, "2 drogue cords after apogee, all 5 cords after 600 ft");
const landedP = tl.stateAt(T.payloadLanding);
ok(near(landedP.altFt.payload, 0) && landedP.altFt.main > 0, "payload lands first, the main section is still descending");
ok(near(tl.stateAt(T.mainLanding).altFt.main, 0), "middle body and booster land at the end");
ok(near(tl.stateAt(T.mainLanding).anchors.main.y, 1, 1e-6), "main section lands on the ground line");

// never stationary: the leading anchor moves between any two play frames 0.25 s apart (until landing)
let still = 0;
for (let s = 0.25; s < PLAY_SECONDS - 0.25; s += 0.25) {
  const a = tl.stateAt(tl.flightAt(s)), b = tl.stateAt(tl.flightAt(s + 0.25));
  const ka = a.altFt.split ? "main" : "shared", kb = b.altFt.split ? "main" : "shared";
  if (Math.hypot(a.anchors[ka].x - b.anchors[kb].x, a.anchors[ka].y - b.anchors[kb].y) < 1e-5) still++;
}
ok(still === 0, `the rocket keeps moving along the arc during playback (${still} still steps)`);

// ---- island only on final approach ----
let early = 0;
for (let t = 0; t < T.mainLanding; t += 0.05) { const s = tl.stateAt(t); if (s.island.opacity > 0 && Math.min(s.altFt.main, s.altFt.payload) > 260) early++; }
ok(early === 0, "island hidden until the lowest section is under 260 ft");
ok(tl.stateAt(T.payloadLanding).island.opacity === 1, "island fully in at payload landing");

// ---- every number in the on-screen labels comes from the JSON ----
const jsonNumbers = new Set((raw.match(/-?\d+(\.\d+)?/g) || []).map(Number));
for (const p of tl.phases) for (const n of (p.label.match(/\d+(\.\d+)?/g) || []).map(Number)) ok(jsonNumbers.has(n), `label "${p.label}": ${n} is in the JSON`);

// ---- browser: no opaque rocket rect over a text rect at any event time ----
if (process.argv.includes("--browser")) await browserCheck();

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

async function browserCheck() {
  const URL_ = arg("url", "http://localhost:4173/portfolio/");
  const widths = arg("widths", "1440,375").split(",").map(Number);
  const HEIGHTS = { 1440: 900, 768: 1024, 375: 812 };
  const PORT = 9337;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const profile = mkdtempSync(join(tmpdir(), "usli-"));
  const chrome = spawn(process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank",
  ], { stdio: "ignore" });
  let ws, id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json(); } catch { await sleep(200); } }
    if (!target) throw new Error("Chrome did not start");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
    await send("Page.enable");
    await send("Runtime.enable");
    for (const width of widths) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: HEIGHTS[width] || 900, deviceScaleFactor: 1, mobile: width < 600 });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      await send("Page.navigate", { url: URL_ });
      await sleep(2500);
      await evaluate(`window.scrollTo(0, document.querySelector("[data-usli]").getBoundingClientRect().top + scrollY)`);
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) { await sleep(250); ready = await evaluate(`!!document.querySelector("[data-usli]").usliScene`); }
      ok(ready, `${width}px: scene mounted`);
      if (!ready) continue;
      for (const e of data.events) {
        // scroll the pieces to the middle of the viewport, then settle the fades
        await evaluate(`document.querySelector("[data-usli]").usliScene.seek(${e.t})`);
        await evaluate(`(() => { const d = document.querySelector("[data-usli]").usliScene.debug(); const rs = d.pieces.filter(p => p.rect).map(p => p.rect); window.scrollBy(0, (Math.min(...rs.map(r => r.t)) + Math.max(...rs.map(r => r.b))) / 2 - innerHeight / 2); })()`);
        await sleep(300);
        const r = await evaluate(`(() => { const s = document.querySelector("[data-usli]").usliScene; s.seek(${e.t}); const d = s.debug();
          const ov = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
          return d.pieces.filter(p => p.rect && p.opacity > 0.35 + 1e-3).flatMap(p => d.text.filter(x => ov(p.rect, x.rect)).map(x => p.id + " over " + x.name)); })()`);
        ok(r.length === 0, `${width}px t=${e.t} ${e.id}: no opaque piece over text${r.length ? " -> " + r.join(", ") : ""}`);
      }
      console.log(`browser ${width}px: checked ${data.events.length} event times`);
    }
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
