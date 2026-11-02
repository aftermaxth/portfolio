import { defineConfig } from "vite";
import sitePlugin from "./tools/vite-plugin-site.mjs";

export default defineConfig({
  base: "/portfolio/",
  plugins: [sitePlugin()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
  },
});
