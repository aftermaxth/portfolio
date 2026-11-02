// Checks that every text string in content/projects.json comes from the source
// file (or, for entries marked provenance "live", from the live site's HTML).
//   node tools/verify_content.mjs [source.md]
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2] || process.env.PORTFOLIO_SOURCE || "C:/Users/thorn/toDO/Portfolio Source Material.md";
const resumePath = process.env.PORTFOLIO_RESUME || "C:/Users/thorn/toDO/Claude outputs/Charles_Thorn_Resume_Mechanical.docx";
// Minimal .docx reader: find word/document.xml in the zip's central directory and inflate it.
function docxText(path) {
  const b = readFileSync(path);
  let i = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let off = b.readUInt32LE(eocd + 16);
  const count = b.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    const method = b.readUInt16LE(off + 10), csize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28), extraLen = b.readUInt16LE(off + 30), commentLen = b.readUInt16LE(off + 32);
    const local = b.readUInt32LE(off + 42), name = b.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === "word/document.xml") {
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const raw = b.subarray(start, start + csize);
      return (method === 8 ? inflateRawSync(raw) : raw).toString("utf8").replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "");
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("word/document.xml not found in " + path);
}
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
// Titles: verbatim from the source headings (project 6's parenthetical is a builder note).
projects.forEach((p, i) => {
  const full = p.kicker ? `${p.title} (${p.kicker})` : p.title;
  check(`${p.slug} heading`, `${i + 1}. ${full}`, source);
});
// Next card: the old site's wording (Charles chose it over the source line, 2026-11-02).
for (const c of site.next.cards) {
  check("next card tag", c.tag, live);
  check("next card title", c.title, live);
  check("next card text", c.text, live);
}
// Degree, minor and graduation: exact resume wording.
const resume = norm(docxText(resumePath));
for (const s of site.hero.specs.filter((x) => /resume/.test(x.origin))) s.values.forEach((v) => check(`hero / ${s.label}`, v, resume));
for (const row of site.about.rows.filter((r) => r.fromResume)) row.items.forEach((i) => check(`about / ${row.label} (resume)`, i, resume));
console.log(`checked ${checked} strings against source (+ live site for marked fills)`);
if (failures.length) { console.log(`FAIL: ${failures.length} not found`); failures.forEach((f) => console.log("  " + f)); process.exit(1); }
console.log("OK: every project string matches the source file or the live site");
