// main.js
// Progressive enhancement only. The site is fully usable with JS off.

const root = document.documentElement;

// ---------- Hero ----------
// The heat text and the animation load on their own, so the rest of the page never waits
// on WebGL.
const hero = document.querySelector("[data-hero]");
if (hero) {
  import("./heat-text.js")
    .then(({ initHeatText }) => initHeatText(hero))
    .catch((error) => console.warn("Heat text unavailable:", error));
  import("./hero-engine.js")
    .then(({ initHeroEngine }) => initHeroEngine(hero))
    .catch((error) => console.warn("Hero animation unavailable:", error));
}

// ---------- Reveal on scroll ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && "IntersectionObserver" in window) {
  root.classList.add("js-reveal");

  const revealer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" }
  );

  document.querySelectorAll("[data-reveal]").forEach((el) => revealer.observe(el));
}

// ---------- Active nav link ----------
const navLinks = [...document.querySelectorAll(".nav__link")];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if (sections.length && "IntersectionObserver" in window) {
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) {
          const isMatch = link.getAttribute("href") === `#${entry.target.id}`;
          if (isMatch) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );

  sections.forEach((section) => spy.observe(section));
}
