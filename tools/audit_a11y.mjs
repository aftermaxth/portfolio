// Keyboard focus and text contrast audit for the built page. Headless Chrome over the DevTools
// protocol (no dependencies), same approach as tools/hero_frames.mjs.
//   Contrast: every text node's computed color against the first opaque background above it (page
//             colors are solid by design; text that sits on the hero canvas is listed separately).
//   Focus:    presses Tab through the whole page and records, per stop, the focus indicator (outline
//             or box-shadow), its contrast against the surface behind it, the target size, and whether
//             the element is on screen. Also checks for a keyboard trap (Tab wraps to the start).
//
// Usage (after `npm run build` and `npx vite preview --port 4173`):
//   node tools/audit_a11y.mjs [--url http://localhost:4173/portfolio/] [--widths 1440,375]
// Exit code 1 if any text is under 4.5:1 (3:1 for large text), any stop has no visible indicator
// or an indicator under 3:1, or Tab never wraps.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_ = arg("url", "http://localhost:4173/portfolio/");
const WIDTHS = arg("widths", "1440,375").split(",").map(Number);
const HEIGHTS = { 1440: 900, 768: 1024, 375: 812 };
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "a11y-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank",
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
const key = async (k, code, vk) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
};

// Runs in the page. WCAG relative luminance and contrast of two [r,g,b,a] colors (a composited on bg).
const PAGE_HELPERS = `
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const backdrop = (el) => {
    let layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) layers.push(bg);
      if (cs.backgroundImage !== "none") return { c: null, image: true };
      if (bg && bg[3] === 1) break;
    }
    let c = [10, 11, 13, 1];
    for (const l of layers.reverse()) c = over(l, c);
    return { c, image: false };
  };
`;

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

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

  for (const width of WIDTHS) {
    const height = HEIGHTS[width] || 900;
    console.log(`\n=== ${width}x${height} ===`);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await send("Page.navigate", { url: URL_ });
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      const st = await evaluate(`document.querySelector("[data-hero-stage]")?.dataset.state || ""`).catch(() => "");
      if (st === "ready") break;
    }
    await sleep(4500); // intro animation and reveal failsafe settle

    // Scroll the whole page once so every reveal-on-scroll block has faded in.
    const total = await evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y <= total; y += Math.round(height * 0.7)) { await evaluate(`window.scrollTo(0, ${y})`); await sleep(350); }
    await evaluate("window.scrollTo(0, 0)");
    await sleep(600);

    // Open every write-up so its text is in the audit too.
    await evaluate(`document.querySelectorAll("[aria-expanded=false]").forEach((b) => b.click())`);
    await sleep(900);

    // ---- Contrast ----
    const contrast = await evaluate(`(() => {
      ${PAGE_HELPERS}
      const out = [], onImage = []; let hidden = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.nodeValue.trim()) continue;
        const el = t.parentElement;
        if (seen.has(el)) continue; seen.add(el);
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[hidden]")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const fg = parse(cs.color);
        const op = (() => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; })();
        if (op < 0.05) { hidden++; continue; }
        const b = backdrop(el);
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const label = (el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]) + ' "' + t.nodeValue.trim().slice(0, 28) + '"';
        if (b.image) { onImage.push(label); continue; }
        const eff = over([fg[0], fg[1], fg[2], fg[3] * op], b.c);
        out.push({ label, ratio: ratio(eff, b.c), need: large ? 3 : 4.5, size });
      }
      return { out, onImage, hidden };
    })()`);
    const bad = contrast.out.filter((x) => x.ratio < x.need);
    const min = contrast.out.reduce((m, x) => (x.ratio / x.need < m.ratio / m.need ? x : m), contrast.out[0]);
    console.log(`contrast: ${contrast.out.length} text elements checked (${contrast.hidden} still faded out, skipped), ${bad.length} below threshold; tightest ${min.label} ${min.ratio.toFixed(2)}:1 (needs ${min.need})`);
    for (const x of bad) fail(`${x.label} ${x.ratio.toFixed(2)}:1 < ${x.need}`);
    if (contrast.onImage.length) console.log(`  on a background image (check by eye): ${contrast.onImage.join(" | ")}`);

    // ---- Focus order ----
    await evaluate("window.scrollTo(0, 0); document.activeElement && document.activeElement.blur()");
    await sleep(300);
    const stops = [];
    let wrapped = false;
    for (let i = 0; i < 80; i++) {
      await key("Tab", "Tab", 9);
      await sleep(120);
      const s = await evaluate(`(() => {
        ${PAGE_HELPERS}
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        const b = backdrop(parseFloat(cs.outlineOffset) > 0 && el.parentElement ? el.parentElement : el);
        const oc = parse(cs.outlineColor);
        const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        const shadow = cs.boxShadow !== "none";
        let indicator = null, indRatio = null;
        if (outline && oc && !b.image) { indicator = "outline " + cs.outlineWidth + " " + cs.outlineStyle + " offset " + cs.outlineOffset; indRatio = ratio(over(oc, b.c), b.c); }
        else if (shadow) { const m = cs.boxShadow.match(/rgba?\\([^)]+\\)/); const sc = m && parse(m[0]); indicator = "box-shadow " + cs.boxShadow.slice(0, 50); if (sc && !b.image) indRatio = ratio(over(sc, b.c), b.c); }
        const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
        return { tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") || el.textContent || el.alt || "").trim().replace(/\\s+/g, " ").slice(0, 36), href: el.getAttribute("href"), w: Math.round(r.width), h: Math.round(r.height), indicator, indRatio, inView, id: el.id || "" };
      })()`);
      if (s.body) { wrapped = true; break; }
      if (stops.length && stops[0].tag === s.tag && stops[0].name === s.name && stops[0].href === s.href && i > 3) { wrapped = true; break; }
      stops.push(s);
    }
    console.log(`focus: ${stops.length} tab stops, wraps to start: ${wrapped}`);
    if (!wrapped) fail("Tab never wrapped (possible keyboard trap)");
    for (const s of stops) {
      const ratioTxt = s.indRatio == null ? "n/a" : s.indRatio.toFixed(2) + ":1";
      const small = Math.min(s.w, s.h) < 24 ? " SMALL(inline or spaced link)" : "";
      console.log(`  ${s.tag.padEnd(6)} ${(s.name || s.href || "").padEnd(36)} ${s.w}x${s.h}${small}  ${s.indicator || "NO INDICATOR"}  contrast ${ratioTxt}  ${s.inView ? "" : "OFFSCREEN"}`);
      if (!s.indicator && s.tag === "video") console.log("    (video: native media controls draw their own focus ring)");
      else if (!s.indicator) fail(`no focus indicator on ${s.tag} "${s.name}"`);
      else if (s.indRatio != null && s.indRatio < 3) fail(`focus indicator ${s.indRatio.toFixed(2)}:1 on ${s.tag} "${s.name}"`);
      if (!s.inView) fail(`focused ${s.tag} "${s.name}" is off screen`);
    }

    // ---- Hero text over the live canvas (plume glow can sit behind the copy) ----
    // Hide the hero text, screenshot, and read the pixels where each text line was. The worst case
    // is the brightest 2 percent of those pixels (a moving plume peaks above the average).
    for (const where of ["top of page", "hero meta row"]) {
    await evaluate(where === "top of page" ? "window.scrollTo(0, 0)" : `window.scrollTo(0, Math.max(0, document.querySelector(".hero__meta, .hero__credit").getBoundingClientRect().bottom + scrollY - innerHeight + 16))`);
    await sleep(800);
    const lines = await evaluate(`(() => {
      ${PAGE_HELPERS}
      const out = [];
      const walker = document.createTreeWalker(document.querySelector(".hero"), NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.nodeValue.trim()) continue;
        const el = t.parentElement, cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || el.closest("[hidden]")) continue;
        const range = document.createRange(); range.selectNodeContents(t);
        const fg = parse(cs.color);
        let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) continue;
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height, fg: [fg[0], fg[1], fg[2], fg[3] * op], size: parseFloat(cs.fontSize), label: t.nodeValue.trim().slice(0, 24) });
        }
      }
      return out;
    })()`);
    await evaluate(`(() => { const st = document.createElement("style"); st.id = "audit-hide"; st.textContent = ".hero, .hero * { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; }"; document.head.appendChild(st); })()`);
    await sleep(500);
    const worstFrames = [];
    for (let k = 0; k < 4; k++) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      worstFrames.push(await evaluate(`(async () => {
        ${PAGE_HELPERS}
        const bmp = await createImageBitmap(await (await fetch("data:image/png;base64,${data}")).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(bmp, 0, 0);
        const lines = ${JSON.stringify(lines)};
        return lines.map((l) => {
          const x = Math.max(0, Math.floor(l.x)), y = Math.max(0, Math.floor(l.y));
          const w = Math.min(bmp.width - x, Math.ceil(l.w)), h = Math.min(bmp.height - y, Math.ceil(l.h));
          const d = g.getImageData(x, y, w, h).data;
          const px = [];
          for (let i = 0; i < d.length; i += 4) px.push({ l: lum([d[i], d[i + 1], d[i + 2]]), c: [d[i], d[i + 1], d[i + 2], 1] });
          px.sort((a, b) => a.l - b.l);
          const bg = px[Math.min(px.length - 1, Math.floor(px.length * 0.98))];
          const eff = over(l.fg, bg.c);
          return ratio(eff, bg.c);
        });
      })()`));
      await sleep(1700);
    }
    await evaluate(`document.getElementById("audit-hide").remove()`);
    let worst = Infinity, worstLabel = "";
    lines.forEach((l, i) => {
      const r = Math.min(...worstFrames.map((f) => f[i]));
      const need = l.size >= 24 ? 3 : 4.5;
      if (r < worst) { worst = r; worstLabel = l.label; }
      if (r < need) fail(`hero text over canvas "${l.label}" ${r.toFixed(2)}:1 < ${need}`);
    });
    console.log(`hero text over canvas (${where}): ${lines.length} lines x 4 frames, tightest "${worstLabel}" ${worst.toFixed(2)}:1`);
    }
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(failures ? `\n${failures} problem(s)` : "\nOK");
process.exit(failures ? 1 : 0);
