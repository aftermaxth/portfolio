// Write-up toggles and lazy 3D viewers. Without JS the full write-up is simply visible
// and the viewers show their still image.

export function initProjects() {
  for (const project of document.querySelectorAll("[data-project]")) {
    const toggle = project.querySelector("[data-toggle]");
    const more = project.querySelector("[data-more]");
    if (!toggle || !more) continue;

    more.hidden = true;
    toggle.hidden = false;
    const label = toggle.querySelector("[data-toggle-label]");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      label.textContent = open ? "Close the write-up" : "Read the full write-up";
      more.hidden = !open;
      document.dispatchEvent(new CustomEvent("write-up-toggle", { detail: { project, more, open } }));
    });
  }

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
