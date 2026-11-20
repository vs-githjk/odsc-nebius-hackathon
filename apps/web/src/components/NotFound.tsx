import type { ReactNode } from "react";

// A page for an address the app doesn't know: say what was asked for and give a way back (#257 item 9).
export function NotFound({ title, children, back }: { title: string; children: ReactNode; back?: { label: string; href: string } }) {
  return (
    <main className="lp not-found">
      <section className="lp-hero hw-head">
        <div className="wrap">
          <h1 tabIndex={-1} className="lp-title hw-title" role="alert">{title}</h1>
          <div className="lead lp-lead nf-detail">{children}</div>
          <p className="nf-ways">
            {back && <a className="btn" href={back.href}>{back.label}</a>}
            <a className={back ? "btn secondary" : "btn"} href="#/">Go to the start page</a>
            {back?.href !== "#/traces" && <a href="#/traces">Browse recorded traces</a>}
          </p>
        </div>
      </section>
    </main>
  );
}

// The address as typed, short enough to show and safe to read back.
export function shownAddress(hash: string): string {
  let text = hash;
  try { text = decodeURIComponent(hash); } catch { /* keep it as typed */ }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
