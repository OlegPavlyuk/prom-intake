import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Patient completion page: its own Vite bundle (ADR-0010 A2 - the two apps are
// separate, credential-isolated builds). `root` is pinned to this directory
// (not the cwd) so `index.html` and env files resolve here even when Vite is
// launched with `--config` from the repo root. Port 3001 matches
// `VITE_PATIENT_APP_BASE_URL`'s default in the Coordinator app.
//
// The patient app's one server touchpoint is the Access-link `publicWebhook` Bot
// (ADR-0005). Medplum does not send CORS headers on `/webhook` (it is a
// server-to-server callback endpoint), so the app calls it **same-origin** at
// `/webhook/*` and the dev server proxies that to Medplum. Production serves the
// static bundle behind a reverse proxy that routes `/webhook` the same way (a
// deploy concern - see infrastructure.md), keeping the call same-origin there too.
export default defineConfig(({ mode }) => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, dir, "");
  const medplumBaseUrl = env.VITE_MEDPLUM_BASE_URL ?? "http://localhost:8103/";
  return {
    root: dir,
    // Per-app dep-optimizer cache - see the coordinator config: the two apps
    // share one `node_modules`, so a shared cacheDir makes the two dev servers
    // clobber each other's optimized deps (504 "Outdated Optimize Dep").
    cacheDir: fileURLToPath(new URL("node_modules/.vite", import.meta.url)),
    plugins: [react()],
    server: {
      port: 3001,
      proxy: {
        "/webhook": { target: medplumBaseUrl, changeOrigin: true },
      },
    },
    build: { outDir: "dist" },
  };
});
