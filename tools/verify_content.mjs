// Checks that every text string in content/projects.json comes from the source
// file (or, for entries marked provenance "live", from the live site's HTML).
//   node tools/verify_content.mjs [source.md]
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2] || process.env.PORTFOLIO_SOURCE || "C:/Users/thorn/toDO/Portfolio Source Material.md";
const norm = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const source = norm(readFileSync(srcPath, "utf8").replace(/\*\*/g, ""));
const live = norm(execSync("git show origin/main:index.html", { cwd: resolve(here, ".."), encoding: "utf8" }));
const { projects } = JSON.parse(readFileSync(resolve(here, "../content/projects.json"), "utf8"));

let checked = 0;
const failures = [];
const check = (where, text, pool) => {
  checked++;
  if (!pool.includes(norm(text))) failures.push(`${where}: ${text.slice(0, 90)}`);
};
// A paragraph may have had a whole sentence removed, so check sentence by sentence.
const sentences = (p) => p.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g).map((x) => x.trim()).filter(Boolean);

for (const p of projects) {
  check(`${p.slug} oneLiner`, p.oneLiner, source);
  check(`${p.slug} role`, p.role, source);
  if (p.org) check(`${p.slug} org`, p.org, source);
  if (p.timeline) check(`${p.slug} timeline`, p.timeline, source);
  p.tools.forEach((t) => check(`${p.slug} tool`, t, source));
  p.numbers.forEach((n) => check(`${p.slug} number`, n, p.numbersProvenance === "live" && !source.includes(norm(n)) ? live : source));
  for (const s of p.sections) {
    const pool = s.provenance === "live" ? live : source;
    for (const para of s.paragraphs) sentences(para).forEach((x) => check(`${p.slug} / ${s.heading}`, x, pool));
  }
}
const site = JSON.parse(readFileSync(resolve(here, "../content/site.json"), "utf8"));
for (const row of site.about.rows) if (row.fromSource) row.items.forEach((i) => check(`about / ${row.label}`, i, source));
console.log(`checked ${checked} strings against source (+ live site for marked fills)`);
if (failures.length) { console.log(`FAIL: ${failures.length} not found`); failures.forEach((f) => console.log("  " + f)); process.exit(1); }
console.log("OK: every project string matches the source file or the live site");
