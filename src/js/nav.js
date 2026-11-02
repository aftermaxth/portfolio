// Marks the nav link for the section in view. No motion involved, so it runs for everyone.
export function initNav() {
  const links = [...document.querySelectorAll(".nav__link")];
  const targets = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (!targets.length || !("IntersectionObserver" in window)) return;

  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const a of links) {
          if (a.getAttribute("href") === `#${entry.target.id}`) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  targets.forEach((t) => spy.observe(t));
}
