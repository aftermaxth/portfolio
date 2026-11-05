// USLI launch and recovery timeline. Pure functions, no three.js and no DOM, so tools/check_usli_scene.mjs
// can test it in Node. Every flight number comes from content/usli-flight.json (passed in as `data`).
//
//   const tl = createTimeline(data);
//   tl.timeAt(p)    scroll progress 0..1 -> flight time in s (non-linear, SCROLL_WINDOWS)
//   tl.stateAt(t)   everything the scene draws at time t: phase, altitudes, body poses, parachutes,
//                   cords, charge flashes, fire, island, screen lane and canvas z-order
//
// World units are meters. y is up, x is across the screen, the cut plane is z = 0 (the scene clips z > 0).
// A body pose {x, y, rot} places the CAD frame of the STL export: station s (inches from the aft end,
// on the rocket axis) sits at (x - s * IN * sin(rot), y + s * IN * cos(rot)). rot 0 = nose up, PI = nose down.

export const IN = 0.0254;
const FT = 0.3048;
// Altitude is drawn compressed (meters of world per foot of altitude), so the camera can follow the
// vehicle and the two descending sections fit one frame. The readout always shows the real altitude.
export const ALT = 0.02;

// Scroll windows (BUILD_LOG.md, 2026-11-04 mapping table): [p from, p to, t from, t to, id, is event]
export const SCROLL_WINDOWS = [
  [0.0, 0.05, 0, 0, "pad", false],
  [0.05, 0.15, 0, null, "burn", true], // t to = burnout from the JSON
  [0.15, 0.32, null, 17.0, "coast", false],
  [0.32, 0.45, 17.0, 21.0, "apogee", true],
  [0.45, 0.58, 21.0, 67.0, "drogue-descent", false],
  [0.58, 0.7, 67.0, 68.2, "600ft", true],
  [0.7, 0.79, 68.2, 70.5, "500ft", true],
  [0.79, 0.85, 70.5, 89.0, "main-descent", false],
  [0.85, 0.91, 89.0, 95.0, "payload-landing", true],
  [0.91, 0.925, 95.0, 100.0, "main-descent-2", false],
  [0.925, 0.985, 100.0, null, "main-landing", true], // t to = main-booster-landing from the JSON
  [0.985, 1.0, null, null, "landed", false],
];
// Canvas z-order: behind the text column for the drogue descent crossing, in front everywhere else.
export const Z_CHECKPOINTS = [
  { p: 0.45, front: false },
  { p: 0.58, front: true },
];

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
    finSpanIn: 6.0,
    radiusIn: data.vehicle.diameterIn / 2,
  };
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, t) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const lerpAngle = lerp;

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
const blendPose = (a, b, s, k) => { const ca = at(a, s), cb = at(b, s); return poseWith(s, { x: lerp(ca.x, cb.x, k), y: lerp(ca.y, cb.y, k) }, lerpAngle(a.rot, b.rot, k)); };
const along = (pose, s, d) => ({ x: pose.x - (s * IN + d) * Math.sin(pose.rot), y: pose.y + (s * IN + d) * Math.cos(pose.rot) });
const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

export function createTimeline(data) {
  const ev = Object.fromEntries(data.events.map((e) => [e.id, e]));
  const chute = Object.fromEntries(data.parachutes.map((c) => [c.id, c]));
  const cordFt = Object.fromEntries(data.shockCords.map((c) => [c.id, c.lengthFt]));
  const k = data.scene.cordScale;
  const S = stations(data);
  const cord = (id) => cordFt[id] * FT * k;
  const lines = (id) => chute[id].lineLengthIn * IN * k;
  const diameter = (id) => chute[id].diameterIn * IN;

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

  const curves = data.altitudeCurveFtByTimeS;
  const shared = withEvents(curves.ascentAndDrogue, [[T.liftoff, ev.liftoff.altFt], [T.apogee, ev.apogee.altFt]]);
  const mainCurve = withEvents(curves.mainBooster, [[T.main, ev["main-and-payload-separation"].altFt], [T.mainLanding, ev["main-booster-landing"].altFt]]);
  const payloadCurve = withEvents(curves.payloadNosecone, [
    [T.main, ev["main-and-payload-separation"].altFt],
    [T.payloadRelease, ev["payload-parachute-release"].altFt],
    [T.payloadLanding, ev["payload-landing"].altFt],
  ]);
  const altShared = (t) => (t < T.liftoff ? 0 : interp(shared, t));
  const altMain = (t) => (t < T.main ? altShared(t) : interp(mainCurve, t));
  const altPayload = (t) => (t < T.main ? altShared(t) : interp(payloadCurve, t));

  // ---- scroll mapping ----
  const windows = SCROLL_WINDOWS.map(([p0, p1, t0, t1, id, isEvent]) => ({ p0, p1, t0, t1, id, isEvent }));
  windows[1].t1 = T.burnout;
  windows[2].t0 = T.burnout;
  windows[10].t1 = T.mainLanding;
  windows[11].t0 = windows[11].t1 = T.mainLanding;
  const timeAt = (p) => {
    p = clamp(p);
    const w = windows.find((x) => p <= x.p1) || windows[windows.length - 1];
    return lerp(w.t0, w.t1, (p - w.p0) / (w.p1 - w.p0));
  };
  const progressAt = (t) => {
    const w = windows.find((x) => t <= x.t1 && x.t1 > x.t0) || windows[windows.length - 1];
    return w.t1 === w.t0 ? w.p0 : lerp(w.p0, w.p1, clamp((t - w.t0) / (w.t1 - w.t0)));
  };

  // ---- phases (readout label). Each starts at a JSON event time. ----
  const g = (id) => ev[id].chargeG;
  const PHASES = [
    { id: "pad", from: -Infinity, label: "On the pad" },
    { id: "burn", from: T.liftoff, label: `Motor burn, ${data.vehicle.motor.name}` },
    { id: "coast", from: T.burnout, label: "Burnout, coasting to apogee" },
    { id: "apogee", from: T.apogee, label: `Apogee, primary drogue charge ${g("drogue-charge-primary")} g` },
    { id: "drogue-deploy", from: T.drogueBackup, label: `Backup drogue charge ${g("drogue-charge-backup")} g, drogue opens` },
    { id: "drogue-descent", from: windows[4].t0, label: "Descent under the drogue" },
    { id: "main-deploy", from: T.main, label: `${ev["main-and-payload-separation"].altFt} ft, main charge ${g("main-and-payload-separation")} g, main and payload separate` },
    { id: "payload-release", from: T.payloadRelease, label: `${ev["payload-parachute-release"].altFt} ft, payload parachute released` },
    { id: "main-descent", from: windows[7].t0, label: "Descent under the main and payload parachutes" },
    { id: "payload-landed", from: T.payloadLanding, label: `Payload and nosecone land at ${ev["payload-landing"].speedFtS} ft/s` },
    { id: "landed", from: T.mainLanding, label: `Middle body and booster land at ${ev["main-booster-landing"].speedFtS} ft/s` },
  ];
  const phaseAt = (t) => { let p = PHASES[0]; for (const x of PHASES) if (t >= x.from) p = x; return p; };

  // ---- body configurations ----
  const R = S.radiusIn * IN;
  const sway = (t, f, a) => a * Math.sin(t * f) * smooth(T.apogee, T.apogee + 4, t);

  // Hanging under the drogue (apogee to 600 ft): booster nose-up on the 24 ft cord, the rest of the
  // rocket nose-down on the 6 ft cord. Anchor: booster aft end at the shared altitude.
  function drogueConfig(t) {
    const yb = altShared(t) * ALT;
    const xb = 0.2 + sway(t, 0.7, 0.04);
    const booster = poseWith(0, { x: xb, y: yb }, 0);
    const bAttach = at(booster, S.booster.attach);
    const cf = { x: 0.02 + sway(t, 0.5, 0.05), y: bAttach.y + cord("drogue-aft") };
    const upAttach = { x: -0.22 + sway(t, 0.6, 0.04), y: cf.y - cord("drogue-forward") };
    const upper = poseWith(S.upper.attach, upAttach, Math.PI);
    return { booster, upper, drogueCf: cf };
  }

  // Under the main (after 600 ft): main / 25 ft / middle (nose-up) / 6 ft / drogue / 24 ft / booster.
  // Payload chain beside it: payload parachute / 15 ft / payload (nose-down) / 15 ft / nosecone (tip down).
  function mainConfig(t) {
    const yb = altMain(t) * ALT;
    const xm = 0.75 + sway(t, 0.45, 0.05);
    const booster = poseWith(0, { x: xm + 0.06, y: yb }, 0);
    const drogueCf = { x: xm + 0.02, y: at(booster, S.booster.attach).y + cord("drogue-aft") };
    const middle = poseWith(S.middle.attachAft, { x: xm, y: drogueCf.y + cord("drogue-forward") }, 0);
    const mainCf = { x: xm - 0.02, y: at(middle, S.middle.attachFwd).y + cord("main") };

    const yn = altPayload(t) * ALT;
    const xp = -0.95 + sway(t, 0.55, 0.05);
    const nose = poseWith(S.nose.fwd, { x: xp, y: yn }, Math.PI);
    const payload = poseWith(S.payload.attachFwd, { x: xp, y: at(nose, S.nose.attach).y + cord("payload-to-nosecone") }, Math.PI);
    const payloadCf = { x: xp, y: at(payload, S.payload.attachAft).y + cord("payload-to-parachute") };
    return { booster, middle, payload, nose, drogueCf, mainCf, payloadCf };
  }

  // Payload and nosecone after touchdown: both tip over and lie on the island, the canopy settles.
  function settledPayload(xp) {
    const nose = poseWith(S.nose.center, { x: xp - 0.35, y: R }, Math.PI / 2);
    const payload = poseWith(S.payload.center, { x: xp + 0.45, y: R }, -Math.PI / 2);
    return { nose, payload, payloadCf: { x: xp + 1.0, y: 0.12 } };
  }

  function stateAt(tIn) {
    const t = clamp(tIn, 0, T.mainLanding);
    const phase = phaseAt(t);
    const yShared = altShared(t) * ALT;
    const stack = { x: 0, y: yShared, rot: 0 };

    // ---- apogee: separation gap, then blend to the drogue configuration ----
    const gapA = smooth(T.apogee + 0.02, T.apogee + 0.9, t) * 0.55;
    const toDrogue = smooth(T.apogee + 1.2, T.apogee + 2.9, t);
    const dC = drogueConfig(t);
    let booster = t < T.apogee ? stack : blendPose({ x: 0, y: yShared - gapA, rot: 0 }, dC.booster, S.booster.center, toDrogue);
    let upper = t < T.apogee ? stack : blendPose(stack, dC.upper, S.upper.center, toDrogue);
    let middle = upper, payload = upper, nose = upper;

    // drogue: packed in the booster bay, pulled into the gap, then out and open
    const drogueBay = at(booster, (S.bays.drogue[0] + S.bays.drogue[1]) / 2);
    const drogueOut = smooth(T.apogee + 0.4, T.apogee + 1.1, t);
    const gapMid = { x: 0.28, y: yShared - gapA / 2 + 0.25 };
    let drogue = {
      pos: toDrogue > 0 ? mix(mix(drogueBay, gapMid, drogueOut), dC.drogueCf, toDrogue) : mix(drogueBay, gapMid, drogueOut),
      rot: drogueOut > 0 ? 0 : booster.rot,
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
    if (t >= T.main) {
      const pSep = { x: upper.x - sepP * Math.sin(upper.rot), y: upper.y + sepP * Math.cos(upper.rot), rot: upper.rot };
      const nSep = { x: pSep.x - sepN * Math.sin(upper.rot), y: pSep.y + sepN * Math.cos(upper.rot), rot: upper.rot };
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

    // ---- touchdown: payload and nosecone settle ----
    if (t >= T.payloadLanding) {
      const s = smooth(T.payloadLanding, T.payloadLanding + 2.0, t);
      const st = settledPayload(mC.payloadCf.x);
      payload = blendPose(mC.payload, st.payload, S.payload.center, s);
      nose = blendPose(mC.nose, st.nose, S.nose.center, s);
      payloadChute = { ...payloadChute, pos: mix(mC.payloadCf, st.payloadCf, s), rot: lerp(0, Math.PI / 2, s), inflate: lerp(1, 0.25, s) };
    }

    // ---- cords (shown once a separation has started) ----
    const cords = [];
    if (t >= T.apogee + 0.02) {
      cords.push({ id: "drogue-forward", a: drogue.pos, b: at(t >= T.main ? middle : upper, S.middle.attachAft) });
      cords.push({ id: "drogue-aft", a: drogue.pos, b: at(booster, S.booster.attach) });
    }
    if (t >= T.main + 0.02) {
      cords.push({ id: "main", a: main.pos, b: at(middle, S.middle.attachFwd) });
      cords.push({ id: "payload-to-parachute", a: payloadChute.pos, b: at(payload, S.payload.attachAft) });
      cords.push({ id: "payload-to-nosecone", a: at(payload, S.payload.attachFwd), b: at(nose, S.nose.attach) });
    }

    // ---- charge flashes: intensity 1 at the event, gone 0.4 s later ----
    const pulse = (t0) => (t >= t0 && t < t0 + 0.4 ? (1 - (t - t0) / 0.4) ** 1.5 : 0);
    const flashes = [
      { id: "drogue-charge-primary", ...at(upper, S.middle.attachAft - 1.5), k: pulse(T.apogee) },
      { id: "drogue-charge-backup", ...at(upper, S.middle.attachAft - 1.5), k: pulse(T.drogueBackup) },
      { id: "main-charge", ...at(upper, S.middle.attachFwd + 1.5), k: pulse(T.main) },
      { id: "main-charge-backup", ...at(middle, S.middle.attachFwd + 1.5), k: pulse(T.mainBackup) },
    ];

    // ---- motor fire: on from ignition to burnout, then off ----
    const fire = t < T.burnout ? smooth(T.ignition, T.liftoff, t) * 0.6 + 0.4 * (t >= T.liftoff ? 1 : 0) : 0;
    const aft = at(t < T.apogee ? stack : booster, 0);

    // ---- island: fades in on final approach only ----
    const lowest = Math.min(altMain(t), altPayload(t));
    const island = { opacity: t < T.main ? 0 : 1 - smooth(150, 260, lowest), y: 0, x: -0.1, radius: 2.0, depth: 0.6 };

    // ---- screen lane (0 = beside the text, 1 = over the text column) and canvas z-order ----
    const lane = smooth(4.0, 8.0, t) - smooth(12.0, 16.1, t) + smooth(28.0, 40.0, t) - smooth(52.0, 63.5, t);
    const front = !(t >= windows[4].t0 && t < windows[4].t1);

    // ---- frame box around everything that is out ----
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const add = (p, pad = 0) => { box.x0 = Math.min(box.x0, p.x - pad); box.x1 = Math.max(box.x1, p.x + pad); box.y0 = Math.min(box.y0, p.y - pad); box.y1 = Math.max(box.y1, p.y + pad); };
    const span = (pose, a, b, pad) => { add(at(pose, a), pad); add(at(pose, b), pad); };
    span(booster, S.booster.aft, S.booster.fwd, (S.radiusIn + S.finSpanIn) * IN);
    if (t < T.main) span(upper, S.upper.aft, S.upper.fwd, R);
    else { span(middle, S.middle.aft, S.middle.fwd, R); span(payload, S.payload.aft, S.payload.fwd, R); span(nose, S.nose.aft, S.nose.fwd, R); }
    for (const c of [drogue, main, payloadChute]) {
      if (!c.deployed) continue;
      const r = lerp(0.12, c.diameter / 2, c.inflate);
      add({ x: c.pos.x, y: c.pos.y + Math.cos(c.rot) * (c.lineLength + r * 0.7) }, r);
      add(c.pos, 0.05);
    }

    if (island.opacity > 0) { // ease the island into the frame as it fades in, so the camera never jumps
      const o = island.opacity;
      box.x0 = Math.min(box.x0, lerp(box.x0, island.x - island.radius, o));
      box.x1 = Math.max(box.x1, lerp(box.x1, island.x + island.radius, o));
      box.y0 = Math.min(box.y0, lerp(box.y0, -island.depth, o));
    }

    return {
      t, phase,
      altFt: { main: altMain(t), payload: altPayload(t), split: t >= T.main },
      bodies: { booster, middle, payload, nose },
      chutes: { drogue, main, payload: payloadChute },
      cords, flashes, fire, aft, island, lane, front, box,
    };
  }

  return { stateAt, timeAt, progressAt, windows, phases: PHASES, phaseAt, times: T, stations: S, cordScale: k, altShared, altMain, altPayload };
}
