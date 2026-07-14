import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Coordinator app: its own Vite bundle (ADR-0010 A2 - the two apps are separate,
// credential-isolated builds). `root` is pinned to this directory (not the cwd)
// so `index.html` and env files resolve here even when Vite is launched with
// `--config` from the repo root. `VITE_MEDPLUM_BASE_URL` is a non-secret
// build/runtime var (see infrastructure.md); the patient-app base URL used to
// assemble Access links arrives with the assign UI (#29), not this foundation.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { port: 3000 },
  build: { outDir: "dist" },
});
