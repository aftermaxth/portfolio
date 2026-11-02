// Builds content/projects.json from the source-of-truth markdown.
// Copy is taken verbatim; the only editorial rules are the ones listed below
// (each one is logged in BUILD_LOG.md and TODO_CHARLES.md).
//   node tools/extract_source.mjs [path-to-source.md]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2] || process.env.PORTFOLIO_SOURCE || "C:/Users/thorn/toDO/Portfolio Source Material.md";
const outPath = resolve(here, "../content/projects.json");
const lines = readFileSync(srcPath, "utf8").split(/\r?\n/);

// ---- Editorial rules -------------------------------------------------------
const META = {
  1: { slug: "nasa-student-launch", title: "NASA Student Launch", kicker: "USLI" },
  2: { slug: "sae-aero-design", title: "SAE Aero Design", kicker: "Micro Class" },
  3: { slug: "robot-arena", title: "Robot Arena", kicker: "ENGR 122" },
  4: { slug: "plant-watering", title: "Automatic Plant Watering", kicker: "ENGR 111" },
  5: { slug: "training-hub-v2", title: "Training Hub V2", kicker: "Software" },
  6: { slug: "mocore-lab", title: "MOCORE Lab", kicker: "Research" },
};
// Source headings carry builder notes in parentheses; the page shows the clean label.
const HEADING = {
  "Short version (card)": "Overview",
  "What I learned (optional expand)": "What I learned",
  "The build (impact version)": "The build",
  "The redesigns (hard-project version)": "The redesigns",
};
// Whole sentences Charles asked to leave off the page (chat, 2026-11-02).
const DROP_SENTENCES = [
  "Only 3 of 12 robots finished a full lap, so it became a contest of finishing rather than speed.",
];
const DROP_NUMBERS = ["3 of 12 finished final"];
// Sections that show on the collapsed card (everything else sits behind the toggle).
const CARD_SECTIONS = { 4: ["Overview"], 6: ["Overview"] };
// Live-site sentences allowed to fill gaps the source marks [add] (whole sentences only).
const LIVE_FILLS = {
  4: {
    section: { heading: "Details", paragraphs: [
      "Reads soil moisture, waters on its own, and sends sensor readings over the Stevens wireless network. Waters 20 mL every 24 hours, and any time soil moisture reads under 30%. Readings go to the Stevens network every 10 minutes.",
    ], inCard: true },
    numbers: ["Deployed 5 days", "Telemetry every 10 min"],
  },
  5: {
    section: { heading: "Details", paragraphs: [
      "Tracks weekly mileage and workouts, plus goals sorted into Safe, Solid and Reach tiers with a weekly process tracker.",
    ], inCard: false },
    numbers: [],
  },
};
// ----------------------------------------------------------------------------

const brackets = [];
const projects = [];
let cur = null;
let section = null;

const clean = (s) => s.trim();
for (const raw of lines) {
  const line = raw.trimEnd();
  const h2 = line.match(/^## (\d)\. (.+)$/);
  if (h2) {
    const n = Number(h2[1]);
    cur = { n, ...META[n], sourceTitle: h2[2], role: "", org: "", timeline: "", tools: [], oneLiner: "", numbers: [], sections: [] };
    projects.push(cur);
    section = null;
    continue;
  }
  if (/^## /.test(line) || line === "---") { if (/^## /.test(line)) cur = null; section = null; continue; }
  if (!cur) continue;
  if (!line) continue;

  let m;
  if ((m = line.match(/^\*\*Role:\*\* (.+)$/))) {
    const parts = m[1].split(" | ").map(clean);
    cur.role = parts[0];
    if (parts.length === 3) { cur.org = parts[1]; cur.timeline = parts[2]; }
    else if (parts.length === 2) cur.timeline = parts[1];
    continue;
  }
  if ((m = line.match(/^\*\*Tools:\*\* (.+)$/))) { cur.tools = m[1].split(/,\s*(?![^()]*\))/).map(clean); continue; }
  if ((m = line.match(/^\*\*One-liner:\*\* (.+)$/))) { cur.oneLiner = m[1]; continue; }
  if ((m = line.match(/^\*\*Numbers:\*\* (.+)$/))) { cur.numbers = m[1].split(" | ").map(clean).filter((x) => !DROP_NUMBERS.includes(x)); continue; }
  if ((m = line.match(/^\*\*(\[.+\])\*\*$/))) { brackets.push(`${cur.slug}: ${m[1]}`); continue; }
  if ((m = line.match(/^\*\*(.+)\*\*$/))) {
    section = { heading: HEADING[m[1]] || m[1], source: m[1], paragraphs: [] };
    cur.sections.push(section);
    continue;
  }
  if (section) {
    let text = line;
    for (const s of DROP_SENTENCES) text = text.replace(" " + s, "").replace(s + " ", "");
    section.paragraphs.push(text);
  }
}

for (const p of projects) {
  const cardHeads = CARD_SECTIONS[p.n] || [];
  p.sections.forEach((s) => { s.inCard = cardHeads.includes(s.heading); });
  p.sections = p.sections.filter((s) => s.paragraphs.length);
  const fill = LIVE_FILLS[p.n];
  if (fill) {
    p.sections.push({ ...fill.section, source: "live site (fills an [add] gap)", provenance: "live" });
    if (fill.numbers.length) { p.numbers.push(...fill.numbers); p.numbersProvenance = "live"; }
  }
  delete p.n;
}

writeFileSync(outPath, JSON.stringify({ projects }, null, 2) + "\n");
console.log(`wrote ${outPath}`);
console.log(`projects: ${projects.map((p) => p.slug).join(", ")}`);
console.log(`bracket items skipped (never rendered): ${brackets.length}`);
brackets.forEach((b) => console.log("  " + b));
