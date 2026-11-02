# THIRD_PARTY

Every third-party piece the site ships or builds with. Licenses were read from the installed package metadata on 2026-11-02 unless noted. Phase B entries are below.

## Runtime (ships in dist)
| Item | Version | License | Source | Use |
|---|---|---|---|---|
| three | 0.187.0 | MIT | https://github.com/mrdoob/three.js | 3D viewer and hero. Uses addons GLTFLoader, MeshoptDecoder, RoomEnvironment, HDRLoader, BufferGeometryUtils, HorizontalBlurShader, VerticalBlurShader. |
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
| Robot assembly GLB (models/robot-arena--assembly.glb) | Housing and ArUco panel: Charles Thorn | Purchased parts (Zumo chassis, sensors, WeMos D1, FeeTech controller, OLED display) were stripped from the model on 2026-11-02, so no vendor CAD is redistributed. The gallery render robot-assembly.webp still shows the full assembly. |
| Old hero photo (images/hero/engine.webp) | Credit line said "Photo: U.S. Air Force", inferred, never confirmed | Deleted from the tree on 2026-11-02 (replaced by a render); remains in git history only. |
| Resume PDF | Charles Thorn | Unchanged copy of the original |

## Phase B
| Item | License / author | Source | Status |
|---|---|---|---|
| HDRI "Studio Small 09" (public/env/studio_small_09_512.hdr) | CC0, Sergej Majboroda (Poly Haven) | https://polyhaven.com/a/studio_small_09 (1k .hdr, md5 d5d7eb9d26d341d6aa4d11c1a54fd97c, halved to 512x256 by tools/build_env.mjs) | In use. No attribution required; credited here anyway. |
| Hero jet engine model "Jet Engine" | CC BY 4.0 (Sketchfab "CC Attribution"), author shogo.gfx (https://sketchfab.com/shogo.gfx) | https://sketchfab.com/3d-models/jet-engine-fe3794fdc4ac49df910cecd007bfaaa3 (created 2021-10-01, 241,553 triangles) | In use: models/hero/jet-engine.glb and the poster images/hero/engine-render.webp. Modified: simplified and meshopt-compressed (tools/build_hero_model.mjs), fan color set to #ff8100, flame added in code. Credited visibly under the hero (title, author, license links, "modified"). |
| Procedural engine and plume (src/js/engine.js, plume.js) | Own code | n/a | Plume in use; procedural engine is the fallback if the model fails to load. |
| pmndrs/postprocessing | n/a | n/a | Not added: MSAA is used instead. |
