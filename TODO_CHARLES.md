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
- [x] Pocket engine: source line "Upcoming: pocket engine build, winter 2026" is shown with its date. The live "Winter 2027" text and its description are not used (not an [add] gap).
- [x] Live "Next" cards (SAE electronics bay, USLI "NASA announces selections October 1") removed.
- [x] Live About lines on ASME, NSBE and "run distance" removed. The resume also lists ASME, NSBE and the Stevens Commuter Student Union, but the source "Other material" does not; source wins, logged.
- [x] Training Hub timeline: source has none, so none is shown (live "Three days, September 2026" is not used).
- [x] Footer: "Last updated: September 2026" line removed.
- [x] Hero degree line: now the resume wording ("Bachelor of Engineering, Mechanical Engineering", "Expected May 2029") instead of the live "B.E. Mechanical, May 2029".
- [x] Other resume vs source differences (source wins, logged): resume "Claude Code (proficient)" vs source "Claude Code"; resume SAE employer "SAE Aero Design Club" not shown.
- [x] Plant and Training Hub live-site fills accepted under the [add] rule.
- [x] SAE text says "his part" about a partner (verbatim from source, no name). Accepted: source wording stays.

## Model check (step 5, open for Phase C)
- [ ] Robot assembly GLB shows 3 sensor parts (engr_122 STL files 1-2, 1-3, HCSR04-2) and the old render's alt text says 5 ultrasonic sensors. Was the assembly export complete? If not, re-export with all components and rerun `npm run models`. Part names 1-2 and 1-3 were guessed to be sensors from their triangle counts.
- [ ] Plant enclosure GLB is the printed enclosure only (revisedhd-1.STL). Want the electronics (pump, boards) added as a second tab?

## Needed assets
- [x] STEP/STL exports: received 2026-11-02 in C:\Users\thorn\toDO\portfolio_update\solidworks_files (engr_111, engr_122). Using the STLs.
- [ ] USLI visuals (CAD renders, OpenRocket sim, photos, FMEA screenshot)
- [ ] SAE visuals (forward fuselage CAD, assembly renders)
- [ ] Pocket engine: any image or CAD (optional)

## Licenses and attribution
- [ ] Robot assembly GLB includes the Zumo chassis, HC-SR04-type sensors, WeMos D1, FeeTech controller and OLED display CAD from the course kit or vendors. Redistribution license unclear. Keep, or reduce to housing-only (delete the assembly tab) before publishing?
- [x] Hero photo "Photo: U.S. Air Force": no longer shown; the hero poster is now a render of the 3D engine (Charles OK, 2026-11-02). The file images/hero/engine.webp is still in the repo and still copied into dist: OK to delete it?
- [x] Hero engine model: "Jet Engine" by shogo.gfx, CC BY 4.0, credited under the hero and in THIRD_PARTY.md.
- [x] Fonts: Fontsource packages are OFL-1.1 (checked in Step 8, texts ship in /licenses/).
- [ ] GSAP is free under its Standard "no charge" license (only the package.json license field was checked). Read https://gsap.com/standard-license if you want certainty.
- [ ] No LICENSE file in repo. Decide whether to add one.

## Approvals needed from Charles (task boundaries)
- [ ] Switch GitHub Pages source from "Deploy from branch (main)" to "GitHub Actions" (a Pages settings change; I will not do it without your OK).
- [x] STEP-to-GLB converter: not needed, the STL exports were used.
- [ ] Allow a screenshot/Lighthouse tool (e.g. Playwright, Lighthouse CLI) for Phase C, or use the built-in browser only.
- [ ] Deleting any old asset (hero layer images, tools/ scripts, old css/js) after the Vite port: needs your OK per file group.
- [ ] Merge `redesign` to main: content flags are resolved; still waiting on the assembly license, sensor count, Pages and old-files items above.
