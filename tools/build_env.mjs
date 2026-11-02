// Shrinks a Radiance .hdr environment map for self-hosting: halves width and height
// (2x2 box filter in linear light) and writes run-length encoded RGBE.
// Usage: node tools/build_env.mjs <input.hdr> <output.hdr>
// Source used: Poly Haven "Studio Small 09" 1k (CC0), see THIRD_PARTY.md.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node tools/build_env.mjs <input.hdr> <output.hdr>");
  process.exit(1);
}

// ---- read ----
const buf = readFileSync(input);
let pos = 0;
const line = () => { const start = pos; while (buf[pos] !== 0x0a) pos++; return buf.toString("latin1", start, pos++); };
if (!line().startsWith("#?")) throw new Error("not a Radiance file");
for (let l = line(); l !== ""; l = line()) if (l.startsWith("FORMAT=") && l !== "FORMAT=32-bit_rle_rgbe") throw new Error(l);
const [, h, , w] = line().split(" ");
const W = Number(w), H = Number(h);

const rgbe = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  const row = rgbe.subarray(y * W * 4, (y + 1) * W * 4);
  if (buf[pos] !== 2 || buf[pos + 1] !== 2 || ((buf[pos + 2] << 8) | buf[pos + 3]) !== W) throw new Error("only new-style RLE scanlines are supported");
  pos += 4;
  for (let c = 0; c < 4; c++) {
    for (let x = 0; x < W;) {
      let count = buf[pos++];
      if (count > 128) { count -= 128; const v = buf[pos++]; while (count--) row[(x++) * 4 + c] = v; }
      else while (count--) row[(x++) * 4 + c] = buf[pos++];
    }
  }
}

// ---- downsample 2x in linear float ----
const toFloat = (i) => { const e = rgbe[i + 3]; if (!e) return [0, 0, 0]; const f = 2 ** (e - 136); return [rgbe[i] * f, rgbe[i + 1] * f, rgbe[i + 2] * f]; };
const w2 = W / 2, h2 = H / 2;
const out = new Uint8Array(w2 * h2 * 4);
for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
  const s = [0, 0, 0];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const p = toFloat(((2 * y + dy) * W + 2 * x + dx) * 4);
    s[0] += p[0] / 4; s[1] += p[1] / 4; s[2] += p[2] / 4;
  }
  const m = Math.max(...s), o = (y * w2 + x) * 4;
  if (m < 1e-32) { out.set([0, 0, 0, 0], o); continue; }
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = 256 / 2 ** e;
  out.set([Math.min(255, Math.floor(s[0] * f)), Math.min(255, Math.floor(s[1] * f)), Math.min(255, Math.floor(s[2] * f)), e + 128], o);
}

// ---- write, new-style RLE per channel ----
const chunks = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h2} +X ${w2}\n`, "latin1")];
for (let y = 0; y < h2; y++) {
  const bytes = [2, 2, w2 >> 8, w2 & 255];
  for (let c = 0; c < 4; c++) {
    const ch = Array.from({ length: w2 }, (_, x) => out[(y * w2 + x) * 4 + c]);
    for (let x = 0; x < w2;) {
      let run = 1;
      while (x + run < w2 && run < 127 && ch[x + run] === ch[x]) run++;
      if (run >= 3) { bytes.push(128 + run, ch[x]); x += run; continue; }
      let n = 0;
      while (x + n < w2 && n < 128) {
        if (x + n + 2 < w2 && ch[x + n] === ch[x + n + 1] && ch[x + n] === ch[x + n + 2]) break;
        n++;
      }
      bytes.push(n, ...ch.slice(x, x + n)); x += n;
    }
  }
  chunks.push(Buffer.from(bytes));
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat(chunks));
console.log(`${W}x${H} -> ${w2}x${h2}, ${Buffer.concat(chunks).length} bytes: ${output}`);
