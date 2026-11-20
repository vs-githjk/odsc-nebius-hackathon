import { useLayoutEffect } from "react";
import { arrive, backTarget, focusHeading, navigation } from "../model/navigation.ts";
import { isPlainClick } from "../model/claimBox.ts";

export function RouteExperience({ routeKey }: { routeKey: string }) {
  useLayoutEffect(() => {
    const hash = window.location.hash || "#/";
    const fresh = navigation.liveArrival === hash;
    const top = arrive(hash, navigation, fresh);
    if (fresh) navigation.liveArrival = "";
    const verdict = fresh ? document.querySelector(".stop-title") : null;
    if (verdict) verdict.classList.add("live-arrival");
    const highlightTimer = verdict ? window.setTimeout(() => verdict.classList.remove("live-arrival"), 1200) : undefined;
    if (top !== null) {
      focusHeading(document);
      window.scrollTo({ top, behavior: "instant" });
      const main = document.querySelector("main");
      if (main && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // Short, and from 0.6 rather than 0: a background tab can hold an animation at its first frame until the tab
        // is shown, and a page should never sit there pale (XO on #257).
        main.animate([{ opacity: 0.6, transform: "translateY(2px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 120 });
      }
    }
    const save = () => { navigation.scroll = window.scrollY; };
    save();
    window.addEventListener("scroll", save, { passive: true });
    return () => { window.removeEventListener("scroll", save); window.clearTimeout(highlightTimer); verdict?.classList.remove("live-arrival"); };
  }, [routeKey]);
  return null;
}

export function BackToResults() {
  // Resolve on activation as well: the route layout effect records this arrival after render.
  const target = () => navigation.current !== window.location.hash
    ? backTarget(navigation.current, window.location.hash)
    : navigation.origins.get(window.location.hash) ?? "#/";
  return <a className="back" href={typeof window !== "undefined" && window.location ? target() : "#/"} onClick={event => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    const hash = target();
    navigation.restore = hash;
    window.location.hash = hash;
  }}><svg className="back-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Back to results</a>;
}
