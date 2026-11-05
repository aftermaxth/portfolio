// USLI launch and recovery timeline. Pure functions, no three.js and no DOM, so tools/check_usli_scene.mjs
// can test it in Node. Every flight number comes from content/usli-flight.json (passed in as `data`).
//
//   const tl = createTimeline(data, { aspect })   // aspect = card width / height (path tangents)
//   tl.flightAt(s)    play clock seconds (0..PLAY_SECONDS) -> flight time in s (PLAY_WINDOWS)
//   tl.stateAt(t)     everything the scene draws at flight time t
//
// Where things are: each piece belongs to a chain ("shared" until the 600 ft separation, then "main" or
// "payload"). The chain's anchor is a point on the arc (src/js/usli-path.js) whose height is proportional to
// that chain's altitude: the booster aft end for shared and main, the nosecone tip for payload. Piece poses
// are in meters relative to their chain's anchor. A pose {x, y, rot} places the CAD frame of the STL export:
// station s (inches from the aft end, on the rocket axis) sits at (x - s * IN * sin(rot), y + s * IN * cos(rot)).
// rot 0 = nose up, -PI = nose down, -PI/2 = nose to the right.
import { createPath } from "./usli-path.js";

export const IN = 0.0254;
const FT = 0.3048;

// Play time map (BUILD_LOG.md, 2026-11-04 rework): [play from, play to, flight from, flight to, id, slowed]
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
    pins: { apogee: 43.0, main: 77.0 }, // shear pin stations: booster wall into the avionics coupler, main-bay tube into the payload coupler
    switchband: [boosterFwd, switchFwd],
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

// Pose helpers
const at = (pose, s) => ({ x: pose.x - s * IN * Math.sin(pose.rot), y: pose.y + s * IN * Math.cos(pose.rot) });
const poseWith = (s, point, rot) => ({ x: point.x + s * IN * Math.sin(rot), y: point.y - s * IN * Math.cos(rot), rot });
const blendPose = (a, b, s, k) => { const ca = at(a, s), cb = at(b, s); return poseWith(s, { x: lerp(ca.x, cb.x, k), y: lerp(ca.y, cb.y, k) }, lerp(a.rot, b.rot, k)); };
const along = (pose, s, d) => ({ x: pose.x - (s * IN + d) * Math.sin(pose.rot), y: pose.y + (s * IN + d) * Math.cos(pose.rot) });
const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const shift = (pose, d) => ({ x: pose.x - d * Math.sin(pose.rot), y: pose.y + d * Math.cos(pose.rot), rot: pose.rot });

export function createTimeline(data, { aspect = 1 } = {}) {
  const ev = Object.fromEntries(data.events.map((e) => [e.id, e]));
  const chute = Object.fromEntries(data.parachutes.map((c) => [c.id, c]));
  const cordFt = Object.fromEntries(data.shockCords.map((c) => [c.id, c.lengthFt]));
  const k = data.scene.cordScale;
  const D = data.stylization.diameterScale;
  const S = stations(data);
  const path = createPath(data.path);
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

  // ---- anchors on the arc: height proportional to altitude, apogee at the apex ----
  const anchorAt = (t, chain = "shared") => {
    const alt = chain === "payload" ? altPayload(t) : chain === "main" ? altMain(t) : altShared(t);
    // The run reads 4862 ft from 17.48 s already; hold the height a hair (at most 0.2 percent of the arc) under
    // the apex until the apogee time, so the rocket keeps moving and reaches the apex exactly at apogee.
    const settle = t < T.apogee ? 0.002 * clamp((T.apogee - t) / 0.5) : 0;
    return path.atAltitude(alt / apogeeFt - settle, t < T.apogee ? "up" : "down", aspect);
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
    { id: "apogee", from: T.apogee, label: `Apogee, primary drogue charge ${g("drogue-charge-primary")} g` },
    { id: "drogue-deploy", from: T.drogueBackup, label: `Backup drogue charge ${g("drogue-charge-backup")} g, drogue opens` },
    { id: "drogue-descent", from: windows[3].t0, label: "Descent under the drogue" },
    { id: "main-deploy", from: T.main, label: `${ev["main-and-payload-separation"].altFt} ft, main charge ${g("main-and-payload-separation")} g, main and payload separate` },
    { id: "payload-release", from: T.payloadRelease, label: `${ev["payload-parachute-release"].altFt} ft, payload parachute released` },
    { id: "main-descent", from: windows[6].t0, label: "Descent under the main and payload parachutes" },
    { id: "payload-landed", from: T.payloadLanding, label: `Payload and nosecone land at ${ev["payload-landing"].speedFtS} ft/s` },
    { id: "landed", from: T.mainLanding, label: `Middle body and booster land at ${ev["main-booster-landing"].speedFtS} ft/s` },
  ];
  const phaseAt = (t) => { let p = PHASES[0]; for (const x of PHASES) if (t >= x.from) p = x; return p; };

  // ---- configurations, relative to the chain anchors ----
  const sway = (t, f, a) => a * Math.sin(t * f) * smooth(T.apogee, T.apogee + 4, t);
  const SPREAD = 0.24 * D; // side spacing between pieces hanging next to each other
  const PAYLOAD_OFFSET = -(diameter("main") + diameter("payload")) / 2 - 0.4; // payload chain hangs left of the main chain

  // Rocket nose along the arc tangent (burn, coast and the pitch-over at apogee). Anchor = aft end.
  const stackRot = (t) => ((anchorAt(Math.min(t, T.apogee + 1.2)).angle - 90) * Math.PI) / 180;

  // Under the drogue (apogee to 600 ft): booster nose-up on the 24 ft cord, the rest nose-down on the 6 ft cord.
  function drogueConfig(t) {
    const booster = poseWith(0, { x: SPREAD + sway(t, 0.7, 0.04), y: 0 }, 0);
    const cf = { x: sway(t, 0.5, 0.05), y: at(booster, S.booster.attach).y + cord("drogue-aft") };
    const upper = poseWith(S.upper.attach, { x: -SPREAD + sway(t, 0.6, 0.04), y: cf.y - cord("drogue-forward") }, -Math.PI);
    return { booster, upper, drogueCf: cf };
  }

  // Under the main (after 600 ft): main / 25 ft / middle (nose-up) / 6 ft / drogue / 24 ft / booster.
  // Payload chain: payload parachute / 15 ft / payload (nose-down) / 15 ft / nosecone (tip down).
  function mainConfig(t) {
    const booster = poseWith(0, { x: sway(t, 0.45, 0.05), y: 0 }, 0);
    const drogueCf = { x: booster.x + 0.04, y: at(booster, S.booster.attach).y + cord("drogue-aft") };
    const middle = poseWith(S.middle.attachAft, { x: booster.x - 0.02, y: drogueCf.y + cord("drogue-forward") }, 0);
    const mainCf = { x: middle.x, y: at(middle, S.middle.attachFwd).y + cord("main") };
    const xp = PAYLOAD_OFFSET + sway(t, 0.55, 0.05);
    const nose = poseWith(S.nose.fwd, { x: xp, y: 0 }, -Math.PI);
    const payload = poseWith(S.payload.attachFwd, { x: xp, y: at(nose, S.nose.attach).y + cord("payload-to-nosecone") }, -Math.PI);
    const payloadCf = { x: xp, y: at(payload, S.payload.attachAft).y + cord("payload-to-parachute") };
    return { booster, middle, payload, nose, drogueCf, mainCf, payloadCf };
  }

  // Payload and nosecone after touchdown: both tip over and lie on the island, the canopy settles beside them.
  function settledPayload() {
    const nose = poseWith(S.nose.center, { x: PAYLOAD_OFFSET - 0.5, y: R }, -Math.PI / 2);
    const payload = poseWith(S.payload.center, { x: PAYLOAD_OFFSET + 0.6, y: R }, -1.5 * Math.PI); // a quarter turn from nose-down, like the nosecone
    return { nose, payload, payloadCf: { x: PAYLOAD_OFFSET + 1.4, y: 0.1 } };
  }

  function stateAt(tIn) {
    const t = clamp(tIn, 0, T.mainLanding);
    const phase = phaseAt(t);
    const split = t >= T.main;
    const stack = { x: 0, y: 0, rot: stackRot(t) };

    // ---- apogee: separation gap along the axis, then blend to the drogue configuration ----
    const gapA = smooth(T.apogee + 0.02, T.apogee + 0.9, t) * 0.55;
    const toDrogue = smooth(T.apogee + 1.2, T.apogee + 2.9, t);
    const dC = drogueConfig(t);
    let booster = t < T.apogee ? stack : blendPose(shift(stack, -gapA), dC.booster, S.booster.center, toDrogue);
    let upper = t < T.apogee ? stack : blendPose(stack, dC.upper, S.upper.center, toDrogue);
    let middle = upper, payload = upper, nose = upper;

    const drogueBay = at(booster, (S.bays.drogue[0] + S.bays.drogue[1]) / 2);
    const drogueOut = smooth(T.apogee + 0.4, T.apogee + 1.1, t);
    const gapMid = along(booster, S.booster.fwd, gapA / 2);
    const gapSide = { x: gapMid.x + 0.25 * D, y: gapMid.y + 0.2 };
    let drogue = {
      pos: mix(mix(drogueBay, gapSide, drogueOut), dC.drogueCf, toDrogue),
      rot: lerp(booster.rot, 0, drogueOut),
      inflate: smooth(T.apogee + 1.2, T.apogee + 2.0, t),
      deployed: t >= T.apogee + 0.4,
      diameter: diameter("drogue"), lineLength: lines("drogue"), gores: chute.drogue.lines,
    };

    // ---- 600 ft: payload section leaves the main-bay tube, main comes out and opens ----
    const mC = t >= T.main - 0.5 ? mainConfig(t) : null;
    const sepP = smooth(T.main + 0.02, T.main + 0.3, t) * 0.5;
    const sepN = smooth(T.main + 0.2, T.main + 0.45, t) * 0.35;
    const toMain = smooth(T.main + 0.3, T.main + 1.2, t);
    let main = {
      pos: at(upper, (S.bays.main[0] + S.bays.main[1]) / 2), rot: upper.rot, inflate: 0, deployed: false,
      diameter: diameter("main"), lineLength: lines("main"), gores: chute.main.lines,
    };
    let payloadChute = {
      pos: at(upper, (S.bays.payloadChute[0] + S.bays.payloadChute[1]) / 2), rot: upper.rot, inflate: 0, deployed: false,
      diameter: diameter("payload"), lineLength: lines("payload"), gores: chute.payload.lines, held: true,
    };
    if (split) {
      const pSep = shift(upper, sepP), nSep = shift(pSep, sepN);
      middle = blendPose(upper, mC.middle, S.middle.center, toMain);
      payload = blendPose(pSep, mC.payload, S.payload.center, toMain);
      nose = blendPose(nSep, mC.nose, S.nose.center, toMain);
      booster = blendPose(dC.booster, mC.booster, S.booster.center, toMain);
      drogue = { ...drogue, pos: mix(dC.drogueCf, mC.drogueCf, toMain), inflate: lerp(1, 0.55, toMain) };

      const mainExit = smooth(T.main + 0.1, T.main + 0.3, t);
      const bay = at(middle, (S.bays.main[0] + S.bays.main[1]) / 2);
      const exitPt = along(middle, S.middle.fwd, 0.35);
      const placed = smooth(T.main + 0.3, T.main + 0.9, t);
      main = { ...main, pos: mix(mix(bay, exitPt, mainExit), mC.mainCf, placed), rot: lerp(middle.rot, 0, mainExit), deployed: true, inflate: smooth(T.main + 0.3, T.main + 0.3 + mainOpen, t) };

      const bundleOut = smooth(T.main + 0.25, T.main + 0.8, t);
      const pBay = at(payload, (S.bays.payloadChute[0] + S.bays.payloadChute[1]) / 2);
      payloadChute = { ...payloadChute, pos: mix(pBay, mC.payloadCf, bundleOut), rot: lerp(payload.rot, 0, bundleOut), deployed: true };
    }
    if (t >= T.payloadRelease) {
      payloadChute = { ...payloadChute, held: false, inflate: smooth(T.payloadRelease, T.payloadRelease + payloadOpen, t) };
    }
    if (t >= T.payloadLanding) {
      const s = smooth(T.payloadLanding, T.payloadLanding + 2.0, t);
      const st = settledPayload();
      payload = blendPose(mC.payload, st.payload, S.payload.center, s);
      nose = blendPose(mC.nose, st.nose, S.nose.center, s);
      payloadChute = { ...payloadChute, pos: mix(mC.payloadCf, st.payloadCf, s), rot: lerp(0, -Math.PI / 2, s), inflate: lerp(1, 0.25, s) };
    }

    const chainOf = { booster: split ? "main" : "shared", middle: split ? "main" : "shared", payload: split ? "payload" : "shared", nose: split ? "payload" : "shared" };
    const bodies = {
      booster: { ...booster, chain: chainOf.booster }, middle: { ...middle, chain: chainOf.middle },
      payload: { ...payload, chain: chainOf.payload }, nose: { ...nose, chain: chainOf.nose },
    };
    const chutes = {
      drogue: { ...drogue, chain: chainOf.booster }, main: { ...main, chain: chainOf.middle }, payload: { ...payloadChute, chain: chainOf.payload },
    };

    // ---- cords (shown once a separation has started), in the frame of their chain ----
    const cords = [];
    if (t >= T.apogee + 0.02) {
      cords.push({ id: "drogue-forward", chain: chainOf.booster, a: drogue.pos, b: at(middle, S.middle.attachAft) });
      cords.push({ id: "drogue-aft", chain: chainOf.booster, a: drogue.pos, b: at(booster, S.booster.attach) });
    }
    if (t >= T.main + 0.02) {
      cords.push({ id: "main", chain: "main", a: main.pos, b: at(middle, S.middle.attachFwd) });
      cords.push({ id: "payload-to-parachute", chain: "payload", a: payloadChute.pos, b: at(payload, S.payload.attachAft) });
      cords.push({ id: "payload-to-nosecone", chain: "payload", a: at(payload, S.payload.attachFwd), b: at(nose, S.nose.attach) });
    }

    // ---- charge flashes, on the avionics bulkheads (body-local stations): full at the event, gone 0.4 s later ----
    const pulse = (t0) => (t >= t0 && t < t0 + 0.4 ? (1 - (t - t0) / 0.4) ** 1.5 : 0);
    const flashes = [
      { id: "drogue-charge-primary", body: "middle", station: S.middle.attachAft - 0.8, dir: -1, k: pulse(T.apogee) },
      { id: "drogue-charge-backup", body: "middle", station: S.middle.attachAft - 0.8, dir: -1, k: pulse(T.drogueBackup) },
      { id: "main-charge", body: "middle", station: S.middle.attachFwd + 0.8, dir: 1, k: pulse(T.main) },
      { id: "main-charge-backup", body: "middle", station: S.middle.attachFwd + 0.8, dir: 1, k: pulse(T.mainBackup) },
    ];

    // ---- motor fire: on from ignition to burnout, then off ----
    const fire = t < T.burnout ? smooth(T.ignition, T.liftoff, t) * 0.6 + 0.4 * (t >= T.liftoff ? 1 : 0) : 0;

    // ---- island: under the landing point, fades in on final approach only ----
    const lowest = Math.min(altMain(t), altPayload(t));
    const island = { opacity: split ? 1 - smooth(150, 260, lowest) : 0, offsetX: PAYLOAD_OFFSET / 2, radius: Math.abs(PAYLOAD_OFFSET) / 2 + 1.3, depth: 0.3 };

    const anchors = { shared: anchorAt(t, "shared"), main: anchorAt(t, "main"), payload: anchorAt(t, "payload") };

    return {
      t, phase,
      altFt: { main: altMain(t), payload: altPayload(t), split },
      anchors, bodies, chutes, cords, flashes, fire, island,
    };
  }

  return {
    stateAt, flightAt, playAt, anchorAt, windows, phases: PHASES, phaseAt, times: T, stations: S, path,
    cordScale: k, diameterScale: D, radius: R, altShared, altMain, altPayload,
  };
}
