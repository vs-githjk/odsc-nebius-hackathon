import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app under /<repo>/; the Pages workflow sets PZ_PAGES_BASE. Local dev and tests use "/".
  base: process.env.PZ_PAGES_BASE ?? "/",
  // The fixtures live at the repo root, outside this app.
  server: { fs: { allow: ["../.."] } },
});
