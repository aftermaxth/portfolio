# TODO_CHARLES

Every open item for Charles. Check off when resolved. Source = Portfolio Source Material.md.
Rule since 2026-11-02 (Charles, chat): /toDo is correct and the old live site is wrong. Where they disagree, /toDo wins. If two /toDo files disagree, Portfolio_Source_Material.md wins and it is logged.

## Source flags (resolved 2026-11-02)
- [x] Minor wording: use the resume docx wording exactly, "Minor in Aerospace Engineering". Hero and About show it. The "(planned)" default is gone.
- [x] USLI title and wording: stays as the source has it (Safety Officer (Cross-Team), Vehicle Team, Recovery Subgroup; only underclassman; 3-person safety team). Resume says "Vehicle Team (Recovery Subgroup)" and "1 of 2 safety officers"; source wins, logged.
- [x] MOCORE: stays as the source has it (states the leaks and the unmet 8 psi goal). Resume line ("Engineered a dual inflatable TPU bladder...") is unchanged and does not mention the leaks; source wins, logged.
- [x] SAE: wording stays as the source has it, no names, no blame.

## Source [bracket] items (not rendered on site; these are missing info, still open)
- [ ] USLI [need]: CAD renders, OpenRocket sim, team/launch photos, FMEA table screenshot
- [ ] USLI [add]: launch dates/results, overall team size, sim numbers (apogee, descent rate), photos
- [ ] SAE [need]: forward fuselage CAD, assembly renders
- [ ] SAE [add]: aircraft specs, competition date, final fuselage renders, which design flew
- [ ] Plant Watering [add]: team size and sensor model still missing. Wireless reporting and result are filled from live-site sentences (allowed for [add] gaps).
- [ ] Training Hub [add]: number of athletes using it and a public link still missing. Key features filled from one live-site sentence (allowed for [add] gaps).
- [ ] MOCORE [need]: any sketch, prototype photo, or skip images (default: skip)
- [ ] MOCORE [add]: link or summary of the report to Dr. Nataraj once done

## Content conflicts (resolved 2026-11-02; /toDo wins)
- [x] Robot Arena outcome: "finalist" is true; 31 s was the prelim run; the robot malfunctioned in the final and did not finish; do NOT state "3 of 12 finished". The 31 s figure is not in the source, so it is not shown.
- [x] Robot Arena role: source ("Lead and sole SolidWorks designer, team of 3") replaces the live "Led the housing design and printing".
- [x] Project titles and role lines: verbatim from the source headings and Role lines (e.g. "NASA University Student Launch Initiative", "Automatic Plant Watering System"). Project 6's "(small card, no photos)" is a builder note and is not shown; the invented "Research" kicker is removed.
- [x] Pocket engine card: Charles found the source line weak (chat, 2026-11-02) and asked for the old site wording. Now the old card with "combustion" added to the title ("Small combustion engine (side project)"), including "Winter 2027" (Charles kept 2027 over the source's "winter 2026", chat 2026-11-02). Check that "Design not started" is still true.
- [x] Live "Next" cards (SAE electronics bay, USLI "NASA announces selections October 1") removed.
- [x] Live About lines on ASME, NSBE and "run distance" removed. The resume also lists ASME, NSBE and the Stevens Commuter Student Union, but the source "Other material" does not; source wins, logged.
- [x] Training Hub timeline: source has none, so none is shown (live "Three days, September 2026" is not used).
- [x] Footer: "Last updated: September 2026" line removed.
- [x] Hero degree line: now the resume wording ("Bachelor of Engineering, Mechanical Engineering", "Expected May 2029") instead of the live "B.E. Mechanical, May 2029".
- [x] Other resume vs source differences (source wins, logged): resume "Claude Code (proficient)" vs source "Claude Code"; resume SAE employer "SAE Aero Design Club" not shown.
- [x] Plant and Training Hub live-site fills accepted under the [add] rule.
- [x] SAE text says "his part" about a partner (verbatim from source, no name). Accepted: source wording stays.

## Training Hub AI write-up (open, 2026-11-03)
- [ ] Add the "Keeping my intent intact" and "The hardest part" text (Charles's essay, chat 2026-11-03) to Portfolio Source Material.md. It's only in content/projects.json right now; a future `npm run content` regenerate will overwrite it since it did not come from the source file.
- [ ] Review and merge PR #4 (branch training-hub/ai-process-writeup).

## Model check (step 5, open for Phase C)
- [ ] Sensor count, still open (Charles will check the SolidWorks assembly): the viewer no longer shows any sensors (purchased parts stripped 2026-11-02), but the gallery render robot-assembly.webp and its alt text still say "five ultrasonic sensors", and the engr_122 export held only 3 sensor-type parts (1-2, 1-3, HCSR04-2). Once the count is known, fix the alt text in content/media.json. That image is also a screenshot of the full assembly with the purchased boards and sensors; keep it or drop it?
- [ ] Plant enclosure GLB is the printed enclosure only (revisedhd-1.STL). Want the electronics (pump, boards) added as a second tab?

## Needed assets
- [x] STEP/STL exports: received 2026-11-02 in C:\Users\thorn\toDO\portfolio_update\solidworks_files (engr_111, engr_122). Using the STLs.
- [ ] USLI visuals (CAD renders, OpenRocket sim, photos, FMEA screenshot)
- [ ] SAE visuals (forward fuselage CAD, assembly renders)
- [ ] Pocket engine: any image or CAD (optional)

## Licenses and attribution
- [x] Robot assembly GLB: purchased parts (Zumo chassis, sensors, WeMos D1, FeeTech controller, OLED display) stripped, 2026-11-02 (Charles, chat). The Assembly tab now shows the printed housing plus the ArUco marker panel (17 kB). tools/build_models.mjs holds the part list. The marker panel (flat-1) was kept because it is not on the purchased list; tell me if it is not yours.
- [x] Hero photo "Photo: U.S. Air Force": no longer shown; the hero poster is now a render of the 3D engine (Charles OK, 2026-11-02). The file images/hero/engine.webp is deleted (Charles OK, 2026-11-02).
- [x] Hero engine model: "Jet Engine" by shogo.gfx, CC BY 4.0, credited under the hero and in THIRD_PARTY.md.
- [x] Fonts: Fontsource packages are OFL-1.1 (checked in Step 8, texts ship in /licenses/).
- [ ] GSAP is free under its Standard "no charge" license (only the package.json license field was checked). Read https://gsap.com/standard-license if you want certainty.
- [ ] No LICENSE file in repo. Decide whether to add one.

## Approvals needed from Charles (task boundaries)
- [x] DONE 2026-11-02 (Charles said go): Pages source is GitHub Actions. Was: Switch GitHub Pages source from "Deploy from branch (main)" to "GitHub Actions". Charles does this at merge time (chat, 2026-11-02); nothing in Pages was touched. The workflow (.github/workflows/pages.yml) is ready: main and manual triggers only, `npm ci` dry run ok, builds dist/.
- [x] STEP-to-GLB converter: not needed, the STL exports were used.
- [x] Lighthouse for Phase C: Charles asked for it (chat, 2026-11-02). Lighthouse 12.8.2 was installed in a scratch folder outside the repo and is NOT in package.json. Playwright was not used.
- [x] Old site files deleted 2026-11-02 (Charles OK): css/, js/, assets/, tools/*.py, images/hero/engine.webp, plus tools/og-image.html (replaced by tools/og_image.mjs). Git history keeps them. Resume PDF verified at the same public path, same sha256 as the original.
- [x] Also deleted 2026-11-02 (Charles OK): root 404.html, favicon.ico, favicon.svg, apple-touch-icon.png, og-image.png (all except 404.html were byte-identical to public/), and tools/source/ (the Air Force photo).
- [x] DONE 2026-11-02 via PR #1 (Charles said go). Was: Merge `redesign` to main (never pushed or merged by me): left to do are the sensor-count alt text, the Pages switch at merge time, and the optional items above. Phone frame rate is unmeasured (see BUILD_LOG).
