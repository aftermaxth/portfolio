// Dev server only: saves the hero poster rendered in the browser.
// In the page (dev): const hero = await (await import("/portfolio/src/js/hero.js")).createHero(stageEl);
//   await fetch("/__save-hero-poster", { method: "POST", body: await hero.snapshot(2040, 630) });
// Writes images/hero/engine-render.webp. Not part of the production build.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export default function posterPlugin() {
  return {
    name: "dev-save-hero-poster",
    apply: "serve",
    configureServer(server) {
      const out = resolve(server.config.root, "images", "hero", "engine-render.webp");
      server.middlewares.use("/__save-hero-poster", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const body = Buffer.concat(chunks);
          // Accept only a WebP image (RIFF....WEBP header).
          if (body.toString("latin1", 0, 4) !== "RIFF" || body.toString("latin1", 8, 12) !== "WEBP") {
            res.statusCode = 400; res.end("not webp"); return;
          }
          writeFileSync(out, body);
          res.end(`saved ${body.length} bytes`);
        });
      });
    },
  };
}
