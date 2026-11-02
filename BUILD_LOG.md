# BUILD_LOG

## RESUME HERE
- Current phase: PHASE B in progress (Opus 5.5, high). Step 7 rendering done (HDRI now in). Step 6: Charles picked the shogo.gfx "Jet Engine" (CC BY 4.0); WAITING ON CHARLES to download it, because Sketchfab downloads need his sign-in.
- Expected model and effort: Phase B Opus high. Phase C Sonnet high.
- Current state: branch `redesign`, committed, nothing pushed. Shared renderer src/js/render.js (MSAA, DPR cap 2, AgX, sRGB, Poly Haven "Studio Small 09" HDRI self-hosted at public/env/studio_small_09_512.hdr (410 kB), baked soft contact shadow, render loop only while visible). Project viewers use it (API unchanged). Hero: hero.js + engine.js (procedural turbofan, now the fallback) + plume.js (crisp shock-diamond plume), lazy after load and idle, never under reduced motion, poster underneath. Build ok, check_site ok, verify_content ok (146), production console clean.
- Charles's answers (chat 2026-11-02): engine = "Jet Engine" by shogo.gfx (https://sketchfab.com/3d-models/jet-engine-fe3794fdc4ac49df910cecd007bfaaa3, CC BY 4.0, 241,553 tris, no afterburner section, so the plume attaches at its exhaust); HDRI download = yes (done); poster = replace the Air Force photo with a still render of the hero engine.
- Next action: when the model is in C:\Users\thorn\toDO\portfolio_update\hero_engine (glTF zip or GLB from Sketchfab), extract it outside the repo, inspect (axis, scale, materials, animation), compress with gltf-transform (meshopt, simplify, textures to webp if any) to well under 3 MB into models/hero/, load it in hero.js instead of buildEngine() (keep the procedural engine as fallback if loading fails), place the plume at the exhaust, add the CC BY credit visibly near the hero ("Engine model: Jet Engine by shogo.gfx, CC BY 4.0, modified") and in THIRD_PARTY.md. Then render a poster still, update content/site.json hero.poster (src, size, alt) and drop its credit, delete nothing old without asking. Then 375/768/1440 screenshots, log, commit, SESSION BOUNDARY to Phase C.
- Dev notes: run `npx vite --port 5173` with Bash, open with preview_start {url}. The pane forces reduced motion and stalls requestAnimationFrame while hidden: mount the hero by importing /portfolio/src/js/hero.js without awaiting, then take a screenshot.
- Still open for Phase C (Needs-you items): (1) robot assembly GLB license (course or vendor CAD); (2) sensor count 3 vs 5; (3) Pages source switch to GitHub Actions; (4) approval before deleting old css/, js/, assets/, tools/*.py. Also open: missing assets and [add] info, GSAP license text, LICENSE file. No merge to main until these are settled.

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

### 2026-11-02 17:10 | Content re-sync | /toDo wins
- Done: Charles resolved the content flags (/toDo is correct, old live site wrong; /toDo conflicts go to Portfolio_Source_Material.md and get logged). tools/extract_source.mjs now takes titles and kickers verbatim from the source headings (project 6's "(small card, no photos)" is a builder note and is dropped; the invented "Research" kicker is gone). Titles: "NASA University Student Launch Initiative", "Automatic Plant Watering System"; kickers "software" for Training Hub. Role lines were already verbatim. Source file unchanged (13,770 bytes, 12:43), so projects.json differs only in 4 title/kicker fields.
- Hero and About: degree "Bachelor of Engineering, Mechanical Engineering", "Minor in Aerospace Engineering", "Expected May 2029" (resume docx wording, replaces live "B.E. Mechanical, May 2029" and "Aerospace (planned)"). Next card: "Upcoming / winter 2026 / pocket engine build" from the source line.
- Old-site sweep: grep for planned, 31 s, made the finals, Winter 2027, ASME, NSBE, September 2026, announces selections, electronics bay finds only source text and the allowed live fills (Plant Details, Plant numbers, Training Hub key-features sentence). Hero lede and contact links kept (no /toDo disagreement; no source for the lede). Alt text for robot-assembly still says five sensors (open sensor-count item).
- Resume vs source differences logged (source wins): resume "Vehicle Team (Recovery Subgroup)", "1 of 2 safety officers", MOCORE line without the leaks, ASME/NSBE/Commuter union, "Claude Code (proficient)".
- Files: tools/extract_source.mjs, tools/verify_content.mjs (docx reader, title, Next-card and resume checks), tools/vite-plugin-site.mjs (spec values array, Next date), src/styles/components.css, content/projects.json, content/site.json, TODO_CHARLES.md, PROJECT_CONTEXT.md.
- Commands: `node tools/extract_source.mjs` ok; `node tools/verify_content.mjs` -> "checked 146 strings ... OK"; negative test (old "Aerospace (planned)") -> FAIL on hero and About as expected; `npm run build` ok; `node tools/check_site.mjs` -> 0 em dashes (src+content+tools, dist), 0 bracket placeholders; browser check of the built page at 1440: headings read "01 / USLI | NASA University Student Launch Initiative" ... "06 | MOCORE Lab", Next card "UPCOMING / WINTER 2026 / Pocket engine build", no horizontal scroll.
- Failed attempts: Python heredoc turned an escaped newline into a real one in verify_content.mjs (syntax error), fixed with Edit; the first browser_batch call had a malformed resize action, rerun.
- Next: SESSION BOUNDARY, Phase B.

### 2026-11-02 18:30 | Phase B steps 6 and 7 | Shared renderer, procedural hero, candidate search
- Done: src/js/render.js holds the shared three.js stage (WebGLRenderer with MSAA, DPR cap 2, AgX tone mapping, sRGB output, PMREM RoomEnvironment until an HDRI is approved, key light, tight near/far framing, resize observer, render loop only while on screen, context-loss fallback) and a baked soft contact shadow (depth from below, two blur passes, plane attached to the model so it turns with it). viewer.js now uses it; its API and interaction (drag yaw only, arrow keys, no zoom or pan, touch-action pan-y) are unchanged. Hero: hero.js mounts into [data-hero-stage] after load and idle, never under reduced motion, with no pointer input; engine.js builds a generic procedural afterburning turbofan (revolved case with flanges, 24 twisted fan blades, spinner, 18-petal nozzle, actuators, plumbing, gearbox; creased normals); plume.js draws the outer flame, hot core and 5 shock diamonds additively with a facing falloff (no bloom, no blur). CSS: .hero__canvas fades in over the poster; credit hidden while the live engine shows.
- Candidate search (one subagent, Sketchfab API data; formats unverified because the format list needs sign-in; looks judged from thumbnails): (1) "Jet Engine 2" by Chenzoss, CC BY 4.0, 499,510 tris, 4 textures, clear afterburner and nozzle; (2) "Jet Engine - concept" by HexAzulion, CC BY 4.0, 120,700 tris, untextured, afterburner unverified; (3) "Jet Engine" by shogo.gfx, CC BY 4.0, 241,553 tris, open-frame, no afterburner. No CC0 engines and no NASA 3D Resources engine found. Nothing downloaded.
- Decisions: `postprocessing` NOT added: MSAA already meets "SMAA or MSAA" and keeps the lazy chunk smaller. AgX replaces ACES for both hero and viewers. Contact shadow is subtle by nature on the #111317 surface (black can only darken it about 17 levels); verified by reading the baked texture.
- Commands: `npm run build` ok (entry JS 4.7 kB, hero chunk 7 kB, three in a lazy shared chunk 149 kB gzip); `node tools/check_site.mjs` 0 em dashes, 0 brackets; `node tools/verify_content.mjs` OK 146 strings. Browser: hero renders at 800 and 375 px, scrollWidth equals innerWidth at 375, console clean.
- Failed attempts: navigate to localhost was refused, preview_start {url} worked. First shadow test looked empty: plane placement was fine (red test), the bake was correct (pixel read), the issue is low contrast on the dark surface. A javascript_tool call timed out because the hidden pane stalls requestAnimationFrame (hero waits two frames before showing); fixed by not awaiting and taking a screenshot. First plume looked like a solid orange cone; softened outer layers and made the shock cells double cones. An inline bash heredoc for this log update failed to parse; used a scratch Python file.
- Not done: model pick, HDRI, poster replacement (all need Charles), 768 and 1440 screenshots for the final hero.
- Next: wait for Charles's answers (RESUME HERE).

### 2026-11-02 19:05 | Phase B | Charles's picks, HDRI in
- Charles chose (chat): the shogo.gfx "Jet Engine" model, yes to the HDRI download, yes to replacing the poster photo with a render.
- Checked via the Sketchfab public API: "Jet Engine", author shogo.gfx, license CC Attribution (CC BY 4.0, "Author must be credited. Commercial use is allowed."), downloadable, 241,553 faces, 132,545 vertices, 1 animation, created 2021-10-01. Downloading needs a Sketchfab sign-in, so Charles downloads it himself (no sign-in on his behalf).
- HDRI: Poly Haven "Studio Small 09" by Sergej Majboroda (CC0), 1k .hdr (1,615,248 bytes, md5 d5d7eb9d26d341d6aa4d11c1a54fd97c, matched the Poly Haven API) downloaded to the session scratchpad, not the repo. tools/build_env.mjs (new) halves it to 512x256 with a linear box filter and writes RLE RGBE: public/env/studio_small_09_512.hdr, 409,867 bytes. render.js loads it lazily (falls back to RoomEnvironment on failure).
- THIRD_PARTY.md: new Phase B table (HDRI in use, model picked but not in repo, procedural fallback, postprocessing not added).
- Commands: `npm run build` ok; check_site 0 em dashes, 0 brackets; verify_content OK; `vite preview` build: robot viewer renders with the HDRI, env file 200, console clean.
- Failed attempts: dev server logged one 500 while Vite re-optimized deps for the new HDRLoader import (transient, as in Phase A); production had none.
- Next: wait for the model file (RESUME HERE).
