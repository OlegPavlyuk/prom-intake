import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Patient completion page: its own Vite bundle (ADR-0010 A2 - the two apps are
// separate, credential-isolated builds). `root` is pinned to this directory
// (not the cwd) so `index.html` and env files resolve here even when Vite is
// launched with `--config` from the repo root. Port 3001 matches
// `VITE_PATIENT_APP_BASE_URL`'s default in the Coordinator app.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { port: 3001 },
  build: { outDir: "dist" },
});
