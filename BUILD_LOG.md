# BUILD_LOG

## RESUME HERE
- Current phase: Phase A finished (Sonnet 5.5, high). Next is PHASE B (Opus, effort high): steps 6 and 7 only. Read CLAUDE.md, PROJECT_CONTEXT.md, this block, then PHASE_B_ENGINE.md.
- Expected model and effort: Phase B Opus high. Phase C Sonnet high.
- Current state: branch `redesign` in C:\Users\thorn\Downloads\portfolio2, committed, nothing pushed. Vite site builds clean (npm run build). tools/check_site.mjs passes (0 em dashes in src and dist, 0 rendered brackets). tools/verify_content.mjs passes (135 strings). Six projects, Next, About, Contact render. Robot Arena and Plant Watering have working pinned 3D viewers; USLI, SAE and MOCORE are text-only; Training Hub has a video gallery. Hero is still the static poster photo.
- Next action: Phase B step 6: one subagent finds 3 engine candidates (CC0 or CC-BY), list them to Charles, then build the hero. Step 7: crisp rendering for hero and project viewers (details in PHASE_B_ENGINE.md). Dev server: run `npx vite --port 5173` with Bash, then navigate to http://localhost:5173/portfolio/ (preview_start picks the wrong project's config).
- Blockers / needs Charles: (1) approve switching Pages source to GitHub Actions (workflow is written, main-only trigger, not enabled); (2) robot assembly GLB contains course or vendor CAD parts with unclear redistribution license: keep, or drop to housing-only; (3) hero photo credit unconfirmed; (4) flags in TODO_CHARLES.md (minor wording, USLI title, SAE wording, Training Hub timeline); (5) approval before deleting old css/, js/, assets/, tools/*.py; (6) no merge to main until TODO_CHARLES.md flags are resolved.

---

## Log (append-only, newest at bottom)

### 2026-11-02 13:05 | Step 1 | Context system
- Done: found the portfolio clone at C:\Users\thorn\Downloads\portfolio2 (session started in training-hubV1, a different repo); moved session there. Fetched origin (main is 1 commit ahead: README edit). Created branch `redesign` from origin/main. Read source file, index.html, css/tokens.css, js/main.js, README head. Wrote CLAUDE.md, PROJECT_CONTEXT.md, BUILD_LOG.md, TODO_CHARLES.md.
- Why: task step 1 must precede everything else.
- Files: CLAUDE.md, PROJECT_CONTEXT.md, BUILD_LOG.md, TODO_CHARLES.md (all new).
- Commands: `git fetch origin` ok; `git checkout -b redesign origin/main` ok; `gh api repos/aftermaxth/portfolio/pages` -> legacy build from main:/ ; `node -v` v24.20.0; `npm -v` 11.19.0.
- Decisions: work in portfolio2; fonts/tokens decisions deferred to Step 3.
- Failed attempts: first search for /models found no STEP/STL/GLB; only .SLDPRT/.SLDASM in Downloads (not convertible without SolidWorks). Resolved later: Charles added STEP/STL.
- Next: output plan, wait for go.

### 2026-11-02 13:40 | Step 2 | Content
- Done: tools/extract_source.mjs builds content/projects.json straight from the source md (verbatim). tools/verify_content.mjs checks every string against the source (and live index.html from origin/main for marked fills). content/site.json holds hero, Next, About, Contact, footer.
- Why: verbatim rule; generating from the file removes typo risk and the verifier proves it.
- Rules applied: headings lose builder notes in parentheses; USLI, SAE and Robot titles shortened to the task's names; Robot Arena sentence "Only 3 of 12 robots finished a full lap..." and number "3 of 12 finished final" dropped (Charles, chat); live-site fills only for Plant and Training Hub [add] gaps (provenance "live"); bracket items never rendered (5 [add] lines skipped, all in TODO).
- Files: tools/extract_source.mjs, tools/verify_content.mjs, content/projects.json, content/site.json.
- Commands: `node tools/extract_source.mjs` ok; `node tools/verify_content.mjs` -> "checked 135 strings ... OK". Negative test (changed one word) -> FAIL as expected.
- Failed attempts: first tool-split regex broke "Supabase (accounts, auth, storage)", fixed with a paren-aware split. A Python log-update script failed on a string escape; redone by hand.
- Next: Step 3.

### 2026-11-02 14:25 | Step 3 | Design system and Vite scaffold
- Done: package.json + approved deps (vite 8.3.5, three 0.187.0, gsap 3.15.0, lenis 1.3.27, @fontsource-variable/archivo 5.3.0, @fontsource/dm-mono 5.3.0, dev: @gltf-transform/cli 4.5.1). vite.config.js (base /portfolio/). tools/vite-plugin-site.mjs renders static HTML from content/*.json and scans models/ and images/<slug>/ (layout: model -> viewer, images -> gallery, else text-only). index.html shell, src/styles/{tokens,base,components}.css, src/main.js, src/js/projects.js (write-up toggle), stub motion.js. public/ holds favicon, og-image, 404.html (rewritten standalone), resume PDF (copy, sha256 matches original). images/ and models/ at repo root (copies of existing project images; originals in assets/ untouched).
- Why: solid fills only, 8px scale, 12-col grid, one sans (Archivo Variable) + one mono (DM Mono), no gradients, no texture, no blur.
- Commands: `npx vite build` ok (dist/index.html 29 kB). Dev server check at 1440 px: hero poster, fonts (Archivo Variable, DM Mono) load, scrollWidth <= innerWidth.
- Failed attempts: (1) preview_start launched the old project's training-hub server; stopped it, use Bash instead. (2) Poster URL got the base twice because Vite re-prefixed my URLs; fixed with transformIndexHtml order "post".
- Decisions: old root css/, js/, assets/, tools/*.py left in place, unused (deleting needs Charles's OK). npm audit reports issues (dev tooling), review in Step 8.
- Next: Step 4.

### 2026-11-02 14:50 | Step 4 | Motion
- Done: src/js/motion.js (Lenis lerp 0.1, syncTouch off so touch scroll stays native; GSAP ScrollTrigger synced via ticker; one ease CustomEase "0.2,0,0,1" equal to --ease; durations read from --dur-2 and --dur-3; hero intro, reveal on scroll, write-up open fade, scroll-linked viewer turn, anchor scrolling). src/js/nav.js (IntersectionObserver nav spy, no motion). main.js loads motion.js only when reduced motion is off. Hidden initial state is CSS-only under (prefers-reduced-motion: no-preference) with a 4 s failsafe class.
- Why: animate transform and opacity only; reduced motion = no Lenis, no GSAP, content simply visible.
- Commands: `npx vite build` ok (motion chunk 53 kB gzip, viewer chunk 164 kB gzip, lazy). Browser pane reports prefers-reduced-motion: reduce, so the motion path was tested by importing motion.js directly: lenis class set, click on Projects eased to #projects (top 64 px = header height).
- Failed attempts: transient 500 from the dev server while files were being written (dep re-optimization), gone after reload. Not verified: the CSS no-preference hidden state in a real browser (pane cannot emulate it). Phase C should check with Claude in Chrome.
- Next: Step 5.

### 2026-11-02 15:20 | Step 5 | Models and projects stage
- Done: tools/build_models.mjs (binary STL, mm -> welded positions-only GLB in meters, one flat color per part class, then `gltf-transform optimize --compress meshopt --simplify-ratio 0 --simplify-error X`). Built models/robot-arena--housing.glb (23.6 kB), robot-arena--assembly.glb (509 kB, from 709,626 source triangles), plant-watering.glb (8.5 kB). All far under the 3 MB limit. STL/STEP sources stay outside the repo (MODELS_SRC env var, default toDO\portfolio_update\solidworks_files).
- Viewer (src/js/viewer.js): lazy dynamic import when within 400 px of view, three.js with MSAA, DPR cap 2, ACES, sRGB, PMREM room environment as a stand-in, creased normals (35 deg) at load, yaw-only drag + arrow keys, no zoom or pan, canvas touch-action: pan-y, render loop only while visible and moving, context-loss fallback to the still image, scroll-linked turn via setScroll.
- Checked in the browser pane: robot assembly and housing tabs switch and render, drag rotates, plant enclosure renders, at 375 px no horizontal scroll and canvas touch-action = pan-y.
- Layout rule confirmed: USLI, SAE, MOCORE render text-only (no placeholder box); Training Hub renders a video gallery; Robot Arena and Plant render viewer + photo gallery.
- Failed attempts: first simplify error (0.0005/0.002) gave 8-80 kB files, visibly rougher; tightened to 0.00005/0.0002 (24 kB / 509 kB). A multi-heredoc bash command failed to parse; files were written with the Write tool instead.
- Open: the engr_122 export holds 3 HC-SR04-type sensor parts, the live render shows 5 sensors (flagged in TODO_CHARLES.md). Nothing in the viewer is wireframe; Phase B owns HDRI, SMAA, contact shadow.
- Next: Steps 8 and 9.

### 2026-11-02 16:05 | Steps 8 and 9 | Third party, deploy, docs
- Done: THIRD_PARTY.md (licenses read from node_modules package.json: three, vite, lenis, gltf-transform, meshoptimizer MIT; Fontsource archivo and dm-mono OFL-1.1; gsap Standard no-charge, field only, full text not read). Font OFL texts copied to public/licenses/. .github/workflows/pages.yml (npm ci, npm run build, upload dist, deploy-pages; triggers on main and manual only). README rewritten for the new structure. tools/check_site.mjs plus `npm run check`. PHASE_B_ENGINE.md (41 lines).
- Commands: `npm audit --omit=dev` 0 vulnerabilities; `npm audit` 4 moderate (glob and minimatch inside the gltf-transform CLI, dev only, fix is a breaking downgrade, left alone). `npm run build` ok; `node tools/check_site.mjs` -> 0 em dashes in src+content+tools and in dist, 0 bracket placeholders; `node tools/verify_content.mjs` -> OK, 135 strings.
- Browser checks (dev server and `vite preview` build): 375, 768, 1440 px, no horizontal scroll (scrollWidth equals innerWidth); text-only, model, video gallery, expanded write-up, Next, About, Contact all looked right. Production build console clean. Production viewer chunk and plant-watering.glb load on scroll, state ready.
- Failed attempts: check_site flagged itself (the Write tool turned an escape into a literal dash; now String.fromCharCode(0x2014)). The pane did not run IntersectionObserver until a screenshot was taken (looked like a bug, was not). Two Python log-update scripts failed on backslash paths in strings; logs were edited with the Edit tool.
- Not done (by design): Lighthouse, keyboard focus and AA contrast audit, the CSS no-preference reveal state in a real browser (Phase C). Pages settings not changed. Old files not deleted.
- Next: SESSION BOUNDARY, Phase B.
