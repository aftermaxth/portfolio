// Checks the USLI scroll scene timeline (src/js/usli-timeline.js) against content/usli-flight.json.
//   node tools/check_usli_scene.mjs
// Asserts: the scroll mapping rules, the phase and state at every event time in the JSON, the text
// crossings and clear event moments, and that every number in the on-screen labels comes from the JSON.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTimeline, Z_CHECKPOINTS } from "../src/js/usli-timeline.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, "content/usli-flight.json"), "utf8");
const data = JSON.parse(raw);
const tl = createTimeline(data);

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`  FAIL ${msg}`); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- scroll mapping ----
const W = tl.windows;
const total = data.events.find((e) => e.id === "main-booster-landing").t;
const uniform = 1 / total;
ok(W[0].p0 === 0 && W[W.length - 1].p1 === 1, "windows cover 0..1");
W.forEach((w, i) => { if (i) { ok(near(w.p0, W[i - 1].p1), `window ${w.id} starts where ${W[i - 1].id} ends`); ok(near(w.t0, W[i - 1].t1), `window ${w.id} time continues`); } });
const burn = W.find((w) => w.id === "burn");
ok(burn.p1 - burn.p0 >= 0.08, `burn gets ${((burn.p1 - burn.p0) * 100).toFixed(1)} percent of the pin (needs 8)`);
ok(near(burn.t1, data.vehicle.motor.burnoutS), "burn window ends at burnout");
const rate = (w) => (w.p1 - w.p0) / (w.t1 - w.t0);
const moving = W.filter((w) => w.t1 > w.t0);
for (const w of W.filter((x) => x.isEvent)) ok(rate(w) > uniform, `event window ${w.id} gets ${(rate(w) * 100).toFixed(2)} percent per s, more than uniform ${(uniform * 100).toFixed(3)}`);
const drogue = W.find((w) => w.id === "drogue-descent");
ok(moving.every((w) => w === drogue || rate(w) > rate(drogue)), `drogue descent has the least scroll per second (${(rate(drogue) * 100).toFixed(3)} percent per s)`);
let last = -1, mono = true;
for (let p = 0; p <= 1.0000001; p += 0.001) { const t = tl.timeAt(p); if (t < last - 1e-9) mono = false; last = t; }
ok(mono, "timeAt is non-decreasing");
for (const t of [0.5, 2, 10, 17.68, 40, 67.663, 68.481, 80, 93.662, 103]) ok(near(tl.timeAt(tl.progressAt(t)), t, 1e-6), `timeAt(progressAt(${t})) round trip`);
console.log(`mapping: ${W.length} windows, burn ${((burn.p1 - burn.p0) * 100).toFixed(1)} percent, drogue descent ${(rate(drogue) * 100).toFixed(3)} percent per s, uniform ${(uniform * 100).toFixed(3)} percent per s`);

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
  if (flashAt[e.id]) ok(s.flashes.find((f) => f.id === flashAt[e.id]).k === 1, `t=${e.t} ${e.id}: charge flash at full intensity`);
  console.log(`  t=${String(e.t).padEnd(7)} ${e.id.padEnd(28)} phase ${s.phase.id.padEnd(16)} alt ${s.altFt.split ? `main ${s.altFt.main.toFixed(0)} / payload ${s.altFt.payload.toFixed(0)}` : s.altFt.main.toFixed(0)} ft, fire ${s.fire.toFixed(2)}, lane ${s.lane.toFixed(2)}, canvas ${s.front ? "front" : "behind"}`);
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

// ---- island only on final approach ----
let early = 0;
for (let t = 0; t < T.mainLanding; t += 0.05) { const s = tl.stateAt(t); if (s.island.opacity > 0 && Math.min(s.altFt.main, s.altFt.payload) > 260) early++; }
ok(early === 0, "island hidden until the lowest section is under 260 ft");
ok(tl.stateAt(T.main + 1).island.opacity === 0, "island hidden at 500 ft");
ok(tl.stateAt(T.payloadLanding).island.opacity === 1, "island fully in at payload landing");

// ---- text crossings and clear event moments ----
let crossFront = false, crossBehind = false;
for (let t = 0; t < T.mainLanding; t += 0.05) { const s = tl.stateAt(t); if (s.lane > 0.99) { if (s.front) crossFront = true; else crossBehind = true; } }
ok(crossFront, "rocket crosses the text column in front of it");
ok(crossBehind, "rocket crosses the text column behind it");
for (const id of ["apogee", "drogue-charge-backup", "main-and-payload-separation", "payload-parachute-release", "payload-landing", "main-booster-landing"]) {
  const s = tl.stateAt(data.events.find((e) => e.id === id).t);
  ok(s.lane === 0, `${id}: rocket in the clear lane (lane ${s.lane})`);
}
for (const c of Z_CHECKPOINTS) {
  const t = tl.timeAt(c.p + 0.0005);
  ok(tl.stateAt(t).front === c.front, `z checkpoint p=${c.p}: canvas ${c.front ? "front" : "behind"}`);
}

// ---- every number in the on-screen labels comes from the JSON ----
const jsonNumbers = new Set((raw.match(/-?\d+(\.\d+)?/g) || []).map(Number));
for (const p of tl.phases) for (const n of (p.label.match(/\d+(\.\d+)?/g) || []).map(Number)) ok(jsonNumbers.has(n), `label "${p.label}": ${n} is in the JSON`);

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
