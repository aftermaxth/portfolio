// Entry. The page is complete static HTML; everything here is enhancement.
import "@fontsource-variable/archivo/index.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

import { initProjects } from "./js/projects.js";
import { initNav } from "./js/nav.js";

initProjects();
initNav();

// Smooth scroll, scroll-driven motion and the live hero are skipped entirely for reduced motion.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  import("./js/motion.js").then((m) => m.initMotion());
  mountHero();
}

// The hero poster is the first paint. The real-time engine loads after the page has finished
// loading and the browser is idle, then fades in over the poster. Any failure keeps the poster.
function mountHero() {
  const stage = document.querySelector("[data-hero-stage]");
  if (!stage) return;
  const start = () => import("./js/hero.js")
    .then((m) => m.createHero(stage))
    .catch((error) => { stage.dataset.state = "fallback"; console.info("Hero 3D unavailable:", error.message); });
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 200));
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}
