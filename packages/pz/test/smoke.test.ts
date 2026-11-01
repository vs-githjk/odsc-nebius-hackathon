import { expect, it } from "vitest";
import { PZ_VERSION } from "../src/index.ts";

it("exports the workspace version", () => {
  expect(PZ_VERSION).toBe("0.1.0");
});
