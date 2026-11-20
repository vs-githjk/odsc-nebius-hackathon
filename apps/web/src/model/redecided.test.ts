import { expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { REDECIDED, redecidedNote } from "./redecided.ts";

it("limits the provenance map to the reviewed recordings, independent of their current ending", () => {
  expect(Object.keys(REDECIDED).sort()).toEqual(["dev-09", "dev-10"]);
  const { traces } = loadTraces();
  for (const id of Object.keys(REDECIDED)) {
    const trace = traces.find(trace => trace.id === id)!;
    expect(trace.decision.state).toBe("ORIGIN_FOUND");
    expect(redecidedNote(trace)).toBe(REDECIDED[id]);
    expect(redecidedNote({ ...trace, decision: { ...trace.decision, state: "TRAIL_GOES_COLD", row: 6 } })).toBe(REDECIDED[id]);
  }
});
