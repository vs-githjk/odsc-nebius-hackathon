import { useEffect, useState } from "react";
import { copyText } from "../model/copyLink.ts";

// Copies the trace's own address (the hash route), so a trace can be shared as a link (#259).
export function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <button type="button" className="copy-link" onClick={() => {
      void copyText(window.location.href).then(ok => setState(ok ? "copied" : "failed"));
    }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
      <span aria-live="polite">{state === "copied" ? "Link copied" : state === "failed" ? "Copy failed, use the address bar" : "Copy link"}</span>
    </button>
  );
}
