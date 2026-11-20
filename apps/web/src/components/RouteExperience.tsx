import { useLayoutEffect } from "react";
import { arrive, backTarget, focusHeading, navigation } from "../model/navigation.ts";
import { isPlainClick } from "../model/claimBox.ts";

export function RouteExperience({ routeKey }: { routeKey: string }) {
  useLayoutEffect(() => {
    const hash = window.location.hash || "#/";
    const top = arrive(hash);
    if (top !== null) {
      focusHeading(document);
      window.scrollTo({ top, behavior: "instant" });
      const main = document.querySelector("main");
      if (main && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        main.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180 });
      }
    }
    const save = () => { navigation.scroll = window.scrollY; };
    save();
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
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
  }}>Back to results</a>;
}
