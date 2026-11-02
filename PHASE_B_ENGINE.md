# PHASE_B_ENGINE (Opus, effort high): steps 6 and 7 only

Read first: CLAUDE.md, PROJECT_CONTEXT.md, RESUME HERE in BUILD_LOG.md, this file. Do not touch content/ or project layout. No em dashes, no invented facts. Log every step, commit per milestone, branch `redesign`.

## Step 6: real-time hero engine with afterburner
Replace the flat photo (`images/hero/engine.webp`, credit line "Photo: U.S. Air Force", license unconfirmed) with a real-time 3D jet engine with afterburner.
1. Delegate the model search to ONE subagent. It returns 3 candidates in 15 lines max: name, source URL, license, poly count, why. Sources: Sketchfab (CC0 or CC-BY only), NASA 3D Resources. No candidates have been searched yet.
2. List the 3 candidates to Charles BEFORE using one. Wait for the pick if the license is not plain CC0 or CC-BY.
3. If none is good, build a procedural turbofan in three.js.
4. Shock-diamond plume only if it renders crisp; otherwise cut it. No Mach-number overlay, no contour legend, no gradients in page chrome.
5. Record attribution in THIRD_PARTY.md ("Pending (Phase B)" section), remove the unconfirmed Air Force credit from content/site.json (`hero.poster.credit`) only if the photo is no longer shown.

## Step 7: crisp rendering (hero and project viewers)
SMAA or MSAA, DPR capped at 2, AgX or ACES tone mapping, sRGB output, Poly Haven CC0 HDRI (self-hosted in public/, compressed), soft contact shadow, tight camera near/far (no z-fighting). No wireframe overlays, no strokes under 1.5 px, no open seams or clipped geometry. Poster fallback if WebGL fails. Lazy-load models. Allowed new dependency: `postprocessing` (pmndrs). Nothing else without asking.

## Acceptance criteria
- 375, 768, 1440 px screenshots (once each, view once): no overlap, cut-off geometry, visible hairlines, or horizontal scroll.
- Hero canvas lazy, does not block LCP; static poster shows first and when WebGL fails or reduced motion is on.
- Mobile Lighthouse performance stays at 90 or higher (Phase C measures; do not regress: keep the hero chunk lazy, models under 3 MB).
- Console clean. `npm run build` ok. `node tools/check_site.mjs` ok. `node tools/verify_content.mjs` still ok.
- Project viewers keep: drag rotate only, no zoom or pan, `touch-action: pan-y` on the canvas.

## Where things are
- Hero markup: `.hero__stage[data-hero-stage]` with `img.hero__poster` and a credit `figcaption`. Rendered by the `<figure class="hero__stage">` block inside `bodyHTML()` in `tools/vite-plugin-site.mjs`. Hero CSS: `.hero*` in `src/styles/components.css`. Phase B may edit the `.hero__stage` block and its CSS, nothing else in layout. Hero copy (title, lede, buttons, specs) must not change.
- Hero data: `content/site.json` > `hero.poster`.
- Viewer: `src/js/viewer.js` (project viewers). Loaded lazily by `src/js/projects.js` when a `[data-viewer]` is within 400 px. Suggested: extract the renderer, environment and loop setup into `src/js/render.js` so the hero and project viewers share it, then add `src/js/hero.js` mounting into `[data-hero-stage]`.
- Current render baseline in viewer.js: WebGLRenderer MSAA, DPR cap 2, ACES, sRGB, PMREM RoomEnvironment stand-in, one directional light, creased normals at load. Replace the RoomEnvironment with the HDRI.
- Motion: `src/js/motion.js` (Lenis, GSAP). One ease `0.2,0,0,1`, durations `--dur-1..3`, transform and opacity only.

## Viewer API (keep stable)
```
const viewer = await createViewer(rootEl)  // rootEl: .viewer[data-viewer][data-models='[{id,label,url}]']
viewer.setModel(id)   viewer.setScroll(p /* 0..1 */)   viewer.dispose()
```
projects.js dispatches `viewer-ready` ({project, viewer}); motion.js links scroll to `setScroll`. Models are GLB, meshopt-compressed, positions only, meters, Y up; GLB color is per material.

## Commands
`npm run dev` (http://localhost:5173/portfolio/), `npm run build`, `npm run models`, `npm run content`, `node tools/check_site.mjs`. Browser pane forces prefers-reduced-motion: reduce, so test motion by importing `/portfolio/src/js/motion.js` in the page, or use Claude in Chrome.

## End of Phase B
Update PROJECT_CONTEXT.md and RESUME HERE, commit, then print: "SESSION BOUNDARY. Next: Phase C. Run /model, select Sonnet, set effort high, run /clear, then send: Continue from RESUME HERE."
