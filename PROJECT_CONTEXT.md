# PROJECT_CONTEXT

Always-current truth. Edit in place. History lives in BUILD_LOG.md.
Last updated: 2026-11-06 (USLI card redesigned: schematic when collapsed, recovery sequence player in the write-up; branch usli-launch-scene, PR #6 open, not merged)

## Goal
Rebuild Charles Thorn's portfolio so it stops reading as vibe coded: solid color, real depth, restrained motion, a real-time 3D hero engine (Phase B), pinned 3D viewers for projects with models. Owner: mechanical engineering at Stevens, seeking Summer 2027 internships (propulsion, thermal, structures, vehicle systems). Long-term goal: engine design for supersonic flight.
Interaction references (pattern only, never copy code, copy or layout): chadjfrancis.com (scroll-driven 3D viewer), ziyuw.framer.website (clean, spacious structure).

## Where things are
- Repo (local): C:\Users\thorn\Downloads\portfolio2 (origin https://github.com/aftermaxth/portfolio). `redesign` was merged to main through PR #1 on 2026-11-02 (merge commit). Never push to main directly; use a branch and a PR.
- Live: https://aftermaxth.github.io/portfolio/ , published 2026-11-02 20:54 UTC. Pages source is GitHub Actions (switched by me on Charles's go-ahead); .github/workflows/pages.yml deploys dist/ on every push to main and on manual run.
- Content source of truth: C:\Users\thorn\toDO\Portfolio Source Material.md (do not reread in full; tools/extract_source.mjs reads it). Raw backups for cross-check only: same folder (Brain Dump - Oct 29.txt etc.), `Claude outputs\Charles_Thorn_Resume_Mechanical.docx`.
- Model sources: C:\Users\thorn\toDO\portfolio_update\solidworks_files (engr_111 plant, engr_122 robot; STEP + per-part STL, mm, shared assembly coords). Kept OUT of the repo (STEP up to 61 MB). Only compressed GLBs are committed.

## Stack
Vite 8 (base '/portfolio/'), three 0.187 (lazy chunk), gsap 3.15 + ScrollTrigger + CustomEase, lenis 1.3, Fontsource (@fontsource-variable/archivo, @fontsource/dm-mono), dev: @gltf-transform/cli 4.5. Node 24, npm 11. Approved list only; anything else needs Charles's OK (Lighthouse was approved for Phase C but lives in a scratch folder, not in package.json; Playwright is NOT approved).
- Build-time render: tools/vite-plugin-site.mjs makes the static HTML from content/*.json and scans models/ and images/<slug>/. index.html is just a shell.
- Old site files css/, js/, assets/, tools/*.py, tools/source/, tools/og-image.html, images/hero/engine.webp and the root copies of 404.html, favicon.*, apple-touch-icon.png and og-image.png were deleted on 2026-11-02 (Charles OK; git history keeps them). public/ holds the live copies.

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
| /toDo wins over the old live site everywhere (titles, roles, names, minor wording, dates); live text fills only [add] gaps (Plant, Training Hub). If two /toDo files disagree, Portfolio_Source_Material.md wins and it is logged | Charles, chat 2026-11-02: the old live site is wrong |
| Titles and role lines verbatim from the source headings (kicker = the heading's parenthetical, except project 6's builder note) | Charles, chat 2026-11-02 |
| Minor shown as "Minor in Aerospace Engineering", degree "Bachelor of Engineering, Mechanical Engineering", "Expected May 2029" (resume docx wording) | Charles, chat 2026-11-02 |
| Next card = the old site's engine card, verbatim: tag "Exploring", title "Small combustion engine (side project)" ("combustion" added by Charles; rest verbatim), text "Winter 2027. Design not started. Open between a plastic print with a water-cooled setup to keep it from melting, or metal, either printed by an outside company or machined by hand." Replaces the source-line card ("pocket engine build, winter 2026", called weak) | Charles, chat 2026-11-02 (second request, overrides the earlier source-line decision). The source says winter 2026, the old text says Winter 2027: flagged in TODO_CHARLES.md |
| USLI, SAE, MOCORE and Robot Arena wording stays exactly as the source has it (MOCORE states the leaks and unmet 8 psi goal; SAE never names or blames; Robot Arena states the final honestly) | Resolved 2026-11-02 |
| Robot Arena: finalist is true, 31 s was the prelim run (not shown, not in source), never state "3 of 12 finished" | Charles, chat 2026-11-02 |
| Keep hero copy and contact links. Resume PDF at public/assets/resume/Thorn_Charles_Resume.pdf (same public URL path as the old site, so every link keeps working). Updated 2026-11-02 to a Word export of Charles_Thorn_Resume_Mechanical.docx (sha256 80daf2d5..., 1 page); the earlier PDF was replaced | Charles, chat 2026-11-02 |
| Viewer: yaw-only drag, no zoom/pan, canvas touch-action pan-y, lazy chunk, render only while visible | Touch must never hijack page scroll |
| Normals computed at load (creased 35 deg) from positions-only GLBs | Smallest files; machined look |
| Pages workflow triggers on main only; Pages source switched to GitHub Actions and the site published 2026-11-02 | Branch pushes never deploy. Charles switches the source to GitHub Actions at merge time (chat, 2026-11-02) |
| Robot assembly viewer: only own parts (printed housing, ArUco marker panel) | Purchased parts (chassis, boards, sensors, display) stripped so no vendor CAD ships. Charles, chat 2026-11-02 |
| og-image = render of the live hero (tools/og_image.mjs, headless Chrome, 1200x630) | Charles, chat 2026-11-02 |
| One shared renderer (src/js/render.js) for hero and viewers: MSAA, DPR 2, AgX, sRGB, baked contact shadow | Step 7; MSAA meets the AA rule, so `postprocessing` was not added (smaller lazy chunk) |
| Hero: one scene on the page background (no stage box), engine zone bleeds past the right edge, exhaust toward Projects; drag rotates (yaw, touch-action pan-y), lazy after load and idle, never under reduced motion, poster underneath | Charles, chat 2026-11-02 (feedback round) |
| Plume: ray-marched Mach-number volume (old tools/mach_field.py model), blue Mach 0 to red Mach 3.2, glowing Mach disks; gradients only inside the plume | Charles, chat 2026-11-02; references in assets/img/hero/ |
| Hero credit: 11 px DM Mono, ink-muted at 0.8 opacity (5.44:1), underline on hover/focus only, right of the meta row | Charles, chat 2026-11-02 |
| Hero model: shogo.gfx "Jet Engine" (CC BY 4.0) with the procedural plume at its exhaust; visible credit required | Charles, chat 2026-11-02 |
| Poster: replace the Air Force photo with a still render of the hero engine, drop the unconfirmed credit | Charles, chat 2026-11-02 |
| HDRI: Poly Haven Studio Small 09 (CC0), halved to 512x256 (410 kB) in public/env/ | Charles approved the download, chat 2026-11-02 |
| USLI redesign (Charles, brief 2026-11-04, built 2026-11-06): collapsed card shows the team's schematic (images/nasa-student-launch/usli-schematic.svg, inlined at build by tools/vite-plugin-site.mjs with token colors, title and desc kept; labels at 13.5 viewBox units so they render at 12 px or more, a list under the drawing when it is narrower than 680 px); no canvas or WebGL until the write-up opens; the "Recovery sequence" player sits at the bottom of the write-up, left column, in normal flow (canvas or stills, then Play/Pause, Restart and the readout in one row); nothing autoplays; reduced motion shows the stills until Play is pressed; whole solid rocket (no cutaway), one engine glow and a short plume, no smoke, flashes, trail or island; grey sheet landing surface with soft shadows; fixed lens, smoothed follow, one world scale (height = altitude x scene.altitudeScale); key light shadow map is the one extra pass; --color-grass removed; screenshots by DevTools protocol at DSF 2 (Playwright not installed, not approved) | Charles's brief, chat 2026-11-04 |
| USLI rework (superseded by the redesign row above; Charles, chat 2026-11-04): no pin, no scroll scrubbing; timed 40 s playback on one arc in card space (src/js/usli-path.js, params under `path` in the JSON; height proportional to altitude, apogee at the apex); canvas always behind the text, pieces fade to 35 percent over text blocks and text blocks keep a solid page-color fill; diameter stylized x1.8 (`stylization.diameterScale`, also fins and canopies); physical materials, neutral structure, accent only on the switchband, HUD phase line and canopies; overlap check by DevTools protocol instead of Playwright (not approved); still autoplays under reduced motion | Charles's review and brief, chat 2026-11-04 |
| USLI card (first build, superseded by the rework row above): cutaway launch scene instead of a drag viewer (slug nasa-student-launch only); rocket cut in half by a live clipping plane with back-face caps; procedural parachutes (gores alternate accent and ink), cords, charge flashes, shear pins, motor cylinder; island top is the one new color --color-grass | Charles, task brief 2026-11-04 (colors and grass token pending his approval) |
| (Superseded 2026-11-06: nothing autoplays now; with reduced motion the stills show until Play is pressed.) USLI scene plays (autoplays) even with prefers-reduced-motion: reduce (the only exception to the site rule; hero, Lenis and reveals still honor it). Stills remain for no JS and no WebGL | Charles, chat 2026-11-04 ("remove reduced motion aspect", then "Change the site too") |
| USLI cords and lines drawn at 0.25 of real length (content/usli-flight.json scene.cordScale); canopies and rocket at real size | Charles, task brief 2026-11-04 |
| USLI part map from STL file names (no parts list exists); four U-bolts excluded as purchased; OpenRocket screenshots not shown | Charles, chat 2026-11-04 |
| USLI payload chain assumption: payload = payload tube + payload coupler; payload parachute folded in the coupler, leaves from its aft end at 600 ft; payload hangs nose-down with the nosecone 15 ft below, tip down | Not in the JSON; flagged in TODO_CHARLES.md |

## Content rules and precedence
1. /toDo wins over the old live site. Portfolio_Source_Material.md (verbatim) beats other /toDo files (resume docx is used only for degree, minor and graduation wording) > live site text (only for [add] gaps) > nothing.
2. Never render [bracket] placeholders; log them in TODO_CHARLES.md.
3. No em dashes anywhere (site text, docs). No invented facts.
4. Order: NASA University Student Launch Initiative, SAE Aero Design, Robot Arena, Automatic Plant Watering System, Training Hub V2, MOCORE Lab; then Next (small engine side project, old-site wording), About, Contact.
5. Cards show one-liner, role, org, timeline, tools, numbers, in-card sections; the toggle opens the rest of the write-up.
6. Editorial rules applied by tools/extract_source.mjs: builder notes in section headings dropped; Robot Arena "3 of 12" sentence and number dropped. tools/verify_content.mjs now also checks titles against the source headings, the Next card against its source line, and degree, minor and graduation against the resume docx (PORTFOLIO_RESUME env, default toDO\Claude outputs).
7. Known /toDo disagreements (source wins, logged in TODO_CHARLES.md): resume "Vehicle Team (Recovery Subgroup)" and "1 of 2 safety officers" vs source; resume MOCORE line omits the leaks; resume lists ASME, NSBE, Commuter Student Union and "Claude Code (proficient)", source does not.

## Asset status
| Project | Model | Images | Layout now |
|---|---|---|---|
| NASA Student Launch | models/usli/rocket.glb 42.8 kB (21 own parts from rocket_stls; 4 purchased U-bolts left out; plain motor cylinder and 2 rail buttons added in code) | usli-schematic.svg (Charles's labeled side view, inlined); scene-1-pad, scene-2-apogee, scene-3-600ft, scene-4-landing (.webp stills of the player, 6 to 20 kB) | branch usli-launch-scene: collapsed = schematic left of the text; write-up = text right, recovery sequence player bottom left (40 s, Play/Pause, Restart, no autoplay; stills for no JS, no WebGL and reduced motion until Play). OpenRocket screenshots not used (Charles). Still needs photos, FMEA screenshot |
| SAE Aero Design | none | none | text-only. Needs forward fuselage CAD, renders |
| Robot Arena | robot-arena--housing.glb 24 kB, robot-arena--assembly.glb 17 kB (housing + ArUco panel only) | robot-housing, robot-assembly, robot-build (.webp), shown as an equal row of 3 under the viewer (no full-width image) | pinned viewer (2 tabs) + gallery. Sensor count (3 vs 5) still open; robot-assembly.webp render and its alt text still show the full assembly |
| Automatic Plant Watering | plant-watering.glb 8 kB | plant-final, plant-wiring (plant-enclosure.webp deleted, Charles: ugly) | pinned viewer + row of 2 |
| Training Hub V2 | n/a | coach-demo.mp4/.webp, athlete-demo.mp4/.webp | video gallery |
| MOCORE Lab | n/a | none by design | text-only small card |
| Pocket engine (Next) | n/a | none | text card, old-site wording |
| Hero engine | models/hero/jet-engine.glb 1.49 MB ("Jet Engine" by shogo.gfx, CC BY 4.0, source toDO\portfolio_update\jet_engine.glb); procedural engine.js is the fallback | posters images/hero/engine-render.webp (wide), -medium, -narrow (renders of the live scene). Old photo engine.webp deleted | live canvas in the engine zone; poster for reduced motion, no WebGL, no JS; credit on the meta row |

## How to run / build / deploy
- `node tools/build_env.mjs <in.hdr> <out.hdr>` halves an HDRI for public/env/. `node tools/build_hero_model.mjs` rebuilds models/hero/jet-engine.glb (HERO_MODEL_SRC). Posters: in `npm run dev`, call createHero, then POST hero.snapshot(1600, 1067, "wide"), (1520, 800, "medium"), (860, 662, "narrow") to /__save-hero-poster?layout=... (tools/vite-plugin-poster.mjs; Vite reloads after the first write, so send all three together).
- Hero proof: `npm run build`, `npx vite preview --port 4173`, then `node tools/hero_frames.mjs --out <dir> --widths 1440,768,375` (headless Chrome, reduced motion off; frames, plume pixel diff, headline overlap, drag, off-screen pause).
- Resume: the site serves a PDF, so a new docx must be exported to PDF (Word: Documents.Open then ExportAsFixedFormat(path, 17) over COM, check it is 1 page) and copied over public/assets/resume/Thorn_Charles_Resume.pdf.
- USLI card: `node tools/check_usli_scene.mjs` checks the schematic label numbers against content/usli-flight.json and tests the pure timeline (src/js/usli-timeline.js: play clock, world path, events, nothing below the sheet); add `--browser --widths 1440,768,375` (needs `vite preview` on 4173) for the page checks (collapsed has no canvas and no scene chunk, label size, player position and one-row controls, no autoplay, play, pause, off-screen pause, end on the sheet, reduced motion). Rocket GLB: `MODELS_SRC=C:/Users/thorn/toDO/portfolio_update/rocket_stls node tools/build_models.mjs usli/rocket`. Stills: on the built page, open the write-up, take document.querySelector("[data-usli]").usliScene (set by mountUsli), then snapshot(t, 1200, 900) for t = 0, 21.0, 69.2, 105.099 and save the WebP blobs as images/nasa-student-launch/scene-*.webp (render all four before writing: Vite reloads on the first write).
- `npm install`, `npm run dev` (http://localhost:5173/portfolio/), `npm run build` (dist/), `npm run preview`.
- `npm run content` regenerates and verifies content. `npm run models` rebuilds GLBs from STL (MODELS_SRC env). `npm run check` or `node tools/check_site.mjs` = em dash and bracket check on src and dist. `node tools/og_image.mjs --out <dir> --y 84 --pick 3` re-renders og-image.png from the hero (needs `vite preview` on 4173). `node tools/audit_a11y.mjs --widths 1440,768,375` runs the contrast and focus audit.
- Deploy: .github/workflows/pages.yml (main only). Needs Pages source = GitHub Actions (not switched).
- The in-app Browser pane forces prefers-reduced-motion: reduce and does not paint (or run requestAnimationFrame) until a screenshot is taken. Run Vite with Bash, open it with preview_start {url} (preview_start {name} picks the wrong project; plain navigate was refused once). Mount the hero by hand: import /portfolio/src/js/hero.js, call createHero without awaiting, then screenshot.

## License and attribution state
- THIRD_PARTY.md lists every runtime and build dependency with license (all MIT or OFL, GSAP Standard no-charge). Font OFL texts ship in /licenses/.
- Hero model credited on the page and in THIRD_PARTY.md (CC BY 4.0). The unconfirmed Air Force photo is no longer shown.
- Robot assembly GLB now has only the team's own parts (vendor CAD stripped). The gallery render robot-assembly.webp is a screenshot of the full assembly (flagged in TODO_CHARLES.md).
- Repo has no LICENSE file (TODO_CHARLES.md).

## Phase status
- Phase A (Sonnet): steps 1 to 5, 8, 9 done. Phase B (Opus, steps 6 and 7): done, including the hero feedback round. Phase C (Sonnet): done 2026-11-02 except items needing Charles (sensor count, Pages switch at merge, phone frame rate on a real device, optional extra deletions). Lighthouse mobile 98/100/100/100, desktop 100 x4. `node tools/audit_a11y.mjs` (contrast, focus order, text over the hero canvas) passes at 1440, 768, 375.
