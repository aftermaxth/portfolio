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

// Smooth scroll and scroll-driven motion are skipped entirely for reduced motion.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  import("./js/motion.js").then((m) => m.initMotion());
}
