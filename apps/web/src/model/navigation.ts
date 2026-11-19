export function backTarget(previous: string, current: string): string {
  return previous.startsWith("#/") && previous !== current ? previous : "#/";
}

export function focusHeading(root: Pick<Document, "querySelector">) {
  const heading = root.querySelector<HTMLElement>("main h1");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

export const navigation = {
  current: "",
  scroll: 0,
  positions: new Map<string, number>(),
  origins: new Map<string, string>(),
  restore: "",
};

export function arrive(hash: string, state = navigation): number | null {
  if (state.current === hash) return null;
  state.positions.set(state.current, state.scroll);
  state.origins.set(hash, backTarget(state.current, hash));
  state.current = hash;
  const top = state.restore === hash ? state.positions.get(hash) ?? 0 : 0;
  state.restore = "";
  state.scroll = top;
  return top;
}
