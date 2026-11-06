// Smooth scroll and scroll-driven motion. Loaded only when the visitor has not asked for reduced motion.
// Rules: one easing curve (--ease), three durations (--dur-1..3), transform and opacity only.
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(ScrollTrigger, CustomEase);

const css = getComputedStyle(document.documentElement);
const seconds = (name) => parseFloat(css.getPropertyValue(name)) / 1000;
const DUR = { base: seconds("--dur-2"), slow: seconds("--dur-3") };
// Same curve as the CSS token: cubic-bezier(0.2, 0, 0, 1)
const ease = CustomEase.create("site", "0.2,0,0,1");

export function initMotion() {
  clearTimeout(window.__revealFailsafe);

  // ---- Smooth scroll, synced to ScrollTrigger. Touch stays native so it never fights the page. ----
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: 0, duration: DUR.slow, easing: ease });
    history.replaceState(null, "", link.getAttribute("href"));
  });

  // ---- Hero intro ----
  gsap.fromTo("[data-intro]", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: DUR.slow, ease, stagger: 0.08, delay: 0.1 });

  // ---- Reveal on scroll ----
  for (const el of document.querySelectorAll("[data-reveal]")) {
    gsap.fromTo(el, { opacity: 0, y: 16 }, {
      opacity: 1, y: 0, duration: DUR.base, ease,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  }

  // ---- Write-up opens: content eases in ----
  document.addEventListener("write-up-toggle", (event) => {
    const { more, mores = [more], open } = event.detail;
    if (open) gsap.fromTo(mores.flatMap((m) => [...m.children]), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DUR.base, ease, stagger: 0.06 });
    ScrollTrigger.refresh();
  });

  // ---- Viewer turns with scroll while its project is on screen ----
  const link = (project) => {
    const viewer = project.__viewer;
    if (!viewer || project.__scrollLink) return;
    project.__scrollLink = ScrollTrigger.create({
      trigger: project, start: "top bottom", end: "bottom top",
      onUpdate: (self) => viewer.setScroll(self.progress),
    });
  };
  document.querySelectorAll("[data-project]").forEach(link);
  document.addEventListener("viewer-ready", (event) => link(event.detail.project));

  addEventListener("load", () => ScrollTrigger.refresh());

  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    if (!e.matches) return;
    lenis.destroy();
    ScrollTrigger.getAll().forEach((t) => t.kill());
  });
}
