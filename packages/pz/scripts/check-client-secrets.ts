import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
const outDir = await mkdtemp(join(tmpdir(), "pz-client-"));
const forbidden = ["NEBIUS_API_KEY", "TAVILY_API_KEY", "api.tavily.com", "tokenfactory.nebius.com", "Bearer"];
try {
  for (const replayOnly of [false, true]) {
    await build({ root: resolve("apps/web"), configFile: resolve("apps/web/vite.config.ts"),
      base: replayOnly ? "/patient-zero/" : "/", define: { __PZ_REPLAY_ONLY__: JSON.stringify(replayOnly) },
      build: { outDir, emptyOutDir: true }, logLevel: "error" });
    const denied = replayOnly ? [...forbidden, "/api/trace", "/api/status"] : forbidden;
    for (const file of await readdir(outDir, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const content = await readFile(join(file.parentPath, file.name));
      if (denied.some(value => content.includes(value))) throw new Error("Client secret boundary check failed.");
    }
  }
  console.log("Live and Pages client boundary checks passed.");
} finally { await rm(outDir, { recursive: true, force: true }); }
