import { describe, expect, it } from "vitest";
import { copyText } from "./copyLink.ts";

describe("copyText", () => {
  it("uses the async clipboard when it is there", async () => {
    let copied = "";
    const ok = await copyText("https://patient-0.vercel.app/#/t/dev-10", { clipboard: { writeText: async (t: string) => { copied = t; } } as unknown as Clipboard }, undefined);
    expect(ok).toBe(true);
    expect(copied).toBe("https://patient-0.vercel.app/#/t/dev-10");
  });

  it("reports failure when the clipboard refuses and no document is available", async () => {
    const ok = await copyText("x", { clipboard: { writeText: async () => { throw new Error("denied"); } } as unknown as Clipboard }, undefined);
    expect(ok).toBe(false);
  });
});
