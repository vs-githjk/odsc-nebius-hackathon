import { describe, expect, it } from "vitest";
import { THEME_KEY, applyTheme, effectiveTheme, saveTheme, savedTheme } from "./theme.ts";

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};
const root = () => ({ dataset: {} as DOMStringMap }) as HTMLElement;

describe("theme toggle", () => {
  it("reads only a valid saved pick", () => {
    expect(savedTheme(store({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(savedTheme(store({ [THEME_KEY]: "purple" }))).toBeNull();
    expect(savedTheme(store())).toBeNull();
    expect(savedTheme(null)).toBeNull();
  });

  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(savedTheme(broken)).toBeNull();
    expect(() => saveTheme("light", broken)).not.toThrow();
  });

  it("saves and applies a pick, and an explicit pick wins over the system", () => {
    const s = store();
    saveTheme("light", s);
    expect(s.data[THEME_KEY]).toBe("light");
    const r = root();
    applyTheme("dark", r);
    expect(r.dataset.theme).toBe("dark");
    expect(effectiveTheme(r)).toBe("dark");
    applyTheme("light", r);
    expect(effectiveTheme(r)).toBe("light");
  });
});
