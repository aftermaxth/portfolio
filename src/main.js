// Entry. The page is complete static HTML; everything here is enhancement.
import "@fontsource-variable/archivo/index.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

import { initProjects } from "./js/projects.js";
import { initMotion } from "./js/motion.js";

initProjects();
initMotion();
