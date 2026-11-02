import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { QUESTIONS, Trace, questionsToJsonSchema } from "../src/schema/index.ts";

const directory = new URL("../../../schema/", import.meta.url);
mkdirSync(directory, { recursive: true });
for (const [name, document] of [["trace", z.toJSONSchema(Trace)], ["questions", questionsToJsonSchema(QUESTIONS)]] as const) {
  writeFileSync(new URL(`${name}.schema.json`, directory), JSON.stringify(document, null, 2) + "\n");
}
