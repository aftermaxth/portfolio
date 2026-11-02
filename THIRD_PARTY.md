# THIRD_PARTY

Every third-party piece the site ships or builds with. Licenses were read from the installed package metadata on 2026-11-02 unless noted. Phase B adds the engine model, HDRI and postprocessing here.

## Runtime (ships in dist)
| Item | Version | License | Source | Use |
|---|---|---|---|---|
| three | 0.187.0 | MIT | https://github.com/mrdoob/three.js | 3D viewer. Uses addons GLTFLoader, MeshoptDecoder, RoomEnvironment, BufferGeometryUtils. |
| gsap (core, ScrollTrigger, CustomEase) | 3.15.0 | GSAP Standard "no charge" license (https://gsap.com/standard-license) | https://github.com/greensock/GSAP | Scroll motion. Not OSI open source; free for this use. Only the package.json license field was checked, not the full license text. |
| lenis | 1.3.27 | MIT | https://github.com/darkroomengineering/lenis | Smooth scroll |
| Archivo Variable (@fontsource-variable/archivo) | 5.3.0 | SIL OFL 1.1 | https://github.com/Omnibus-Type/Archivo | Sans typeface. License text ships at /licenses/archivo-OFL.txt |
| DM Mono (@fontsource/dm-mono) | 5.3.0 | SIL OFL 1.1 | https://github.com/googlefonts/dm-mono | Mono typeface. License text ships at /licenses/dm-mono-OFL.txt |

## Build only (does not ship)
| Item | Version | License | Use |
|---|---|---|---|
| vite | 8.3.5 | MIT | Bundler and dev server |
| @gltf-transform/cli (with core, functions) | 4.5.1 | MIT | `optimize` step in tools/build_models.mjs (weld, simplify, meshopt) |
| meshoptimizer (via gltf-transform) | 1.2.0 | MIT | Mesh simplification and compression |

`npm audit --omit=dev`: 0 vulnerabilities. `npm audit` (all): 4 moderate, in dev tooling only.

## Content and assets
| Item | License / owner | Status |
|---|---|---|
| Project photos, renders, demo videos (images/) | Charles Thorn | Own work |
| Plant enclosure and robot housing CAD (models/plant-watering.glb, robot-arena--housing.glb) | Charles Thorn | Own design |
| Robot assembly GLB (models/robot-arena--assembly.glb) | Housing and ArUco panel: Charles Thorn. Zumo chassis, HC-SR04-type sensors, WeMos D1, FeeTech controller and OLED display: course-supplied or vendor CAD | UNCLEAR redistribution license. See TODO_CHARLES.md. Remove those parts or confirm before publishing. |
| Hero photo (images/hero/engine.webp) | Credit line says "Photo: U.S. Air Force", inferred from test-stand stenciling, never confirmed | UNCLEAR. Replaced in Phase B. |
| Resume PDF | Charles Thorn | Unchanged copy of the original |

## Pending (Phase B)
- Jet engine model: Sketchfab (CC0 or CC-BY) or NASA 3D Resources, or procedural three.js. Top 3 candidates with license and poly count get listed before use.
- HDRI: Poly Haven (CC0).
- pmndrs/postprocessing (SMAA).
