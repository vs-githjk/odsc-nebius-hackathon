import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The fixtures live at the repo root, outside this app.
  server: { fs: { allow: ["../.."] } },
});
