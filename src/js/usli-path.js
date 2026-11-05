// USLI flight path: one big arc in normalized card space. Pure functions, no three.js and no DOM, so
// tools/check_usli_scene.mjs can test it in Node. Parameters live in content/usli-flight.json under "path".
//
//   const path = createPath(data.path);
//   path.pathAt(p, aspect)        p 0 (pad) .. 0.5 (apex) .. 1 (landing) -> { x, y, angle }
//   path.atAltitude(f, side)      f = altitude / apogee altitude, side "up" or "down" -> { p, x, y, angle }
//
// x runs 0 (left edge) to 1 (right edge); y runs 0 (apex line) to 1 (ground line). angle is the tangent
// direction in degrees on screen (0 = to the right, 90 = straight up), using aspect = card width / height.

const cubic = (a, b, c, d, s) => { const u = 1 - s; return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d; };
const dcubic = (a, b, c, d, s) => { const u = 1 - s; return 3 * u * u * (b - a) + 6 * u * s * (c - b) + 3 * s * s * (d - c); };

export function createPath(spec) {
  const up = [spec.pad, spec.ascentControls[0], spec.ascentControls[1], spec.apex];
  const down = [spec.apex, spec.descentControls[0], spec.descentControls[1], spec.landing];
  const point = (pts, s) => ({ x: cubic(pts[0][0], pts[1][0], pts[2][0], pts[3][0], s), y: cubic(pts[0][1], pts[1][1], pts[2][1], pts[3][1], s) });
  const slope = (pts, s) => ({ dx: dcubic(pts[0][0], pts[1][0], pts[2][0], pts[3][0], s), dy: dcubic(pts[0][1], pts[1][1], pts[2][1], pts[3][1], s) });

  function pathAt(p, aspect = 1) {
    const q = Math.min(1, Math.max(0, p));
    const pts = q <= 0.5 ? up : down;
    const s = q <= 0.5 ? q * 2 : q * 2 - 1;
    const { x, y } = point(pts, s);
    let { dx, dy } = slope(pts, s);
    // At the very ends of a half the derivative can vanish (level apex): step inward to read the direction.
    if (Math.abs(dx) + Math.abs(dy) < 1e-9) ({ dx, dy } = slope(pts, s < 0.5 ? 1e-4 : 1 - 1e-4));
    const angle = (Math.atan2(-dy, dx * aspect) * 180) / Math.PI; // screen y grows downward
    return { x, y, angle };
  }

  // Height on the curve is proportional to altitude: y = 1 - f. Each half is monotone in y, so bisection works.
  function atAltitude(f, side, aspect = 1) {
    const target = 1 - Math.min(1, Math.max(0, f));
    const pts = side === "up" ? up : down;
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const y = point(pts, mid).y;
      // ascent: y falls from 1 to 0; descent: y rises from 0 to 1
      if (side === "up" ? y > target : y < target) lo = mid; else hi = mid;
    }
    const s = (lo + hi) / 2;
    const p = side === "up" ? s / 2 : 0.5 + s / 2;
    return { p, ...pathAt(p, aspect) };
  }

  return { pathAt, atAltitude, spec };
}
