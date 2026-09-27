// heat-text.js
// Colors the hero intro like a temperature field around the engine: red on the words closest
// to the engine and flame, blue on the farthest. CSS draws the gradient (.heat-text); this
// module finds where the heat comes from and how far the text reaches from it.
//
// The source is the point on the top edge of the flame and engine (PLUME.edge, traced from
// the photo) that sits closest to the middle of the text, so the colors follow the layout at
// every screen size.

import { PLUME } from "./hero-plume.js";

export function initHeatText(hero) {
  const text = hero.querySelector("[data-heat-text]");
  const art = hero.querySelector(".hero__art");
  if (!text || !art) return;

  const update = () => {
    const box = text.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();
    if (!box.width || !artBox.width) return;

    // The edge in the text's own coordinates.
    const sx = artBox.width / PLUME.artSize[0];
    const sy = artBox.height / PLUME.artSize[1];
    const edge = PLUME.edge.map(([x, y]) => [
      artBox.left - box.left + x * sx,
      artBox.top - box.top + y * sy,
    ]);
    const [heatX, heatY] = closestPoint(edge, [box.width / 2, box.height / 2]);

    // Measure against the lines of text, not the paragraph's box, so the scale runs from
    // the nearest word to the farthest one.
    const range = document.createRange();
    range.selectNodeContents(text);
    let near = Infinity;
    let far = 0;
    for (const line of range.getClientRects()) {
      const left = line.left - box.left;
      const top = line.top - box.top;
      const right = left + line.width;
      const bottom = top + line.height;
      const dx = Math.max(left - heatX, 0, heatX - right);
      const dy = Math.max(top - heatY, 0, heatY - bottom);
      near = Math.min(near, Math.hypot(dx, dy));
      for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]]) {
        far = Math.max(far, Math.hypot(x - heatX, y - heatY));
      }
    }
    if (!Number.isFinite(near) || far <= near) return;

    text.style.setProperty("--heat-x", `${heatX.toFixed(1)}px`);
    text.style.setProperty("--heat-y", `${heatY.toFixed(1)}px`);
    text.style.setProperty("--heat-near", `${near.toFixed(1)}px`);
    text.style.setProperty("--heat-far", `${far.toFixed(1)}px`);
  };

  update();
  new ResizeObserver(update).observe(hero);
  document.fonts?.ready.then(update);
}

// Closest point to p on a polyline.
function closestPoint(points, [px, py]) {
  let best = points[0];
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const distance = Math.hypot(px - x, py - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [x, y];
    }
  }
  return best;
}
