// Clipboard with a fallback for browsers or frames where the async clipboard is missing or refused.
export async function copyText(text: string, nav: Pick<Navigator, "clipboard"> | undefined = typeof navigator !== "undefined" ? navigator : undefined,
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined): Promise<boolean> {
  try {
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; }
  } catch { /* fall through to the textarea copy */ }
  if (!doc) return false;
  try {
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
