// Compresses the hero engine model for the site.
// Source: "Jet Engine" by shogo.gfx, CC BY 4.0, downloaded from Sketchfab by Charles (see THIRD_PARTY.md).
// The source stays outside the repo (HERO_MODEL_SRC, default toDO\portfolio_update\jet_engine.glb).
// Output: models/hero/jet-engine.glb (meshopt, simplified within a tight error, materials kept separate).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = process.env.HERO_MODEL_SRC || join(homedir(), "toDO", "portfolio_update", "jet_engine.glb");
const out = join(root, "models", "hero", "jet-engine.glb");
if (!existsSync(src)) {
  console.error(`missing source model: ${src} (set HERO_MODEL_SRC)`);
  process.exit(1);
}
mkdirSync(join(root, "models", "hero"), { recursive: true });

const cli = join(root, "node_modules", "@gltf-transform", "cli", "bin", "cli.js");
execFileSync(process.execPath, [cli, "optimize", src, out,
  "--compress", "meshopt",
  "--simplify-error", "0.0001",
  "--palette", "false",
  "--texture-compress", "false",
], { stdio: "inherit" });
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} kB`);
