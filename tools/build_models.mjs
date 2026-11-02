// Builds models/*.glb from the SolidWorks STL exports (kept outside the repo: they are large).
//   node tools/build_models.mjs [outName ...]        e.g. robot-arena--housing
//   MODELS_SRC=<folder with the .STL files>           (default below)
// Pipeline: STL (binary, mm) -> welded positions-only GLB in meters -> gltf-transform optimize
// (weld, join, simplify within an error bound, meshopt). Viewer computes creased normals at load.
import { readFileSync, writeFileSync, statSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SRC = process.env.MODELS_SRC || "C:/Users/thorn/toDO/portfolio_update/solidworks_files";
const OUT = join(root, "models");
const TMP = join(root, "tools", ".tmp-models");

// Part classes: printed = Charles's own printed design (accent orange), panel = the ArUco marker panel.
// Purchased parts (Zumo chassis, WeMos D1, FeeTech controller, OLED display, ultrasonic sensors) are
// left out on purpose: the viewer shows only the team's own parts and no vendor CAD is redistributed.
const COLORS = {
  printed: { hex: "#ff8100", rough: 0.55, metal: 0.0 },
  panel: { hex: "#e9e7e2", rough: 0.7, metal: 0.0 },
};

// simplifyError is a fraction of each mesh's extent; raise it if a file is over budget.
const MODELS = {
  "robot-arena--housing": {
    simplifyError: 0.00005,
    parts: [["engr_122 - bodytry3-1.STL", "printed"]],
  },
  "robot-arena--assembly": {
    simplifyError: 0.0002,
    parts: [
      ["engr_122 - bodytry3-1.STL", "printed"],
      ["engr_122 - flat-1.STL", "panel"],
    ],
  },
  "plant-watering": {
    simplifyError: 0.00005,
    parts: [["engr_111 - revisedhd-1.STL", "printed"]],
  },
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToLinear = (hex) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

// Binary STL -> welded positions (meters) + indices
function readStl(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(80);
  if (84 + 50 * n !== b.length) throw new Error(`${path}: not a binary STL`);
  const map = new Map();
  const pos = [];
  const idx = [];
  for (let t = 0; t < n; t++) {
    const o = 84 + 50 * t + 12;
    const tri = [];
    for (let v = 0; v < 3; v++) {
      const x = b.readFloatLE(o + v * 12), y = b.readFloatLE(o + v * 12 + 4), z = b.readFloatLE(o + v * 12 + 8);
      const key = `${x}|${y}|${z}`;
      let i = map.get(key);
      if (i === undefined) { i = pos.length / 3; map.set(key, i); pos.push(x * 0.001, y * 0.001, z * 0.001); }
      tri.push(i);
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(...tri);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

function writeGlb(parts, path) {
  const matNames = [...new Set(parts.map((p) => p.cls))];
  const bufs = [], views = [], accessors = [], meshes = [], nodes = [];
  let offset = 0;
  const push = (buf, target) => {
    const pad = (4 - (buf.byteLength % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.byteLength, target });
    bufs.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), Buffer.alloc(pad));
    offset += buf.byteLength + pad;
    return views.length - 1;
  };
  parts.forEach((p, i) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.positions.length; k++) { const a = k % 3; min[a] = Math.min(min[a], p.positions[k]); max[a] = Math.max(max[a], p.positions[k]); }
    const pv = push(p.positions, 34962), iv = push(p.indices, 34963);
    accessors.push({ bufferView: pv, componentType: 5126, count: p.positions.length / 3, type: "VEC3", min, max });
    accessors.push({ bufferView: iv, componentType: 5125, count: p.indices.length, type: "SCALAR" });
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: matNames.indexOf(p.cls) }] });
    nodes.push({ name: p.name, mesh: i });
  });
  const json = {
    asset: { version: "2.0", generator: "portfolio tools/build_models.mjs" },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes,
    materials: matNames.map((c) => ({ name: c, pbrMetallicRoughness: { baseColorFactor: [...hexToLinear(COLORS[c].hex), 1], metallicFactor: COLORS[c].metal, roughnessFactor: COLORS[c].rough } })),
    buffers: [{ byteLength: offset }], bufferViews: views, accessors,
  };
  let j = Buffer.from(JSON.stringify(json));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(bufs);
  const header = Buffer.alloc(12);
  header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.write(type, 4, "ascii"); return h; };
  writeFileSync(path, Buffer.concat([header, ch(j.length, "JSON"), j, ch(bin.length, "BIN\0"), bin]));
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const wanted = process.argv.slice(2);
for (const [name, cfg] of Object.entries(MODELS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const parts = cfg.parts.map(([file, cls]) => ({ name: file.replace(/^engr_\d+ - /, "").replace(/\.STL$/i, ""), cls, ...readStl(join(SRC, file)) }));
  const raw = join(TMP, `${name}.raw.glb`);
  const out = join(OUT, `${name}.glb`);
  writeGlb(parts, raw);
  const r = spawnSync(process.execPath, [join(root, "node_modules/@gltf-transform/cli/bin/cli.js"), "optimize", raw, out, "--compress", "meshopt", "--simplify", "true", "--simplify-ratio", "0", "--simplify-error", String(cfg.simplifyError), "--texture-compress", "false"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  const tris = parts.reduce((s, p) => s + p.indices.length / 3, 0);
  console.log(`${name}: ${parts.length} part(s), ${tris} source triangles, raw ${(statSync(raw).size / 1e6).toFixed(1)} MB -> ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
rmSync(TMP, { recursive: true, force: true });
