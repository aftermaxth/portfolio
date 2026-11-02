# PROJECT_CONTEXT

Always-current truth. Edit in place. History lives in BUILD_LOG.md.
Last updated: 2026-11-02 (end of Phase A)

## Goal
Rebuild Charles Thorn's portfolio so it stops reading as vibe coded: solid color, real depth, restrained motion, a real-time 3D hero engine (Phase B), pinned 3D viewers for projects with models. Owner: mechanical engineering at Stevens, seeking Summer 2027 internships (propulsion, thermal, structures, vehicle systems). Long-term goal: engine design for supersonic flight.
Interaction references (pattern only, never copy code, copy or layout): chadjfrancis.com (scroll-driven 3D viewer), ziyuw.framer.website (clean, spacious structure).

## Where things are
- Repo (local): C:\Users\thorn\Downloads\portfolio2 (origin https://github.com/aftermaxth/portfolio). Work branch `redesign` (cut from origin/main f543189). Nothing pushed. Never push or merge to main without Charles.
- Live: https://aftermaxth.github.io/portfolio/ . Pages source is still "Deploy from branch (main /)". Moving to GitHub Actions is a settings change: ASK FIRST.
- Content source of truth: C:\Users\thorn\toDO\Portfolio Source Material.md (do not reread in full; tools/extract_source.mjs reads it). Raw backups for cross-check only: same folder (Brain Dump - Oct 29.txt etc.), `Claude outputs\Charles_Thorn_Resume_Mechanical.docx`.
- Model sources: C:\Users\thorn\toDO\portfolio_update\solidworks_files (engr_111 plant, engr_122 robot; STEP + per-part STL, mm, shared assembly coords). Kept OUT of the repo (STEP up to 61 MB). Only compressed GLBs are committed.

## Stack
Vite 8 (base '/portfolio/'), three 0.187 (lazy chunk), gsap 3.15 + ScrollTrigger + CustomEase, lenis 1.3, Fontsource (@fontsource-variable/archivo, @fontsource/dm-mono), dev: @gltf-transform/cli 4.5. Node 24, npm 11. Approved list only; anything else (e.g. `postprocessing` for Phase B is approved; Playwright or Lighthouse CLI are NOT) needs Charles's OK.
- Build-time render: tools/vite-plugin-site.mjs makes the static HTML from content/*.json and scans models/ and images/<slug>/. index.html is just a shell.
- Old site files (index.html replaced; css/, js/, assets/, tools/*.py, tools/source/) still in the repo root, unused. Deleting them needs Charles's OK.

## Design tokens (src/styles/tokens.css)
- Color (kept from old site): bg #0a0b0d, surface #111317, surface-2 #171a1f, ink #f2f1ee, ink-muted #a0a6ad, rule #23272d, accent #ff8100, accent-ink #0a0b0d, focus #7cc4ff. Solid fills only: no gradients, glass blur, grid or box texture.
- Type: Archivo Variable (sans) + DM Mono (labels). Space: 8px scale (--sp-1..8). Layout: 12-column grid, container 80rem, gutter 16/24/32.
- Motion: one curve cubic-bezier(0.2,0,0,1), durations 200/500/900 ms (--dur-1..3). Transform and opacity only. prefers-reduced-motion: no Lenis, no GSAP, content simply visible.

## Decisions (with reasons)
| Decision | Reason |
|---|---|
| Work in Downloads\portfolio2 | It is the clone of aftermaxth/portfolio; training-hubV1 is a different repo |
| Static HTML rendered at build, JS only enhances | Fast, works with JS off, good for Lighthouse |
| Generate projects.json from the source file, verify with a script | Verbatim rule; proves it |
| Source wins over live site; live fills only [add] gaps (Plant, Training Hub) | Task rule |
| Defaults pending Charles: minor "Aerospace (planned)"; USLI Safety Officer wording from source; pocket engine no date; Robot Arena states the final honestly; MOCORE states leak and unmet 8 psi goal; SAE never names or blames | Task defaults |
| Robot Arena: finalist is true, 31 s was the prelim run (not shown, not in source), never state "3 of 12 finished" | Charles, chat 2026-11-02 |
| Keep hero copy, contact links, resume PDF (public/assets/resume/..., identical bytes to assets/resume/...) | Task rule |
| Viewer: yaw-only drag, no zoom/pan, canvas touch-action pan-y, lazy chunk, render only while visible | Touch must never hijack page scroll |
| Normals computed at load (creased 35 deg) from positions-only GLBs | Smallest files; machined look |
| Pages workflow written but triggers on main only | Branch pushes never deploy; settings change needs approval |

## Content rules and precedence
1. Source file (verbatim) > live site text (only for [add] gaps) > nothing.
2. Never render [bracket] placeholders; log them in TODO_CHARLES.md.
3. No em dashes anywhere (site text, docs). No invented facts.
4. Order: NASA Student Launch, SAE Aero Design, Robot Arena, Automatic Plant Watering, Training Hub V2, MOCORE Lab; then Next (pocket engine build), About, Contact.
5. Cards show one-liner, role, org, timeline, tools, numbers, in-card sections; the toggle opens the rest of the write-up.
6. Editorial rules applied by tools/extract_source.mjs: builder notes in headings dropped; short titles; Robot Arena "3 of 12" sentence and number dropped.

## Asset status
| Project | Model | Images | Layout now |
|---|---|---|---|
| NASA Student Launch | none | none | text-only. Needs CAD renders, OpenRocket sim, photos, FMEA screenshot |
| SAE Aero Design | none | none | text-only. Needs forward fuselage CAD, renders |
| Robot Arena | robot-arena--housing.glb 24 kB, robot-arena--assembly.glb 509 kB | robot-build, robot-housing, robot-assembly (.webp) | pinned viewer (2 tabs) + gallery. Assembly license UNCLEAR (course CAD parts) |
| Automatic Plant Watering | plant-watering.glb 8 kB | plant-enclosure, plant-wiring, plant-final | pinned viewer + gallery |
| Training Hub V2 | n/a | coach-demo.mp4/.webp, athlete-demo.mp4/.webp | video gallery |
| MOCORE Lab | n/a | none by design | text-only small card |
| Pocket engine (Next) | n/a | none | text card, no date |
| Hero engine | Phase B | images/hero/engine.webp (poster, credit unconfirmed) | static poster until Phase B |

## How to run / build / deploy
- `npm install`, `npm run dev` (http://localhost:5173/portfolio/), `npm run build` (dist/), `npm run preview`.
- `npm run content` regenerates and verifies content. `npm run models` rebuilds GLBs from STL (MODELS_SRC env). `npm run check` or `node tools/check_site.mjs` = em dash and bracket check on src and dist.
- Deploy: .github/workflows/pages.yml (main only). Needs Pages source = GitHub Actions (not switched).
- The in-app Browser pane forces prefers-reduced-motion: reduce and does not paint until a screenshot is taken. preview_start picked the wrong project's launch.json, so run Vite with Bash and use navigate.

## License and attribution state
- THIRD_PARTY.md lists every runtime and build dependency with license (all MIT or OFL, GSAP Standard no-charge). Font OFL texts ship in /licenses/.
- UNCLEAR: hero photo credit "U.S. Air Force" (inferred, replaced in Phase B); robot assembly GLB includes course/vendor component CAD (Zumo chassis, sensors, boards, display).
- Repo has no LICENSE file (TODO_CHARLES.md).

## Phase status
- Phase A (Sonnet): steps 1 to 5, 8, 9 done. Phase B (Opus, steps 6 and 7): see PHASE_B_ENGINE.md. Phase C (Sonnet): QA, Lighthouse, accessibility, screenshots, TODO review.
