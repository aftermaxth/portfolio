# PROJECT_CONTEXT

Always-current truth. Edit in place. History lives in BUILD_LOG.md.
Last updated: 2026-11-02 (Step 1)

## Goal
Rebuild Charles Thorn's portfolio so it stops reading as vibe coded: solid color, real depth, restrained motion, a real-time 3D hero engine, pinned 3D viewers for projects that have models. Owner: mechanical engineering at Stevens, seeking Summer 2027 internships (propulsion, thermal, structures, vehicle systems). Long-term goal: engine design for supersonic flight.
Interaction references (pattern only, never copy code, copy or layout): chadjfrancis.com (scroll-driven 3D viewer), ziyuw.framer.website (clean, spacious structure).

## Where things are
- Repo (local): C:\Users\thorn\Downloads\portfolio2 (origin https://github.com/aftermaxth/portfolio). Work branch: `redesign` (cut from origin/main f543189). Never push or merge to main without Charles.
- Live: https://aftermaxth.github.io/portfolio/ . Pages is currently "legacy", source = main branch, path /. Moving to GitHub Actions deploy needs a Pages settings change: ASK FIRST.
- Source of truth for content: C:\Users\thorn\toDO\Portfolio Source Material.md (digest below; do not reread in full). Raw backups for cross-check only: same folder (Brain Dump - Oct 29.txt, Application Context.md, Application Workflow Notes.md) and `Claude outputs\Charles_Thorn_Resume_Mechanical.docx`.
- No /models folder exists anywhere. Only SolidWorks native files (.SLDPRT/.SLDASM) were found in C:\Users\thorn\Downloads (ENGR111 kit, children's chair). See TODO_CHARLES.md.

## Stack (current -> target)
- Current: plain HTML/CSS/JS, no build. css/{tokens,base,layout,components,utilities}.css, js/{main,hero-engine,hero-shaders,hero-plume}.js, assets/{fonts,img,video,resume}, tools/ (python hero art scripts). Hosted from main root.
- Target: Vite (base '/portfolio/'), three, gsap + ScrollTrigger, lenis, Fontsource fonts, @gltf-transform/cli, pmndrs/postprocessing. Deploy via GitHub Actions to Pages. Node v24.20.0, npm 11.19.0 present.
- Approved dependency list is exactly the one above (task step 8). Anything else (e.g. a STEP-to-GLB converter, Playwright, Lighthouse CLI) needs Charles's OK first.

## Design tokens (current profile to keep, from css/tokens.css)
- bg #0a0b0d, surface #111317, surface-raised #171a1f, ink #f2f1ee, ink-muted #a0a6ad, rule #23272d, rule-strong #343a42, accent #ff8100 (afterburner orange), accent-ink #0a0b0d, focus #7cc4ff.
- Removed in redesign: --color-grid, hero grid vars, gradients (heat text, mach-scale bar), background texture, glass blur.
- Fonts today: Anybody (display), Archivo (text), DM Mono (labels). Target: one variable sans + one mono via Fontsource. Tentative: Archivo Variable + DM Mono (both on Fontsource). Final choice recorded in Step 3.
- Spacing: move to 8px scale, 12-column grid. Motion: one easing curve, three durations. Final values recorded in Step 3.

## Decisions (with reasons)
| Decision | Reason |
|---|---|
| Work in Downloads\portfolio2, not training-hubV1 | portfolio2 is the clone of aftermaxth/portfolio; training-hubV1 is a different repo. Session cwd moved here on 2026-11-02. |
| Branch `redesign` from origin/main | origin/main is 1 commit ahead of local main (README edit). Local main untouched. |
| Copy is verbatim from source; whole-sentence selection only for cards | Task rule. No paraphrase. |
| Source wins over live site on any conflict | Task rule. Conflicts logged in TODO_CHARLES.md. |
| Defaults pending Charles: minor "Aerospace (planned)"; USLI uses Safety Officer wording from source; pocket engine no date; Robot Arena states final outcome honestly; MOCORE states leak + unmet 8 psi goal; SAE never names or blames anyone | Task defaults. |
| Keep hero copy, contact links, resume PDF (assets/resume/Thorn_Charles_Resume.pdf, do not replace) | Task rule. |
| Phase A (Sonnet) steps 1-5, 8, 9; Phase B (Opus) steps 6-7; Phase C (Sonnet) QA | Task phases. |

## Content rules and precedence
1. Source file (verbatim) > live site text > nothing. Live site fills only gaps the source marks [add].
2. Never render [bracket] placeholders; log them in TODO_CHARLES.md.
3. No em dashes anywhere in site text or docs. No invented facts.
4. Project order: NASA Student Launch, SAE Aero Design, Robot Arena, Automatic Plant Watering, Training Hub V2, MOCORE Lab (small card, no image). Then Next card (pocket engine), About (source "Other material"), Contact.
5. Cards show one-liner, role, tools, timeline, numbers. Click expands full write-up.

## Source digest (structure only)
Each project block has: Role line (title | org | dates), Tools, One-liner, then named sections.
- USLI: Overview; Recovery: ejection charges; Safety: FMEA and hazard analysis; PDR report; What I learned; Numbers (2-stage deployment, 20% backup safety factor, backups fire 1 s after main, 2-person recovery subteam, 3-person safety team).
- SAE: Overview; The build (impact version); The redesigns (hard-project version); What I learned. Two story versions exist; SAE never names or blames anyone.
- Robot Arena: Overview; Design; Software and debugging; The final (3 of 12 finished, ours did not); What I learned; Numbers (2 hr 10 min vs 4 hr limit, 1st in prelims, 12 teams, ~650 first-years, team of 3, 3+ months).
- Plant Watering: one Overview paragraph only; card stays short.
- Training Hub V2: Overview; Why it is here.
- MOCORE: Short version (card); What I learned (optional expand).
- Other material: ME Class of 2029, GPA 3.5, aerospace minor [planned vs declared]; goal propulsion and engine design; skills list; AIAA Secretary AY 2026-2027; varsity XC and track NCAA D3; lifeguard Blue Line Pool Management Jul 2024 to present; pocket engine build winter 2026 (teaser).
- Fit order and visual needs table at top of source (USLI/SAE have no visuals yet; Robot Arena and Plant have CAD + photos on current site; Training Hub screenshots; MOCORE none).

## Asset status
| Project | Model (.glb) | Images | Status |
|---|---|---|---|
| NASA Student Launch | none | none | Text-only. Needs CAD renders, OpenRocket sim, photos, FMEA screenshot (TODO) |
| SAE Aero Design | none | none | Text-only. Needs forward fuselage CAD, assembly renders (TODO) |
| Robot Arena | housing, assembly: STEP/STL not found locally | robot-build.webp, robot-housing.webp, robot-assembly.webp exist | Blocked on model source files (TODO). Images exist as fallback |
| Automatic Plant Watering | enclosure: STEP/STL not found locally | plant-enclosure.webp, plant-wiring.webp, plant-final.webp exist | Blocked on model source file (TODO). Images exist as fallback |
| Training Hub V2 | n/a | coach-poster.webp, athlete-poster.webp, coach-demo.mp4, athlete-demo.mp4 | Have media |
| MOCORE Lab | n/a | none (by design) | Text-only small card |
| Pocket engine (Next) | n/a | none | Teaser, no date |
| Hero engine | to be sourced (Phase B) | current flat engine.webp + mach/flame/bloom layers | Replace in Phase B |

## How to run / build / deploy
- Today (pre-Vite): `python -m http.server 8000` in repo root, open http://localhost:8000.
- After Step 9: `npm install`, `npm run dev`, `npm run build` (output dist/), deploy via .github/workflows/pages.yml. Will be filled in at Step 9.

## License and attribution state
- Fonts today: Anybody, Archivo, DM Mono, licenses in assets/fonts/LICENSE-*.txt (all OFL per files; verify when switching to Fontsource).
- Hero photo "Photo: U.S. Air Force" credit was inferred from stenciling and never confirmed (see tools/source/engine-test-cell.jpg). Being replaced in Phase B; status UNCLEAR until replaced.
- THIRD_PARTY.md does not exist yet; created in Step 8.
- Repo has no LICENSE file.
