export type Theme = "light" | "dark";
export const THEME_KEY = "pz-theme";

const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

export function savedTheme(storage: Pick<Storage, "getItem"> | null = safeStorage()): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage; the toggle still works for this visit.
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}

// The theme on screen: an explicit pick on <html>, else the system setting.
export function effectiveTheme(root: HTMLElement = document.documentElement): Theme {
  const explicit = root.dataset.theme;
  if (isTheme(explicit)) return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
