// Write-up toggles and lazy 3D viewers. Without JS the full write-up is simply visible.

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
}
