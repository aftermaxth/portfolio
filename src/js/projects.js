// Write-up toggles and lazy 3D viewers. Without JS the full write-up is simply visible
// and the viewers show their still image.

export function initProjects() {
  for (const project of document.querySelectorAll("[data-project]")) {
    const toggle = project.querySelector("[data-toggle]");
    // Most cards have one write-up block; the USLI card has two (the text and the player), opened together.
    const mores = [...project.querySelectorAll("[data-more]")];
    const more = mores[0];
    if (!toggle || !more) continue;

    for (const m of mores) m.hidden = true;
    toggle.hidden = false;
    const label = toggle.querySelector("[data-toggle-label]");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      label.textContent = open ? "Close the write-up" : "Read the full write-up";
      for (const m of mores) m.hidden = !open;
      document.dispatchEvent(new CustomEvent("write-up-toggle", { detail: { project, more, mores, open } }));
    });
  }

  initUsli();
  initUsliParts();

  const roots = document.querySelectorAll("[data-viewer]");
  if (!roots.length) return;

  const mount = async (root) => {
    const status = root.querySelector(".viewer__status");
    root.dataset.state = "loading";
    status.textContent = "Loading model";
    try {
      const { createViewer } = await import("./viewer.js");
      const viewer = await createViewer(root);
      const project = root.closest("[data-project]");
      project.__viewer = viewer;
      status.textContent = "";
      document.dispatchEvent(new CustomEvent("viewer-ready", { detail: { project, viewer } }));
    } catch (error) {
      root.dataset.state = "fallback";
      status.textContent = "3D view unavailable";
      console.info("3D viewer unavailable:", error.message);
    }
  };

  if (!("IntersectionObserver" in window)) return roots.forEach(mount);
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        mount(entry.target);
      }
    },
    { rootMargin: "400px 0px" }
  );
  roots.forEach((r) => io.observe(r));
}

// USLI card: the parts list under the drawing is a disclosure only when the drawing is too narrow for its own
// labels (the same 680 px container width the CSS uses). It starts closed there, so the summary text is not buried;
// it stays open (and visually hidden for screen readers) when the drawing carries its labels.
function initUsliParts() {
  const parts = document.querySelector("[data-usli-parts]");
  const fig = parts?.closest(".usli__schematic");
  if (!fig) return;
  let narrow = null;
  const sync = () => {
    const now = fig.clientWidth < 680;
    if (now === narrow) return;
    narrow = now;
    parts.open = !now;
  };
  sync();
  if ("ResizeObserver" in window) new ResizeObserver(sync).observe(fig);
}

// USLI card: the recovery sequence player sits under the drawing (left column on a laptop, after the toggle on a phone). The WebGL chunk loads only when the
// write-up opens (with reduced motion: only when Play is pressed; the still frames show until then). Nothing autoplays.
// Without WebGL, or if loading fails, the still frames stay and the controls hide.
function initUsli() {
  const root = document.querySelector("[data-usli]");
  if (!root) return;
  if (!("WebGLRenderingContext" in window)) return;
  const project = root.closest("[data-project]");
  const controls = root.querySelector("[data-usli-controls]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.hidden = false;
  let loading = null;
  const ensure = () => (loading ??= import("./usli-scene.js")
    .then((m) => m.mountUsli(root))
    .catch((error) => {
      root.dataset.state = "still";
      controls.hidden = true;
      console.info("USLI scene unavailable:", error.message);
      throw error;
    }));
  const run = (fn) => ensure().then(fn, () => {});
  root.querySelector("[data-usli-toggle]").addEventListener("click", () => run((s) => (s.playing ? s.pause() : s.play())));
  root.querySelector("[data-usli-restart]").addEventListener("click", () => run((s) => s.restart()));
  document.addEventListener("write-up-toggle", ({ detail }) => {
    if (detail.project === project && detail.open && !reduce) ensure().catch(() => {});
  });
}
