// USLI launch and recovery timeline. Pure functions, no three.js and no DOM, so tools/check_usli_scene.mjs
// can test it in Node. Every flight number comes from content/usli-flight.json (passed in as `data`).
//
//   const tl = createTimeline(data)
//   tl.flightAt(s)     play clock seconds (0..PLAY_SECONDS) -> flight time in s (PLAY_WINDOWS)
//   tl.stateInto(t)    everything the scene draws at flight time t, written into one reused object (no allocation)
//   tl.stateAt(t)      the same as a fresh copy (tests)
//
// World: scene meters, y up, the landing sheet at y = 0. Each piece belongs to a chain ("shared" until the 600 ft
// separation, then "main" or "payload"). The chain's anchor sits at height altitude x scene.altitudeScale above
// the sheet (path not to scale) and drifts sideways by an illustrative amount (scene.ascentDriftM, descentDriftM).
// The anchor is the booster aft end for shared and main, the nosecone tip for payload. Piece poses are in meters
// relative to their chain's anchor. A pose {x, y, rot} places the CAD frame of the STL export: station s (inches
// from the aft end, on the rocket axis) sits at (x - s * IN * sin(rot), y + s * IN * cos(rot)).
// rot 0 = nose up, -PI = nose down, -PI/2 = nose to the right.

export const IN = 0.0254;
const FT = 0.3048;

// Play time map (BUILD_LOG.md, 2026-11-04): [play from, play to, flight from, flight to, id, slowed]
export const PLAY_WINDOWS = [
  [0, 4, 0, null, "burn", true], // flight to = burnout from the JSON
  [4, 10, null, 17.0, "coast", false],
  [10, 16, 17.0, 21.0, "apogee", true],
  [16, 22, 21.0, 67.0, "drogue-descent", false],
  [22, 27, 67.0, 68.2, "600ft", true],
  [27, 31, 68.2, 70.5, "500ft", true],
  [31, 40, 70.5, null, "descent", false], // flight to = main-booster-landing from the JSON
];
export const PLAY_SECONDS = 40;

// Stations along the rocket in inches from the aft end. JSON where it gives them, otherwise measured
// from the STL export (rocket_stls, 2026-11-04; every JSON section joint matches the STLs within 0.1 in).
function stations(data) {
  const len = Object.fromEntries(data.vehicle.sectionsTopToBottom.map((s) => [s.id, s.lengthIn]));
  const boosterFwd = len.booster; // 45 (JSON)
  const switchFwd = boosterFwd + len.switchband; // 47
  const mainFwd = switchFwd + len["main-bay-tube"]; // 79
  const payloadFwd = mainFwd + len["payload-tube"]; // 99
  const noseTip = payloadFwd + len.nosecone; // 129
  return {
    booster: { aft: 0, fwd: boosterFwd, attach: boosterFwd - 17, center: boosterFwd / 2 }, // bulkhead 17 in inside (JSON)
    middle: { aft: 40.0, fwd: mainFwd, attachAft: 40.1, attachFwd: 51.9, center: (40 + mainFwd) / 2 }, // avionics coupler 40.0 to 52.0 (STL)
    payload: { aft: 72.9, fwd: payloadFwd, attachAft: 73.1, attachFwd: 88.7, center: (72.9 + payloadFwd) / 2 }, // payload coupler 72.9 to 88.9 (STL)
    nose: { aft: 92.9, fwd: noseTip, attach: 93.1, center: (92.9 + noseTip) / 2 }, // nosecone shoulder and bulkhead (STL)
    upper: { aft: 40.0, fwd: noseTip, attach: 40.1, center: (40 + noseTip) / 2 }, // middle + payload + nose before 600 ft
    bays: { drogue: [boosterFwd - 17, 40.0], main: [51.9, 72.9], payloadChute: [74.5, 81.5] },
    switchband: [boosterFwd, switchFwd],
    railButtons: [2.0, 44.0], // measured from images/nasa-student-launch/usli-schematic.svg (count 2 in the JSON)
    finSpanIn: 6.0,
    radiusIn: data.vehicle.diameterIn / 2,
  };
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };

function interp(curve, t) {
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, a1] = curve[i];
    if (t <= t1) { const [t0, a0] = curve[i - 1]; return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0); }
  }
  return curve[curve.length - 1][1];
}

// Merge the event points (t, altFt) into a curve so the readout shows the event's own altitude at the event.
function withEvents(curve, points) {
  const out = curve.map((p) => [p[0], p[1]]);
  for (const [t, a] of points) {
    const i = out.findIndex((p) => p[0] >= t);
    if (i >= 0 && Math.abs(out[i][0] - t) < 1e-6) out[i][1] = a;
    else if (i < 0) out.push([t, a]);
    else out.splice(i, 0, [t, a]);
  }
  return out;
}

// Pose helpers. Each writes into `out` and returns it, so the per-frame path allocates nothing. Inputs are read
// before `out` is written, so `out` may be one of the inputs.
const P = () => ({ x: 0, y: 0, rot: 0 });
const V = () => ({ x: 0, y: 0 });
const sa = V(), sb = V();
function at(pose, s, out) {
  const x = pose.x - s * IN * Math.sin(pose.rot), y = pose.y + s * IN * Math.cos(pose.rot);
  out.x = x; out.y = y; return out;
}
function poseWith(s, px, py, rot, out) { out.x = px + s * IN * Math.sin(rot); out.y = py - s * IN * Math.cos(rot); out.rot = rot; return out; }
function blendPose(a, b, s, k, out) {
  at(a, s, sa); at(b, s, sb);
  return poseWith(s, lerp(sa.x, sb.x, k), lerp(sa.y, sb.y, k), lerp(a.rot, b.rot, k), out);
}
function along(pose, s, d, out) {
  const x = pose.x - (s * IN + d) * Math.sin(pose.rot), y = pose.y + (s * IN + d) * Math.cos(pose.rot);
  out.x = x; out.y = y; return out;
}
function shift(pose, d, out) {
  const x = pose.x - d * Math.sin(pose.rot), y = pose.y + d * Math.cos(pose.rot);
  out.x = x; out.y = y; out.rot = pose.rot; return out;
}
function mix(a, b, k, out) { const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k); out.x = x; out.y = y; return out; }
function copy(src, out) { out.x = src.x; out.y = src.y; if ("rot" in out) out.rot = src.rot; return out; }

export function createTimeline(data) {
  const ev = Object.fromEntries(data.events.map((e) => [e.id, e]));
  const chute = Object.fromEntries(data.parachutes.map((c) => [c.id, c]));
  const cordFt = Object.fromEntries(data.shockCords.map((c) => [c.id, c.lengthFt]));
  const k = data.scene.cordScale;
  const D = data.stylization.diameterScale;
  const S = stations(data);
  const cord = (id) => cordFt[id] * FT * k;
  const lines = (id) => chute[id].lineLengthIn * IN * k;
  const diameter = (id) => chute[id].diameterIn * IN * D; // keeps its proportion to the (stylized) tube
  const R = S.radiusIn * IN * D;

  const T = {
    ignition: 0,
    liftoff: ev.liftoff.t,
    burnout: data.vehicle.motor.burnoutS,
    apogee: ev.apogee.t,
    drogueBackup: ev["drogue-charge-backup"].t,
    main: ev["main-and-payload-separation"].t,
    payloadRelease: ev["payload-parachute-release"].t,
    payloadLanding: ev["payload-landing"].t,
    mainLanding: ev["main-booster-landing"].t,
  };
  // The JSON gives "backup about 1 s later" for the 600 ft charge, the same spacing as the drogue charges.
  T.mainBackup = T.main + (T.drogueBackup - ev["drogue-charge-primary"].t);
  const mainOpen = chute.main.openingTimeS;
  const payloadOpen = chute.payload.openingTimeS;
  const apogeeFt = ev.apogee.altFt;

  const curves = data.altitudeCurveFtByTimeS;
  const shared = withEvents(curves.ascentAndDrogue, [[T.liftoff, ev.liftoff.altFt], [T.apogee, apogeeFt]]);
  const mainCurve = withEvents(curves.mainBooster, [[T.main, ev["main-and-payload-separation"].altFt], [T.mainLanding, ev["main-booster-landing"].altFt]]);
  const payloadCurve = withEvents(curves.payloadNosecone, [
    [T.main, ev["main-and-payload-separation"].altFt],
    [T.payloadRelease, ev["payload-parachute-release"].altFt],
    [T.payloadLanding, ev["payload-landing"].altFt],
  ]);
  const altShared = (t) => (t < T.liftoff ? 0 : interp(shared, t));
  const altMain = (t) => (t < T.main ? altShared(t) : interp(mainCurve, t));
  const altPayload = (t) => (t < T.main ? altShared(t) : interp(payloadCurve, t));

  // ---- world anchors: height from altitude at one fixed ratio, illustrative sideways drift ----
  const HS = data.scene.altitudeScale;
  const heightOf = (ft) => ft * FT * HS;
  const apex = heightOf(apogeeFt);
  // The run reads 4862 ft from 17.48 s already; hold the height a hair (at most 0.2 percent) under apogee until the
  // apogee time, so the rocket keeps moving and reaches the top exactly at apogee. The hold ramps in over the
  // second before (slower than the climb there) and out over the last 0.5 s.
  const hold = (t) => (t >= T.apogee ? 0 : 0.002 * apex * Math.min(clamp((t - (T.apogee - 1.5)) / 1.0), clamp((T.apogee - t) / 0.5)));
  const sharedHeight = (t) => heightOf(altShared(t)) - hold(t);
  const XA = data.scene.ascentDriftM, XD = data.scene.descentDriftM, TAU = 2;
  const climb = T.apogee - T.liftoff;
  const vApogee = (2 * XA) / climb; // sideways speed at apogee (x = XA u^2 on the way up)
  const vDrift = Math.max(0, (XD - vApogee * TAU) / (T.mainLanding - T.apogee));
  const driftX = (t) => {
    if (t <= T.liftoff) return 0;
    if (t <= T.apogee) { const u = (t - T.liftoff) / climb; return XA * u * u; }
    const d = t - T.apogee;
    return XA + vApogee * TAU * (1 - Math.exp(-d / TAU)) + vDrift * d;
  };
  const heightAt = (t, chain) => (t < T.main || chain === "shared" ? sharedHeight(t) : heightOf(chain === "payload" ? altPayload(t) : altMain(t)));
  // Landed chains stop drifting.
  const xAt = (t, chain) => driftX(chain === "payload" ? Math.min(t, T.payloadLanding) : Math.min(t, T.mainLanding));
  const anchorAt = (t, chain = "shared", out = V()) => { out.x = xAt(t, chain); out.y = heightAt(t, chain); return out; };

  // Rocket axis along the velocity on the way up (vertical on the pad, level at apogee), level after apogee.
  const stackRot = (t) => {
    if (t >= T.apogee) return -Math.PI / 2;
    const vx = t <= T.liftoff ? 0 : (2 * XA * (t - T.liftoff)) / (climb * climb);
    const h = 0.3, t0 = Math.max(0, t - h), t1 = t + h;
    const vy = (sharedHeight(t1) - sharedHeight(t0)) / (t1 - t0);
    const raw = vx === 0 && vy <= 0 ? 0 : -Math.atan2(vx, Math.max(vy, 0));
    return lerp(raw, -Math.PI / 2, smooth(T.apogee - 0.6, T.apogee, t));
  };

  // ---- play clock ----
  const windows = PLAY_WINDOWS.map(([s0, s1, t0, t1, id, slowed]) => ({ s0, s1, t0, t1, id, slowed }));
  windows[0].t1 = T.burnout;
  windows[1].t0 = T.burnout;
  windows[windows.length - 1].t1 = T.mainLanding;
  const flightAt = (s) => {
    s = clamp(s, 0, PLAY_SECONDS);
    const w = windows.find((x) => s <= x.s1) || windows[windows.length - 1];
    return lerp(w.t0, w.t1, (s - w.s0) / (w.s1 - w.s0));
  };
  const playAt = (t) => {
    const w = windows.find((x) => t <= x.t1) || windows[windows.length - 1];
    return lerp(w.s0, w.s1, clamp((t - w.t0) / (w.t1 - w.t0)));
  };

  // ---- phases (readout label). Each starts at a JSON event time. ----
  const g = (id) => ev[id].chargeG;
  const PHASES = [
    { id: "pad", from: -Infinity, label: "On the pad" },
    { id: "burn", from: T.liftoff, label: `Motor burn, ${data.vehicle.motor.name}` },
    { id: "coast", from: T.burnout, label: "Burnout, coasting to apogee" },
    { id: "apogee", from: T.apogee, label: `Apogee, drogue charge ${g("drogue-charge-primary")} g` },
    { id: "drogue-deploy", from: T.drogueBackup, label: `Backup charge ${g("drogue-charge-backup")} g, drogue opens` },
    { id: "drogue-descent", from: windows[3].t0, label: "Descent under the drogue" },
    { id: "main-deploy", from: T.main, label: `${ev["main-and-payload-separation"].altFt} ft, main charge ${g("main-and-payload-separation")} g` },
    { id: "payload-release", from: T.payloadRelease, label: `${ev["payload-parachute-release"].altFt} ft, payload parachute released` },
    { id: "main-descent", from: windows[6].t0, label: "Descent under the main and payload parachutes" },
    { id: "payload-landed", from: T.payloadLanding, label: `Payload lands at ${ev["payload-landing"].speedFtS} ft/s` },
    { id: "landed", from: T.mainLanding, label: `Middle body and booster land at ${ev["main-booster-landing"].speedFtS} ft/s` },
  ];
  const phaseAt = (t) => { let p = PHASES[0]; for (const x of PHASES) if (t >= x.from) p = x; return p; };

  // ---- event labels: shown for TAG_PLAY_S seconds of play from the event, next to where it happens ----
  const TAG_PLAY_S = 2.6;
  const TAGS = [
    { id: "apogee", t: T.apogee, label: "Apogee, separation" },
    { id: "drogue-backup", t: T.drogueBackup, label: "Backup charge" },
    { id: "main", t: T.main, label: `${ev["main-and-payload-separation"].altFt} ft separation` },
    { id: "payload-release", t: T.payloadRelease, label: `${ev["payload-parachute-release"].altFt} ft release` },
    { id: "payload-landing", t: T.payloadLanding, label: "Payload lands" },
    { id: "main-landing", t: T.mainLanding, label: "Booster lands" },
  ].map((x) => ({ ...x, play: playAt(x.t) }));

  // ---- configurations, relative to the chain anchors (persistent objects, rewritten each call) ----
  const sway = (t, f, a) => a * Math.sin(t * f) * smooth(T.apogee, T.apogee + 4, t);
  const SPREAD = 0.24 * D; // side spacing between pieces hanging next to each other
  const PAYLOAD_OFFSET = -(diameter("main") + diameter("payload")) / 2 - 0.4; // payload chain hangs left of the main chain

  // Under the drogue (apogee to 600 ft): booster nose-up on the 24 ft cord, the rest nose-down on the 6 ft cord.
  const dC = { booster: P(), upper: P(), drogueCf: V() };
  function drogueConfig(t) {
    poseWith(0, SPREAD + sway(t, 0.7, 0.04), 0, 0, dC.booster);
    dC.drogueCf.x = sway(t, 0.5, 0.05);
    dC.drogueCf.y = at(dC.booster, S.booster.attach, sa).y + cord("drogue-aft");
    poseWith(S.upper.attach, -SPREAD + sway(t, 0.6, 0.04), dC.drogueCf.y - cord("drogue-forward"), -Math.PI, dC.upper);
    return dC;
  }

  // Under the main (after 600 ft): main / 25 ft / middle (nose-up) / 6 ft / drogue / 24 ft / booster.
  // Payload chain: payload parachute / 15 ft / payload (nose-down) / 15 ft / nosecone (tip down).
  const mC = { booster: P(), middle: P(), payload: P(), nose: P(), drogueCf: V(), mainCf: V(), payloadCf: V() };
  function mainConfig(t) {
    poseWith(0, sway(t, 0.45, 0.05), 0, 0, mC.booster);
    mC.drogueCf.x = mC.booster.x + 0.04;
    mC.drogueCf.y = at(mC.booster, S.booster.attach, sa).y + cord("drogue-aft");
    poseWith(S.middle.attachAft, mC.booster.x - 0.02, mC.drogueCf.y + cord("drogue-forward"), 0, mC.middle);
    mC.mainCf.x = mC.middle.x;
    mC.mainCf.y = at(mC.middle, S.middle.attachFwd, sa).y + cord("main");
    const xp = PAYLOAD_OFFSET + sway(t, 0.55, 0.05);
    poseWith(S.nose.fwd, xp, 0, -Math.PI, mC.nose);
    poseWith(S.payload.attachFwd, xp, at(mC.nose, S.nose.attach, sa).y + cord("payload-to-nosecone"), -Math.PI, mC.payload);
    mC.payloadCf.x = xp;
    mC.payloadCf.y = at(mC.payload, S.payload.attachAft, sa).y + cord("payload-to-parachute");
    return mC;
  }

  // Payload and nosecone after touchdown: both tip over and lie on the sheet, the canopy deflates flat beside them.
  const sP = { nose: P(), payload: P(), payloadCf: { x: PAYLOAD_OFFSET + 1.6, y: 0.02 } };
  poseWith(S.nose.center, PAYLOAD_OFFSET - 0.5, R, -Math.PI / 2, sP.nose);
  poseWith(S.payload.center, PAYLOAD_OFFSET + 0.6, R, -1.5 * Math.PI, sP.payload); // a quarter turn from nose-down, like the nosecone

  // ---- the state object, reused on every call ----
  const chuteState = (id) => ({ pos: V(), rot: 0, inflate: 0, deployed: false, held: false, settle: 0, diameter: diameter(id), lineLength: lines(id), gores: chute[id].lines, chain: "shared" });
  const ST = {
    t: 0, phase: PHASES[0],
    altFt: { main: 0, payload: 0, split: false },
    anchors: { shared: V(), main: V(), payload: V() },
    bodies: { booster: { ...P(), chain: "shared" }, middle: { ...P(), chain: "shared" }, payload: { ...P(), chain: "shared" }, nose: { ...P(), chain: "shared" } },
    chutes: { drogue: chuteState("drogue"), main: chuteState("main"), payload: chuteState("payload") },
    cords: ["drogue-forward", "drogue-aft", "main", "payload-to-parachute", "payload-to-nosecone"].map((id) => ({ id, on: false, chain: "shared", a: V(), b: V() })),
    fire: 0,
    tag: { id: "", label: "", on: false, chain: "shared", x: 0, y: 0 },
  };
  const stack = P(), upper = P(), tmp = P(), pt = V(), pt2 = V();
  const B = ST.bodies, C = ST.chutes, CORD = Object.fromEntries(ST.cords.map((c) => [c.id, c]));
  const setCord = (id, chain, a, b) => { const c = CORD[id]; c.on = true; c.chain = chain; copy(a, c.a); copy(b, c.b); };

  function stateInto(tIn) {
    const t = clamp(tIn, 0, T.mainLanding);
    const split = t >= T.main;
    ST.t = t;
    ST.phase = phaseAt(t);
    ST.altFt.main = altMain(t); ST.altFt.payload = altPayload(t); ST.altFt.split = split;
    stack.x = 0; stack.y = 0; stack.rot = stackRot(t);

    // ---- apogee: separation gap along the axis, then blend to the drogue configuration ----
    const gapA = smooth(T.apogee + 0.02, T.apogee + 0.9, t) * 0.55;
    const toDrogue = smooth(T.apogee + 1.2, T.apogee + 2.9, t);
    drogueConfig(t);
    const booster = B.booster;
    if (t < T.apogee) { copy(stack, booster); copy(stack, upper); }
    else {
      blendPose(shift(stack, -gapA, tmp), dC.booster, S.booster.center, toDrogue, booster);
      blendPose(stack, dC.upper, S.upper.center, toDrogue, upper);
    }
    copy(upper, B.middle); copy(upper, B.payload); copy(upper, B.nose);

    const drogue = C.drogue;
    const drogueOut = smooth(T.apogee + 0.4, T.apogee + 1.1, t);
    at(booster, (S.bays.drogue[0] + S.bays.drogue[1]) / 2, pt); // in the drogue bay
    along(booster, S.booster.fwd, gapA / 2, pt2); // middle of the gap, off to the side
    pt2.x += 0.25 * D; pt2.y += 0.2;
    mix(pt, pt2, drogueOut, drogue.pos);
    mix(drogue.pos, dC.drogueCf, toDrogue, drogue.pos);
    drogue.rot = lerp(booster.rot, 0, drogueOut);
    drogue.inflate = smooth(T.apogee + 1.2, T.apogee + 2.0, t);
    drogue.deployed = t >= T.apogee + 0.4;
    drogue.held = false;

    // ---- 600 ft: payload section leaves the main-bay tube, main comes out and opens ----
    const main = C.main, pchute = C.payload;
    at(upper, (S.bays.main[0] + S.bays.main[1]) / 2, main.pos);
    main.rot = upper.rot; main.inflate = 0; main.deployed = false; main.held = false;
    at(upper, (S.bays.payloadChute[0] + S.bays.payloadChute[1]) / 2, pchute.pos);
    pchute.rot = upper.rot; pchute.inflate = 0; pchute.deployed = false; pchute.held = true; pchute.settle = 0;
    if (split) {
      mainConfig(t);
      const sepP = smooth(T.main + 0.02, T.main + 0.3, t) * 0.5;
      const sepN = smooth(T.main + 0.2, T.main + 0.45, t) * 0.35;
      const toMain = smooth(T.main + 0.3, T.main + 1.2, t);
      blendPose(upper, mC.middle, S.middle.center, toMain, B.middle);
      shift(upper, sepP, tmp); // payload section, parted along the axis
      blendPose(tmp, mC.payload, S.payload.center, toMain, B.payload);
      shift(tmp, sepN, tmp); // nosecone, parted a little further
      blendPose(tmp, mC.nose, S.nose.center, toMain, B.nose);
      blendPose(dC.booster, mC.booster, S.booster.center, toMain, booster);
      mix(dC.drogueCf, mC.drogueCf, toMain, drogue.pos);
      drogue.inflate = lerp(1, 0.55, toMain);

      const mainExit = smooth(T.main + 0.1, T.main + 0.3, t);
      const placed = smooth(T.main + 0.3, T.main + 0.9, t);
      at(B.middle, (S.bays.main[0] + S.bays.main[1]) / 2, pt);
      along(B.middle, S.middle.fwd, 0.35, pt2);
      mix(pt, pt2, mainExit, main.pos);
      mix(main.pos, mC.mainCf, placed, main.pos);
      main.rot = lerp(B.middle.rot, 0, mainExit);
      main.deployed = true;
      main.inflate = smooth(T.main + 0.3, T.main + 0.3 + mainOpen, t);

      const bundleOut = smooth(T.main + 0.25, T.main + 0.8, t);
      at(B.payload, (S.bays.payloadChute[0] + S.bays.payloadChute[1]) / 2, pt);
      mix(pt, mC.payloadCf, bundleOut, pchute.pos);
      pchute.rot = lerp(B.payload.rot, 0, bundleOut);
      pchute.deployed = true;
    }
    if (t >= T.payloadRelease) {
      pchute.held = false;
      pchute.inflate = smooth(T.payloadRelease, T.payloadRelease + payloadOpen, t);
    }
    if (t >= T.payloadLanding) {
      const s = smooth(T.payloadLanding, T.payloadLanding + 2.0, t);
      blendPose(mC.payload, sP.payload, S.payload.center, s, B.payload);
      blendPose(mC.nose, sP.nose, S.nose.fwd, s, B.nose); // pivots on its tip, which stays on the sheet
      mix(mC.payloadCf, sP.payloadCf, s, pchute.pos);
      pchute.rot = 0;
      pchute.settle = s; // the scene flattens the canopy onto the sheet
    }

    const mainChain = split ? "main" : "shared", payloadChain = split ? "payload" : "shared";
    B.booster.chain = B.middle.chain = mainChain;
    B.payload.chain = B.nose.chain = payloadChain;
    drogue.chain = main.chain = mainChain;
    pchute.chain = payloadChain;

    // ---- cords (shown once a separation has started), in the frame of their chain ----
    for (const c of ST.cords) c.on = false;
    if (t >= T.apogee + 0.02) {
      setCord("drogue-forward", mainChain, drogue.pos, at(B.middle, S.middle.attachAft, pt));
      setCord("drogue-aft", mainChain, drogue.pos, at(booster, S.booster.attach, pt));
    }
    if (t >= T.main + 0.02) {
      setCord("main", "main", main.pos, at(B.middle, S.middle.attachFwd, pt));
      setCord("payload-to-parachute", "payload", pchute.pos, at(B.payload, S.payload.attachAft, pt));
      setCord("payload-to-nosecone", "payload", at(B.payload, S.payload.attachFwd, pt2), at(B.nose, S.nose.attach, pt));
    }

    // ---- motor: glow and plume from ignition, fading out at burnout ----
    ST.fire = (t < T.liftoff ? 0.6 * smooth(T.ignition, T.liftoff, t) : 1) * (1 - smooth(T.burnout - 0.12, T.burnout + 0.12, t));

    // ---- event label: the latest event within TAG_PLAY_S of play; the landing label stays ----
    const tag = ST.tag, s = playAt(t);
    tag.on = false;
    for (const x of TAGS) {
      if (t < x.t || (s - x.play > TAG_PLAY_S && x.id !== "main-landing")) continue;
      tag.on = true; tag.id = x.id; tag.label = x.label;
    }
    if (tag.on) {
      const id = tag.id;
      if (id === "apogee" || id === "drogue-backup") { along(booster, S.booster.fwd, gapA / 2, pt); tag.chain = mainChain; }
      else if (id === "main") { at(B.middle, S.middle.fwd, pt); tag.chain = "main"; }
      else if (id === "payload-release") { copy(pchute.pos, pt); tag.chain = "payload"; }
      else if (id === "payload-landing") { at(B.nose, S.nose.center, pt); tag.chain = "payload"; }
      else { at(booster, 0, pt); tag.chain = "main"; }
      tag.x = pt.x; tag.y = pt.y;
    }

    anchorAt(t, "shared", ST.anchors.shared);
    anchorAt(t, "main", ST.anchors.main);
    anchorAt(t, "payload", ST.anchors.payload);
    return ST;
  }

  return {
    stateInto,
    stateAt: (t) => JSON.parse(JSON.stringify(stateInto(t))),
    flightAt, playAt, anchorAt, heightOf, driftX, stackRot, windows, phases: PHASES, phaseAt, tags: TAGS, times: T, stations: S,
    cordScale: k, diameterScale: D, radius: R, altShared, altMain, altPayload, apex, payloadOffset: PAYLOAD_OFFSET,
  };
}
