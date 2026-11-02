import { defineConfig } from "vite";
import sitePlugin from "./tools/vite-plugin-site.mjs";
import posterPlugin from "./tools/vite-plugin-poster.mjs";

export default defineConfig({
  base: "/portfolio/",
  plugins: [sitePlugin(), posterPlugin()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
  },
});
