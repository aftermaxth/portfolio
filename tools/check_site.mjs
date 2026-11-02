// Release checks: no em dashes in source or build output, no [bracket] placeholders rendered.
//   npm run build && node tools/check_site.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".svg", ".txt"]);
const EM = String.fromCharCode(0x2014);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else if (TEXT.has(extname(p))) out.push(p);
  }
  return out;
};

let bad = 0;
const scan = (label, dirs) => {
  let files = 0, hits = 0;
  for (const f of dirs.flatMap((d) => walk(join(root, d)))) {
    files++;
    const text = readFileSync(f, "utf8");
    // Skip vendored licenses and fonts' own docs; they are not site text.
    if (/licenses[\\/]/.test(f)) continue;
    if (text.includes(EM)) { hits++; console.log(`  em dash: ${f}`); }
  }
  console.log(`${label}: ${files} text files, ${hits} with em dashes`);
  bad += hits;
};
scan("src + content + tools", ["src", "content", "tools"]);
scan("dist", ["dist"]);

// Rendered text of the built page: strip tags, then look for bracket placeholders.
const html = readFileSync(join(root, "dist/index.html"), "utf8");
const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
const brackets = text.match(/\[[^\]]{1,80}\]/g) || [];
console.log(`dist/index.html rendered text: ${brackets.length} bracket placeholders${brackets.length ? " -> " + brackets.join(", ") : ""}`);
bad += brackets.length;

process.exit(bad ? 1 : 0);
