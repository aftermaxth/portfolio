// Checks the USLI card against content/usli-flight.json.
//   node tools/check_usli_scene.mjs              pure checks in Node (schematic numbers, timeline, play clock, world path)
//   node tools/check_usli_scene.mjs --browser    also the page checks in headless Chrome
//        [--url http://localhost:4173/portfolio/] [--widths 1440,768,375]   (after `npm run build` and `npx vite preview --port 4173`)
// Pure checks: every number in the schematic's labels is in the JSON (and the label set is the one Charles gave);
// the play time map; the world path (pad, apogee at the top, landings on the sheet, nothing below the sheet, never
// still); the phase, altitude and parts at every event time; event labels; label numbers in the JSON.
// Browser checks (DevTools protocol, no dependencies, same approach as tools/audit_a11y.mjs): collapsed card has the
// schematic and no canvas and no scene chunk; label text at 12 px or more; the write-up opens the player at its bottom
// with the controls and readout in one row; nothing autoplays; Play, Pause, the end on the sheet, the off-screen
// pause; with reduced motion only the pad frame shows until Play is pressed.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTimeline, IN, PLAY_SECONDS } from "../src/js/usli-timeline.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, "content/usli-flight.json"), "utf8");
const data = JSON.parse(raw);
const svg = readFileSync(resolve(root, "images/nasa-student-launch/usli-schematic.svg"), "utf8");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`  FAIL ${msg}`); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- schematic: every number in its text is in the JSON ----
const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const valueTexts = texts.filter((s) => !/^DIAMETER EXAGGERATED/.test(s) && !/^[A-Z ]+$/.test(s)); // values, not the upper-case names
const tokens = valueTexts.flatMap((s) => s.match(/[A-Z]*\d+[A-Z]*/g) || []);
// The numbers Charles listed for the labels (brief, 2026-11-04), plus the "2 bulkheads" in the avionics label.
const EXPECTED = ["30", "20", "72", "84", "32", "12", "2", "2", "24", "4", "45", "L1940X", "3", "2", "129"];
ok(JSON.stringify([...tokens].sort()) === JSON.stringify([...EXPECTED].sort()), `schematic label numbers are the given set (${tokens.join(", ")})`);
const v = data.vehicle, sec = Object.fromEntries(v.sectionsTopToBottom.map((s) => [s.id, s])), chute = Object.fromEntries(data.parachutes.map((c) => [c.id, c]));
const pair = (name) => { const m = svg.match(new RegExp(`>${name}</text><text class="t2"[^>]*>([^<]+)<`)); return m ? m[1] : null; };
const SCHEMATIC = [
  ["NOSE CONE", (s) => s === `${titleCase(sec.nosecone.shape)}, ${sec.nosecone.lengthIn} in`],
  ["PAYLOAD TUBE", (s) => s === `${sec["payload-tube"].lengthIn} in`],
  ["MAIN BAY TUBE", (s) => s === `${sec["main-bay-tube"].lengthIn} in`],
  ["SWITCHBAND", (s) => s === `${sec.switchband.lengthIn} in`],
  ["BOOSTER TUBE", (s) => s === `${sec.booster.lengthIn} in`],
  ["PAYLOAD PARACHUTE", (s) => s === `${chute.payload.diameterIn} in`],
  ["MAIN PARACHUTE", (s) => s === `${chute.main.diameterIn} in`],
  ["DROGUE PARACHUTE", (s) => s === `${chute.drogue.diameterIn} in`],
  ["AVIONICS BAY", (s) => s === `${v.avionicsBay.couplerIn} in coupler, ${v.avionicsBay.bulkheads} bulkheads`],
  ["MOTOR MOUNT TUBE", (s) => s === v.motor.name],
  ["CENTERING RINGS", (s) => s === String(v.centeringRings)],
  ["FINS", (s) => s === `${v.fins.count}, ${v.fins.shape}`],
  ["RAIL BUTTONS", (s) => s === String(v.railButtons)],
];
for (const [name, test] of SCHEMATIC) { const s = pair(name); ok(s !== null && test(s), `schematic ${name}: "${s}" matches the JSON`); }
ok(texts.includes(`${v.lengthIn} in overall`), `schematic overall length ${v.lengthIn} in matches the JSON`);
ok(texts.some((s) => s.startsWith(`DIAMETER EXAGGERATED ${data.stylization.schematicDiameterScale}X`)), "schematic caption scale matches stylization.schematicDiameterScale");
ok(/<title id="t">[^<]+<\/title>/.test(svg) && /<desc id="d">[^<]+<\/desc>/.test(svg), "schematic keeps its title and desc");
console.log(`schematic: ${tokens.length} label numbers, all in the JSON: ${tokens.join(" ")}`);

// ---- play time map ----
const tl = createTimeline(data);
const W = tl.windows;
const T = tl.times;
const total = T.mainLanding;
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

// ---- world path ----
const pad = tl.stateAt(0);
ok(near(pad.anchors.shared.x, 0) && near(pad.anchors.shared.y, 0) && near(pad.bodies.booster.rot, 0), "on the pad: aft end on the sheet at x 0, nose up");
const apex = tl.anchorAt(T.apogee);
ok(near(apex.y, tl.heightOf(data.events.find((e) => e.id === "apogee").altFt), 1e-9), `apogee height = altitude x altitudeScale (${apex.y.toFixed(2)} m)`);
let rising = true, highest = true, prevY = -1;
for (let t = T.liftoff; t <= T.apogee; t += 0.01) { const y = tl.anchorAt(t).y; if (y < prevY - 1e-9) rising = false; if (y > apex.y + 1e-9) highest = false; prevY = y; }
ok(rising && highest, "height rises all the way to apogee and apogee is the top");
ok(near(tl.stackRot(T.apogee), -Math.PI / 2), "level at apogee");
ok(Math.abs(tl.stackRot(T.liftoff + 0.3)) < 0.05, `near vertical off the pad (${((tl.stackRot(T.liftoff + 0.3) * 180) / Math.PI).toFixed(1)} deg)`);
let prevX = -Infinity, monoX = true, maxTurn = 0, prevRot = 0;
for (let t = 0; t <= T.mainLanding; t += 0.01) {
  const x = tl.driftX(t); if (x < prevX - 1e-9) monoX = false; prevX = x;
  if (t < T.apogee) { const r = tl.stackRot(t); maxTurn = Math.max(maxTurn, Math.abs(r - prevRot)); prevRot = r; }
}
ok(monoX, "sideways drift never reverses");
ok(maxTurn < 0.05, `the rocket turns smoothly on the way up (largest step ${maxTurn.toFixed(4)} rad per 0.01 s)`);
// nothing below the sheet, at any time
const S = tl.stations;
let below = 0, worst = 0;
for (let t = 0; t <= T.mainLanding + 1e-9; t += 0.02) {
  const s = tl.stateInto(t);
  for (const id of ["booster", "middle", "payload", "nose"]) {
    const b = s.bodies[id], a = s.anchors[b.chain];
    for (const st of [S[id].aft, S[id].fwd]) {
      const r = id === "nose" && st === S.nose.fwd ? 0 : tl.radius; // the nosecone tip has no radius
      const y = a.y + b.y + st * IN * Math.cos(b.rot) - Math.abs(Math.sin(b.rot)) * r;
      if (y < -1e-6) { below++; worst = Math.min(worst, y); }
    }
  }
}
ok(below === 0, `no piece goes below the sheet (${below} samples, worst ${worst.toFixed(4)} m)`);

// ---- phase and state at every event time ----
const expectPhase = {
  liftoff: "burn", "rail-exit": "burn", burnout: "coast", apogee: "apogee", "drogue-charge-primary": "apogee",
  "drogue-charge-backup": "drogue-deploy", "main-and-payload-separation": "main-deploy",
  "payload-parachute-release": "payload-release", "payload-landing": "payload-landed", "main-booster-landing": "landed",
};
for (const e of data.events) {
  const s = tl.stateAt(e.t);
  ok(expectPhase[e.id] !== undefined, `event ${e.id} has an expected phase`);
  ok(s.phase.id === expectPhase[e.id], `t=${e.t} ${e.id}: phase ${s.phase.id}, expected ${expectPhase[e.id]}`);
  if (e.altFt !== undefined) {
    const payloadSide = e.id === "payload-landing" || e.id === "payload-parachute-release";
    const alt = payloadSide ? s.altFt.payload : s.altFt.main;
    ok(near(alt, e.altFt, 1e-9), `t=${e.t} ${e.id}: altitude ${alt} ft, JSON ${e.altFt}`);
    const anchor = s.anchors[s.altFt.split ? (payloadSide ? "payload" : "main") : "shared"];
    ok(near(anchor.y, tl.heightOf(e.altFt), 1e-9), `t=${e.t} ${e.id}: height ${anchor.y.toFixed(3)} m = altitude x altitudeScale`);
  }
  console.log(`  t=${String(e.t).padEnd(7)} ${e.id.padEnd(28)} phase ${s.phase.id.padEnd(16)} alt ${s.altFt.split ? `main ${s.altFt.main.toFixed(0)} / payload ${s.altFt.payload.toFixed(0)}` : s.altFt.main.toFixed(0)} ft, fire ${s.fire.toFixed(2)}, tag ${s.tag.on ? s.tag.label : "-"}`);
}
ok(tl.stateAt(T.liftoff).fire > 0.99 && tl.stateAt(1.0).fire > 0.99, "engine on during the burn");
ok(tl.stateAt(T.burnout + 0.12).fire === 0 && tl.stateAt(5).fire === 0, "engine glow gone 0.12 s after burnout");
ok(tl.stateAt(T.apogee - 0.01).chutes.drogue.deployed === false, "drogue packed before apogee");
ok(tl.stateAt(T.apogee + 3).chutes.drogue.inflate === 1, "drogue open after apogee");
ok(tl.stateAt(T.main - 0.01).chutes.main.deployed === false, "main packed before 600 ft");
ok(tl.stateAt(T.main + 1.0).chutes.main.inflate === 1, "main open after 600 ft");
ok(tl.stateAt(T.payloadRelease - 0.01).chutes.payload.inflate === 0 && tl.stateAt(T.payloadRelease - 0.01).chutes.payload.held, "payload parachute folded and held until 500 ft");
ok(tl.stateAt(T.payloadRelease + 0.3).chutes.payload.inflate === 1, "payload parachute open after release");
const cordsOn = (t) => tl.stateAt(t).cords.filter((c) => c.on).length;
ok(cordsOn(T.apogee - 0.01) === 0 && cordsOn(T.main - 0.01) === 2 && cordsOn(T.main + 0.5) === 5, "no cords before apogee, 2 drogue cords after, all 5 after 600 ft");
const landedP = tl.stateAt(T.payloadLanding);
ok(near(landedP.altFt.payload, 0) && landedP.altFt.main > 0, "payload lands first, the main section is still descending");
const end = tl.stateAt(T.mainLanding);
ok(near(end.altFt.main, 0) && near(end.anchors.main.y, 0, 1e-9), "middle body and booster land on the sheet at the end");
ok(near(tl.anchorAt(T.payloadLanding + 5, "payload").x, tl.anchorAt(T.payloadLanding, "payload").x), "the landed payload stays put");
// separations part along the axes: right after apogee the booster moves straight back along its own (level) axis
const sep0 = tl.stateAt(T.apogee + 0.001), sep1 = tl.stateAt(T.apogee + 0.6);
const ddx = sep1.bodies.booster.x - sep0.bodies.booster.x, ddy = sep1.bodies.booster.y - sep0.bodies.booster.y;
ok(ddx < 0 && Math.abs(ddy) < 1e-9, `at apogee the booster parts straight back along the axis (dx ${ddx.toFixed(3)}, dy ${ddy.toExponential(1)})`);

// never stationary: the leading anchor moves between any two play frames 0.25 s apart (until landing)
let still = 0;
for (let s = 0.25; s < PLAY_SECONDS - 0.25; s += 0.25) {
  const a = tl.stateAt(tl.flightAt(s)), b = tl.stateAt(tl.flightAt(s + 0.25));
  const ka = a.altFt.split ? "main" : "shared", kb = b.altFt.split ? "main" : "shared";
  if (Math.hypot(a.anchors[ka].x - b.anchors[kb].x, a.anchors[ka].y - b.anchors[kb].y) < 1e-5) still++;
}
ok(still === 0, `the rocket keeps moving during playback (${still} still steps)`);

// ---- event labels: each shows at its event, and the landing label stays ----
for (const g of tl.tags) ok(tl.stateAt(g.t).tag.on && tl.stateAt(g.t).tag.id === g.id, `label "${g.label}" shows at t=${g.t}`);
ok(!tl.stateAt(10).tag.on, "no label during the coast");

// ---- every number in the on-screen labels comes from the JSON ----
const jsonNumbers = new Set((raw.match(/-?\d+(\.\d+)?/g) || []).map(Number));
for (const lbl of [...tl.phases.map((p) => p.label), ...tl.tags.map((g) => g.label)]) for (const n of (lbl.match(/\d+(\.\d+)?/g) || []).map(Number)) ok(jsonNumbers.has(n), `label "${lbl}": ${n} is in the JSON`);

if (process.argv.includes("--browser")) await browserCheck();

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

async function browserCheck() {
  const URL_ = arg("url", "http://localhost:4173/portfolio/");
  const widths = arg("widths", "1440,768,375").split(",").map(Number);
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
  const Q = `document.querySelector("[data-usli]")`;
  const load = async (width, reduce) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height: HEIGHTS[width] || 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
    await send("Page.navigate", { url: URL_ });
    await sleep(2500);
    await evaluate(`document.querySelector("#nasa-student-launch").scrollIntoView(); true`);
    await sleep(400);
  };
  const chunkLoaded = `performance.getEntriesByType("resource").some((e) => /usli-scene/.test(e.name))`;
  const waitFor = async (expr, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if (await evaluate(expr)) return true; await sleep(200); } return false; };
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
      await load(width, false);
      // collapsed: schematic, no canvas, no scene chunk
      const c = await evaluate(`(() => { const card = document.querySelector("#nasa-student-launch");
        const svg = card.querySelector("svg.usli-schematic"), body = card.querySelector(".project__body");
        const t = [...svg.querySelectorAll("text")].filter((x) => getComputedStyle(x).display !== "none");
        const scale = svg.getScreenCTM().a;
        const labelPx = t.length ? Math.min(...t.map((x) => parseFloat(getComputedStyle(x).fontSize) * scale)) : null;
        const legend = card.querySelector(".usli__legend"), lv = getComputedStyle(legend).position !== "absolute";
        const legendPx = lv ? Math.min(...[...legend.querySelectorAll("dt, dd")].map((x) => parseFloat(getComputedStyle(x).fontSize))) : null;
        const sr = svg.getBoundingClientRect(), br = body.getBoundingClientRect();
        return { canvases: card.querySelectorAll("canvas").length, chunk: ${chunkLoaded}, labels: t.length, labelPx, legendVisible: lv, legendPx,
          svgH: Math.round(sr.height), bodyH: Math.round(br.height), sideBySide: sr.right <= br.left + 1, scroll: Math.max(document.documentElement.scrollWidth, innerWidth) - ${width} }; })()`);
      ok(c.canvases === 0 && !c.chunk, `${width}px collapsed: no canvas and no scene chunk (${c.canvases} canvases, chunk ${c.chunk})`);
      ok(c.labels ? c.labelPx >= 11.95 : c.legendVisible && c.legendPx >= 12, `${width}px collapsed: schematic text at 12 px or more (${c.labels ? `${c.labels} SVG labels at ${c.labelPx.toFixed(2)} px` : `legend at ${c.legendPx} px`})`);
      ok(c.scroll <= 0, `${width}px: no horizontal scroll (${c.scroll})`);
      console.log(`  ${width}px collapsed: schematic ${c.svgH} px tall, text column ${c.bodyH} px, ${c.sideBySide ? "side by side" : "stacked"}, ${c.labels ? "SVG labels" : "legend list"}`);

      // open the write-up: player at the bottom, scene chunk loads, nothing plays
      await evaluate(`document.querySelector("#nasa-student-launch [data-toggle]").click(); true`);
      const live = await waitFor(`${Q}.dataset.state === "live" && !!${Q}.usliScene`);
      ok(live, `${width}px: write-up open loads the player`);
      if (!live) continue;
      await sleep(1500);
      const o = await evaluate(`(() => { const p = ${Q}, more = p.closest("[data-more]"), s = p.usliScene;
        const r = (el) => el.getBoundingClientRect();
        const tg = r(p.querySelector("[data-usli-toggle]")), rs = r(p.querySelector("[data-usli-restart]")), ro = r(p.querySelector(".usli__readout")), cv = r(p.querySelector("canvas"));
        const text = r(more.querySelector(".usli__more-text"));
        return { playing: s.playing, time: p.querySelector("[data-r-time]").textContent, gap: Math.round(r(more).bottom - r(p).bottom),
          left: Math.round(r(p).left - r(more).left - parseFloat(getComputedStyle(more).paddingLeft)), textLeft: Math.round(text.left), playerRight: Math.round(r(p).right),
          oneRow: Math.abs(tg.top - rs.top) < 1 && ro.left >= rs.right && ro.top < tg.bottom && ro.bottom > tg.top,
          tap: Math.min(tg.height, rs.height, tg.width, rs.width), canvasBelowTitle: cv.top >= r(p.querySelector(".usli__player-title")).bottom,
          barBelowCanvas: tg.top >= cv.bottom, position: getComputedStyle(p).position }; })()`);
      ok(!o.playing && o.time === "T+ 0.0 s", `${width}px: nothing autoplays (${o.time})`);
      ok(o.gap <= 1 && o.position === "static", `${width}px: player at the bottom of the write-up, in normal flow (${o.gap} px from the bottom)`);
      if (width >= 900) ok(o.left === 0 && o.playerRight <= o.textLeft, `${width}px: player in the left column, text to its right`);
      ok(o.oneRow && o.barBelowCanvas && o.canvasBelowTitle, `${width}px: canvas on top, then Play, Restart and the readout in one row`);
      ok(o.tap >= 44, `${width}px: 44 px touch targets (${o.tap})`);

      // play, pause
      await evaluate(`${Q}.scrollIntoView({ block: "center" }); ${Q}.querySelector("[data-usli-toggle]").click(); true`);
      await sleep(1500);
      const p1 = await evaluate(`({ playing: ${Q}.usliScene.playing, s: ${Q}.usliScene.playSeconds, pressed: ${Q}.querySelector("[data-usli-toggle]").getAttribute("aria-pressed"), label: ${Q}.querySelector("[data-usli-toggle]").textContent })`);
      ok(p1.playing && p1.s > 0.2 && p1.pressed === "true" && p1.label === "Pause", `${width}px: Play runs (${p1.s.toFixed(2)} s of play, aria-pressed ${p1.pressed})`);
      await evaluate(`${Q}.querySelector("[data-usli-toggle]").click(); true`);
      await sleep(300);
      const p2 = await evaluate(`({ playing: ${Q}.usliScene.playing, pressed: ${Q}.querySelector("[data-usli-toggle]").getAttribute("aria-pressed") })`);
      ok(!p2.playing && p2.pressed === "false", `${width}px: Pause stops it`);

      // off screen: pauses, renders nothing, resumes on return
      await evaluate(`${Q}.querySelector("[data-usli-toggle]").click(); true`);
      await sleep(400);
      await evaluate(`window.scrollTo(0, 0); true`);
      await sleep(800);
      const f0 = await evaluate(`${Q}.usliScene.frames()`);
      await sleep(800);
      const off = await evaluate(`({ playing: ${Q}.usliScene.playing, frames: ${Q}.usliScene.frames() })`);
      ok(!off.playing && off.frames === f0, `${width}px: off screen it pauses and draws no frames (${off.frames - f0} frames)`);
      await evaluate(`${Q}.scrollIntoView({ block: "center" }); true`);
      await sleep(800);
      ok(await evaluate(`${Q}.usliScene.playing`), `${width}px: back on screen it resumes`);

      // the end: seek near the end, play out, stop on the sheet, keep the landed frame
      await evaluate(`(() => { const s = ${Q}.usliScene; s.seek(s.timeline().flightAt(${PLAY_SECONDS - 1.2})); s.play(); return true; })()`);
      await sleep(2500);
      const e = await evaluate(`(() => { const s = ${Q}.usliScene, d = s.debug(); return { d, time: ${Q}.querySelector("[data-r-time]").textContent, label: ${Q}.querySelector("[data-usli-toggle]").textContent }; })()`);
      const minY = Math.min(...e.d.pieces.map((p) => p.minY));
      const inside = e.d.pieces.every((p) => p.rect.l >= 0 && p.rect.r <= e.d.canvas.w && p.rect.t >= 0 && p.rect.b <= e.d.canvas.h);
      ok(e.d.finished && !e.d.playing && e.label === "Play" && e.time === `T+ ${T.mainLanding.toFixed(1)} s`, `${width}px: plays once and stops at landing (${e.time})`);
      ok(minY > -0.005 && minY < 0.005, `${width}px: ends on the sheet (lowest point ${minY.toFixed(4)} m)`);
      ok(inside, `${width}px: every landed piece inside the canvas`);
      ok(e.d.tag === "Booster lands", `${width}px: landing label shown (${e.d.tag})`);
    }

    // reduced motion: stills until Play is pressed, then it plays
    const w = widths[widths.length - 1];
    await load(w, true);
    await evaluate(`document.querySelector("#nasa-student-launch [data-toggle]").click(); true`);
    await sleep(1500);
    const r0 = await evaluate(`({ chunk: ${chunkLoaded}, state: ${Q}.dataset.state, poster: /scene-1-pad/.test(${Q}.querySelector("img.usli__poster")?.src || ""), stills: [...${Q}.querySelectorAll("img")].filter((i) => i.getBoundingClientRect().height > 0 && i.alt).length, controls: !${Q}.querySelector("[data-usli-controls]").hidden })`);
    ok(!r0.chunk && r0.state === "still" && r0.stills === 1 && r0.poster && r0.controls, `${w}px reduced motion: only the pad frame (with alt text) and the controls, no scene chunk yet`);
    await evaluate(`${Q}.scrollIntoView({ block: "center" }); ${Q}.querySelector("[data-usli-toggle]").click(); true`);
    const rl = await waitFor(`!!${Q}.usliScene && ${Q}.usliScene.playing`);
    ok(rl, `${w}px reduced motion: Play loads the scene and plays`);
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
