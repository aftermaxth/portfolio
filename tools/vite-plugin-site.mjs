// Vite plugin: renders the page as static HTML from content/*.json and
// discovers assets by folder, so adding a file and rebuilding is all it takes.
//   models/<slug>.glb            -> that project gets a pinned 3D viewer
//   models/<slug>--<label>.glb   -> several models for one project (viewer tabs)
//   images/<slug>/*              -> that project gets a gallery (video needs a same-named poster image)
// Layout per project: model -> viewer, images only -> gallery, neither -> text-only.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, extname, basename, join } from "node:path";

const IMG = /\.(webp|png|jpe?g|avif)$/i;
const VID = /\.(mp4|webm)$/i;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Attribution line: plain text, or {label, title, titleUrl, author, authorUrl, license, licenseUrl, changes}.
const creditHTML = (c) => {
  if (typeof c === "string") return esc(c);
  const a = (href, text, rel = "") => `<a class="link" href="${esc(href)}"${rel ? ` rel="${rel}"` : ""}>${esc(text)}</a>`;
  return `${esc(c.label)}: ${a(c.titleUrl, c.title)} by ${a(c.authorUrl, c.author)}, ${a(c.licenseUrl, c.license, "license")}, ${esc(c.changes)}`;
};

function imageSize(buf, name) {
  const ext = extname(name).toLowerCase();
  if (ext === ".png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (ext === ".webp") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { width: 0, height: 0 };
}

export default function sitePlugin() {
  let root = process.cwd();
  let base = "/";
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
  const url = (rel) => `${base}${rel}`.replace(/\/{2,}/g, "/");

  function scan(mediaMeta) {
    const models = {};
    const media = {};
    const mdir = resolve(root, "models");
    if (existsSync(mdir)) {
      for (const f of readdirSync(mdir).filter((f) => f.endsWith(".glb")).sort()) {
        const [slug, label] = basename(f, ".glb").split("--");
        const id = label || "model";
        const m = (mediaMeta[slug]?.models || {})[id] || {};
        (models[slug] ||= []).push({ id, label: m.label || titleCase(id), alt: m.alt || "", url: url(`models/${f}`) });
      }
    }
    const idir = resolve(root, "images");
    if (existsSync(idir)) {
      for (const slug of readdirSync(idir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "hero").map((d) => d.name)) {
        const dir = join(idir, slug);
        const files = readdirSync(dir).sort();
        const videos = files.filter((f) => VID.test(f));
        const videoBases = new Set(videos.map((v) => basename(v, extname(v))));
        const items = [];
        for (const f of files) {
          const meta = mediaMeta[slug]?.files?.[f] || {};
          const buf = readFileSync(join(dir, f));
          if (VID.test(f)) {
            const poster = files.find((p) => IMG.test(p) && basename(p, extname(p)) === basename(f, extname(f)));
            const pp = poster ? imageSize(readFileSync(join(dir, poster)), poster) : { width: 0, height: 0 };
            items.push({ type: "video", file: f, src: url(`images/${slug}/${f}`), poster: poster ? url(`images/${slug}/${poster}`) : "", width: meta.width || pp.width, height: meta.height || pp.height, alt: meta.alt || "", caption: meta.caption || "" });
          } else if (IMG.test(f) && !videoBases.has(basename(f, extname(f)))) {
            const s = imageSize(buf, f);
            items.push({ type: "image", file: f, src: url(`images/${slug}/${f}`), width: s.width, height: s.height, alt: meta.alt || "", caption: meta.caption || "" });
          }
        }
        const order = mediaMeta[slug]?.order || [];
        items.sort((a, b) => (order.indexOf(a.file) + 1 || 99) - (order.indexOf(b.file) + 1 || 99) || a.file.localeCompare(b.file));
        if (items.length) media[slug] = items;
      }
    }
    return { models, media };
  }

  const figure = (m, allowWide = true) => {
    const wide = allowWide && m.width / m.height >= 1.4 ? " figure--wide" : "";
    const cap = m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : "";
    const dims = m.width ? ` width="${m.width}" height="${m.height}"` : "";
    const inner = m.type === "video"
      ? `<video src="${m.src}"${m.poster ? ` poster="${m.poster}"` : ""}${dims} controls muted loop playsinline preload="none" aria-label="${esc(m.alt)}"></video>`
      : `<img src="${m.src}"${dims} alt="${esc(m.alt)}" loading="lazy" decoding="async">`;
    return `<figure class="figure${wide}"><div class="figure__frame">${inner}</div>${cap}</figure>`;
  };

  function projectHTML(p, i, assets) {
    const num = String(i + 1).padStart(2, "0");
    const models = assets.models[p.slug] || [];
    const media = assets.media[p.slug] || [];
    const layout = models.length ? "model" : media.length ? "gallery" : "text";
    const cardSecs = p.sections.filter((s) => s.inCard);
    const moreSecs = p.sections.filter((s) => !s.inCard);
    const sec = (s) => `<section class="prose"><h4 class="label">${esc(s.heading)}</h4>${s.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("")}</section>`;
    const facts = [
      ["Role", p.role], p.org ? ["Org", p.org] : null, p.timeline ? ["Timeline", p.timeline] : null, ["Tools", p.tools.join(", ")],
    ].filter(Boolean).map(([k, v]) => `<div class="facts__row"><dt class="label">${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    const chips = p.numbers.length ? `<ul class="chips" aria-label="Numbers">${p.numbers.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";

    let mediaCol = "";
    if (layout === "model") {
      const first = media[0];
      const fallback = first ? `<img src="${first.src}" width="${first.width}" height="${first.height}" alt="${esc(first.alt)}" loading="lazy" decoding="async">` : "";
      const tabs = models.length > 1
        ? `<div class="viewer__tabs" role="group" aria-label="Choose model">${models.map((m, k) => `<button type="button" class="viewer__tab" data-model="${esc(m.id)}" aria-pressed="${k === 0}">${esc(m.label)}</button>`).join("")}</div>`
        : "";
      mediaCol = `<div class="project__media"><div class="viewer" data-viewer data-state="idle" data-models="${esc(JSON.stringify(models))}" role="group" aria-label="Interactive 3D model, ${esc(p.title)}">
        <div class="viewer__fallback">${fallback}</div>
        <p class="viewer__status label" aria-live="polite"></p>
        <div class="viewer__ui"><p class="viewer__hint label">Drag to rotate</p>${tabs}</div></div></div>`;
    } else if (layout === "gallery") {
      mediaCol = `<div class="project__media project__media--gallery gallery">${media.map(figure).join("")}</div>`;
    }
    const galleryRow = layout === "model" && media.length ? `<div class="project__gallery gallery" data-count="${media.length}">${media.map((m) => figure(m, false)).join("")}</div>` : "";
    const toggle = moreSecs.length
      ? `<button type="button" class="project__toggle" data-toggle aria-expanded="false" aria-controls="more-${p.slug}" hidden><span data-toggle-label>Read the full write-up</span><span aria-hidden="true" class="project__toggle-glyph">+</span></button>`
      : "";
    const more = moreSecs.length ? `<div class="project__more" id="more-${p.slug}" data-more>${moreSecs.map(sec).join("")}</div>` : "";

    return `<li class="project" id="${p.slug}" data-project data-layout="${layout}">
      <div class="container grid project__head" data-reveal>
        <p class="project__index label"><span>${num}</span>${p.kicker ? ` / ${esc(p.kicker)}` : ""}</p>
        <h3 class="project__title">${esc(p.title)}</h3>
      </div>
      <div class="container grid project__row">
        ${layout === "gallery" ? "" : mediaCol}
        <div class="project__body" data-reveal>
          <p class="project__lede">${esc(p.oneLiner)}</p>
          <dl class="facts">${facts}</dl>
          ${chips}
          ${cardSecs.map(sec).join("")}
          ${toggle}
          ${more}
        </div>
        ${layout === "gallery" ? mediaCol : ""}
      </div>
      ${galleryRow ? `<div class="container">${galleryRow}</div>` : ""}
    </li>`;
  }

  // Hero poster: the wide render, plus "<name>-narrow" (under 600 px) and "<name>-medium" (600 to 899 px)
  // renders for the stacked layouts when they exist. Sizes come from the files, so the markup always
  // matches the renders.
  function heroPoster(poster) {
    const size = (rel) => imageSize(readFileSync(resolve(root, rel)), rel);
    const wide = size(poster.src);
    const variant = (suffix, media) => {
      const rel = poster.src.replace(/(\.[a-z]+)$/i, `${suffix}$1`);
      if (!existsSync(resolve(root, rel))) return "";
      const s = size(rel);
      return `<source media="${media}" srcset="${url(rel)}" width="${s.width}" height="${s.height}">`;
    };
    const sources = variant("-narrow", "(max-width: 599px)") + variant("-medium", "(min-width: 600px) and (max-width: 899px)");
    return `<picture class="hero__picture">${sources}<img class="hero__poster" src="${url(poster.src)}" width="${wide.width}" height="${wide.height}" alt="${esc(poster.alt)}" fetchpriority="high" decoding="async"></picture>`;
  }

  function bodyHTML(site, projects, assets) {
    const h = site.hero;
    const btn = (b) => `<a class="button ${b.primary ? "button--primary" : "button--ghost"}" href="${esc(b.href)}"${b.external ? ' target="_blank" rel="noopener"' : ""}>${esc(b.label)} <span aria-hidden="true">${b.glyph}</span></a>`;
    const head = (n, s, id) => `<header class="section__head container grid" data-reveal><p class="label section__eyebrow"><span>${n}</span> / ${esc(s.eyebrow)}</p><h2 class="section__title" id="${id}">${esc(s.heading)}</h2></header>`;
    return `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="site-header__name" href="#top">${esc(site.name)}</a>
      <nav aria-label="Primary"><ul class="nav">${site.nav.map((n) => `<li class="nav__item nav__item--${n.label.toLowerCase()}"><a class="nav__link" href="${n.href}">${esc(n.label)}</a></li>`).join("")}</ul></nav>
    </div>
  </header>
  <main id="main">
    <section class="hero" id="top" aria-labelledby="hero-title" data-hero>
      <div class="container hero__grid">
        <p class="label hero__eyebrow" data-intro><span>01</span> / ${esc(h.eyebrow)}</p>
        <h1 class="hero__title" id="hero-title" data-intro>${esc(site.name)}</h1>
        <div class="hero__copy" data-intro>
          <p class="hero__lede">${esc(h.lede)}</p>
          <div class="button-row">${h.buttons.map(btn).join("")}</div>
        </div>
        <div class="hero__frame" data-hero-stage>${heroPoster(h.poster)}</div>
        <div class="hero__meta">
          <dl class="specs" data-intro>${h.specs.map((s) => `<div class="specs__row"><dt class="label">${esc(s.label)}</dt><dd>${s.values.map((v) => `<span class="specs__line">${esc(v)}</span>`).join("")}</dd></div>`).join("")}</dl>
          <p class="hero__credit">${creditHTML(h.poster.credit)}</p>
        </div>
      </div>
    </section>

    <section class="section" id="projects" aria-labelledby="projects-title">
      ${head("02", site.projects, "projects-title")}
      <ol class="project-list">${projects.map((p, i) => projectHTML(p, i, assets)).join("")}</ol>
    </section>

    <section class="section" id="next" aria-labelledby="next-title">
      ${head("03", site.next, "next-title")}
      <div class="container grid"><ul class="next-list">${site.next.cards.map((c) => `<li class="next-card" data-reveal><p class="label next-card__tag">${esc(c.tag)}${c.date ? ` / ${esc(c.date)}` : ""}</p><h3 class="next-card__title">${esc(c.title)}</h3>${c.text ? `<p class="next-card__text">${esc(c.text)}</p>` : ""}</li>`).join("")}</ul></div>
    </section>

    <section class="section" id="about" aria-labelledby="about-title">
      ${head("04", site.about, "about-title")}
      <div class="container grid"><dl class="rows" data-reveal>${site.about.rows.map((r) => `<div class="rows__row"><dt class="label">${esc(r.label)}</dt><dd>${r.items.length > 3 ? `<ul class="chips">${r.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : r.items.map((x) => `<p>${esc(x)}</p>`).join("")}</dd></div>`).join("")}</dl></div>
    </section>

    <section class="section" id="contact" aria-labelledby="contact-title">
      ${head("05", site.contact, "contact-title")}
      <div class="container grid"><dl class="rows" data-reveal>${site.contact.rows.map((r) => `<div class="rows__row"><dt class="label">${esc(r.label)}</dt><dd><a class="link" href="${esc(r.href)}"${r.external ? ' target="_blank" rel="noopener"' : ""}>${esc(r.text)}${r.external ? ' <span aria-hidden="true">↗</span>' : ""}</a></dd></div>`).join("")}</dl></div>
    </section>
  </main>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <p>${esc(site.footer.left)}</p>
      <p>${esc(site.footer.right)} · <a class="link" href="${esc(site.footer.sourceHref)}" target="_blank" rel="noopener">${esc(site.footer.sourceLabel)} <span aria-hidden="true">↗</span></a></p>
    </div>
  </footer>`;
  }

  return {
    name: "portfolio-site",
    configResolved(c) { root = c.root; base = c.base.endsWith("/") ? c.base : c.base + "/"; },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const site = read("content/site.json");
        const { projects } = read("content/projects.json");
        const mediaMeta = existsSync(resolve(root, "content/media.json")) ? read("content/media.json") : {};
        const assets = scan(mediaMeta);
        return html
          .replace(/%TITLE%/g, esc(site.title))
          .replace(/%DESCRIPTION%/g, esc(site.description))
          .replace(/%OG_DESCRIPTION%/g, esc(site.ogDescription))
          .replace("<!--SITE_BODY-->", bodyHTML(site, projects, assets));
      },
    },
    // Rebuild the page when content or asset folders change.
    configureServer(server) {
      for (const d of ["content", "models", "images"]) server.watcher.add(resolve(root, d));
      server.watcher.on("all", (_e, f) => { if (/[\\/](content|models|images)[\\/]/.test(f)) server.ws.send({ type: "full-reload" }); });
    },
    // models/ and images/ live at the repo root; ship them as-is.
    generateBundle() {
      for (const d of ["models", "images"]) {
        const walk = (dir, rel) => {
          if (!existsSync(dir)) return;
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) walk(join(dir, e.name), `${rel}/${e.name}`);
            else this.emitFile({ type: "asset", fileName: `${rel}/${e.name}`, source: readFileSync(join(dir, e.name)) });
          }
        };
        walk(resolve(root, d), d);
      }
    },
  };
}
