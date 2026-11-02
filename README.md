# Charles Thorn · Portfolio

Static portfolio built with Vite. Live: https://aftermaxth.github.io/portfolio/

Handoff docs: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) (current truth), [BUILD_LOG.md](BUILD_LOG.md) (resume block + history), [TODO_CHARLES.md](TODO_CHARLES.md) (open items), [THIRD_PARTY.md](THIRD_PARTY.md) (licenses).

## Run

```
npm install
npm run dev        # http://localhost:5173/portfolio/
npm run build      # output in dist/
npm run preview    # serve dist/ locally
```

## Content

Copy lives in `content/`. The page is rendered to static HTML at build time by `tools/vite-plugin-site.mjs`.

- `content/projects.json`: the six projects. Generated from the source-of-truth notes by `tools/extract_source.mjs`, verbatim. `npm run content` regenerates it and runs `tools/verify_content.mjs`, which fails if any sentence is not in the source (or a marked live-site fill).
- `content/site.json`: hero, Next, About, Contact, footer.
- `content/media.json`: alt text, captions and order for images, videos and model tabs.

## Assets

Drop files in and rebuild; no code changes.

- `models/<slug>.glb` gives that project a pinned 3D viewer. Several models: `models/<slug>--<label>.glb` (label becomes a tab).
- `images/<slug>/*` gives that project a gallery. A video (`.mp4`) needs a same-named poster image (`name.webp`).
- Neither present: the project renders as a text-only card.

Slugs: `nasa-student-launch`, `sae-aero-design`, `robot-arena`, `plant-watering`, `training-hub-v2`, `mocore-lab`.

## Models

CAD exports (STL) stay out of the repo. `npm run models` runs `tools/build_models.mjs`: STL to a welded GLB, then `gltf-transform optimize` (simplify and meshopt). Point `MODELS_SRC` at the folder with the `.STL` files. Each GLB must stay under 3 MB.

## Checks

```
npm run build && node tools/check_site.mjs    # no em dashes, no rendered [brackets]
```

## Deploy

`.github/workflows/pages.yml` builds and publishes `dist/` on pushes to `main`. It needs Settings > Pages > Source set to "GitHub Actions". Until that is switched the live site still serves the old files from `main`.

## Layout

```
index.html                 shell; body is injected at build time
content/                   projects.json, site.json, media.json
models/  images/           project assets (see above)
public/                    favicon, og image, 404, resume PDF, font licenses
src/main.js                entry
src/js/                    projects (toggles, lazy viewers), viewer (three.js), motion (Lenis + GSAP), nav
src/styles/                tokens, base (12-column grid), components
tools/                     content, model and release-check scripts
```

`css/`, `js/`, `assets/` and `tools/*.py` at the repo root are the previous site, kept until their removal is approved.
