# TODO_CHARLES

Every open item for Charles. Check off when resolved. Source = Portfolio Source Material.md.

## Source flags to resolve before publishing
- [ ] Minor wording: resume says "Minor in Aerospace Engineering", earlier decision was "(planned)". Default on site: "Aerospace (planned)". Pick one; site should match resume.
- [ ] USLI title: resume says "Safety Officer (Cross-Team)" and "1 of 2 safety officers"; Brain Dump says "only underclassman of 3 on the safety team". Default: source wording (Safety Officer, only underclassman, 3-person safety team). Confirm.
- [ ] MOCORE: resume says "Engineered a dual inflatable TPU bladder...". Site states the leak and unmet 8 psi goal. Confirm resume line matches that honesty.
- [ ] SAE: story must not blame the team lead. Review the final wording.

## Source [bracket] items (not rendered on site)
- [ ] USLI [need]: CAD renders, OpenRocket sim, team/launch photos, FMEA table screenshot
- [ ] USLI [add]: launch dates/results, overall team size, sim numbers (apogee, descent rate), photos
- [ ] SAE [need]: forward fuselage CAD, assembly renders
- [ ] SAE [add]: aircraft specs, competition date, final fuselage renders, which design flew
- [ ] Plant Watering [add]: team size, how wireless reporting worked, sensor used, result (live site has: capacitive soil moisture sensor, DHT11, photocell, ESP32, 5 days deployed, 10 min telemetry; use only if you confirm)
- [ ] Training Hub [add]: number of athletes using it, key features, screenshots, public link
- [ ] MOCORE [need]: any sketch, prototype photo, or skip images (default: skip)
- [ ] MOCORE [add]: link or summary of the report to Dr. Nataraj once done
- [ ] Other material: aerospace minor "planned vs declared" (same as minor flag above)

## Content conflicts (live site vs source; source wins)
- [ ] Robot Arena outcome: live site says "made the finals", "finalist", "31 s competition run". Source says 3 of 12 robots finished the final lap and ours did not finish. Site will follow source. Confirm the 31 s figure is dropped or explain what it was.
- [ ] Robot Arena role: live says "Led the housing design and printing"; source says lead and sole SolidWorks designer, team of 3. Site follows source.
- [ ] Pocket engine date: live says "Winter 2027", source says winter 2026. Default: no date shown.
- [ ] Live "Next" cards (SAE electronics bay, USLI "NASA announces selections October 1") are outdated against source (USLI and SAE are now full projects). Removed unless you say otherwise.
- [ ] Live About mentions ASME and NSBE membership and "run distance"; source "Other material" lists AIAA Secretary, varsity XC and track, lifeguard, no ASME or NSBE. Site follows source. Add ASME/NSBE back?
- [ ] Live Training Hub "Three days, September 2026" vs source "three days" with no month. Use source only unless confirmed.
- [ ] Source header says built Nov 2, 2026; live footer/updated line says September 2026. Footer will be refreshed.

## Needed assets
- [ ] STEP or STL exports: robot housing, robot assembly, plant enclosure (no /models folder exists; only .SLDPRT/.SLDASM in Downloads, which cannot be converted without SolidWorks). Export steps: SolidWorks > File > Save As > STEP (AP214) for the assembly/part, or STL (binary, fine resolution), into C:\Users\thorn\Downloads\portfolio2\models-src\ .
- [ ] USLI visuals (CAD renders, OpenRocket sim, photos, FMEA screenshot)
- [ ] SAE visuals (forward fuselage CAD, assembly renders)
- [ ] Pocket engine: any image or CAD (optional)

## Licenses and attribution
- [ ] Hero photo "Photo: U.S. Air Force": credit was inferred, never confirmed. Replaced in Phase B; confirm source page if you want to keep any use of it.
- [ ] Fonts: verify OFL status of the chosen Fontsource packages (done in Step 8).
- [ ] No LICENSE file in repo. Decide whether to add one.

## Approvals needed from Charles (task boundaries)
- [ ] Switch GitHub Pages source from "Deploy from branch (main)" to "GitHub Actions" (a Pages settings change; I will not do it without your OK).
- [ ] Allow a STEP-to-GLB converter (not on the approved dependency list), or supply STL/GLB directly.
- [ ] Allow a screenshot/Lighthouse tool (e.g. Playwright, Lighthouse CLI) for Phase C, or use the built-in browser only.
- [ ] Deleting any old asset (hero layer images, tools/ scripts, old css/js) after the Vite port: needs your OK per file group.
- [ ] Merge `redesign` to main: not before these flags are resolved.
