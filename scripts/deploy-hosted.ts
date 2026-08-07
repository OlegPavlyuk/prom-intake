/**
 * Deploy the hosted demo runtime to the GCE VM (ADR-0012, T16/T17). The CD
 * pipeline (`.github/workflows/deploy.yml`) runs exactly this script, so a
 * developer's manual deploy and an automated one are the same code path.
 *
 * End to end (safe to re-run; ends with the smoke check green):
 *   1. resolve the sslip.io hosts (env from the pipeline, else `terraform output`);
 *   2. load the hosted secrets (super-admin + demo coordinator) - Actions secrets
 *      in CI, else a gitignored local file;
 *   3. render the hardened medplum.config.json from the committed example variant;
 *   4. build the coordinator bundle with the hosted VITE_* values;
 *   5. ship compose + overlay + Caddy config + bundle to the VM over IAP and
 *      bring the stack up (Postgres + Redis + Medplum + Caddy);
 *   6. wait for Medplum health over public HTTPS (proves Let's Encrypt issued);
 *   7. **reset + re-seed the demo project** (`reset-hosted.ts`) - expunge,
 *      re-provision, seed PHQ-9, deploy the Bots, re-ship the patient bundle;
 *   8. run the HTTP smoke check as the gate.
 *
 * Step 7 is why demo data is ephemeral: every deployment starts the release from
 * the same seeded baseline (ADR-0012).
 *
 * The VM is reached only over IAP (no public SSH). Substrate coordinates default
 * to the T15 facts and are overridable via env (VM_NAME / VM_ZONE / GCP_PROJECT).
 *
 * Usage:
 *   npm run deploy:hosted
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resetHostedDemo } from "./reset-hosted.js";
import {
  applyHostsToEnv,
  applySecretsToEnv,
  buildBundle,
  loadOrGenerateSecrets,
  REMOTE_DIR,
  REPO_ROOT,
  resolveHosts,
  run,
  scp,
  shipBundle,
  sleep,
  ssh,
  tarCreate,
  type Hosts,
  type Secrets,
} from "./hosted-demo.js";

const STAGING_DIR = resolve(REPO_ROOT, "infra/gcp/.deploy");
const CONFIG_EXAMPLE = resolve(
  REPO_ROOT,
  "infra/medplum/medplum.config.hosted.example.json"
);
const COMPOSE_BASE = resolve(REPO_ROOT, "infra/medplum/docker-compose.yml");
const COMPOSE_OVERLAY = resolve(
  REPO_ROOT,
  "infra/medplum/docker-compose.hosted.yml"
);
const CADDYFILE = resolve(REPO_ROOT, "infra/caddy/Caddyfile");

async function main(): Promise<void> {
  const hosts = resolveHosts();
  const apiBase = `https://${hosts.apiHost}/`;
  console.log(
    `[deploy] target: ${hosts.coordinatorHost} / ${hosts.patientHost} / ${hosts.apiHost}`
  );

  const secrets = loadOrGenerateSecrets();
  applyHostsToEnv(hosts);
  applySecretsToEnv(secrets, apiBase);

  console.log(
    "[deploy] 1/5 Staging compose + Caddyfile + hardened config, building coordinator bundle..."
  );
  stageDeployDir(hosts, secrets);
  buildBundle("coordinator", {
    VITE_MEDPLUM_BASE_URL: apiBase,
    VITE_PATIENT_APP_BASE_URL: `https://${hosts.patientHost}/`,
  });

  console.log(
    "[deploy] 2/5 Shipping to the VM over IAP and bringing the stack up..."
  );
  shipConfig();
  shipBundle("coordinator", resolve(REPO_ROOT, "src/apps/coordinator/dist"));
  composeUp();

  console.log(
    "[deploy] 3/5 Waiting for Medplum health over HTTPS (Let's Encrypt issuance)..."
  );
  await waitForHealth(apiBase);

  console.log(
    "[deploy] 4/5 Resetting + re-seeding the demo project (reset-on-deploy)..."
  );
  const { env, webhookPath } = await resetHostedDemo(hosts);

  console.log("[deploy] 5/5 Smoke-checking over public HTTPS...");
  process.env.WEBHOOK_PATH = webhookPath;
  run("npm", ["run", "smoke:hosted"], "Smoke check");

  console.log("\n[deploy] Done. The demo is live:");
  console.log(`  Coordinator: https://${hosts.coordinatorHost}/`);
  console.log(`  Patient:     https://${hosts.patientHost}/`);
  console.log(`  Medplum API: https://${hosts.apiHost}/`);
  // Never print the password - this script also runs in GitHub Actions, where
  // stdout is captured. Point at wherever the password actually is for this run;
  // on a runner there is no local secrets file. T18 publishes the login.
  const passwordLocation = process.env.CI
    ? "the DEMO_COORDINATOR_PASSWORD Actions secret"
    : "infra/gcp/.deploy-secrets.json";
  console.log(
    `  Coordinator login: ${env.email} (password in ${passwordLocation})`
  );
}

// --- Staging + config rendering ---------------------------------------------

function stageDeployDir(hosts: Hosts, secrets: Secrets): void {
  rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });

  cp(COMPOSE_BASE, resolve(STAGING_DIR, "docker-compose.yml"));
  cp(COMPOSE_OVERLAY, resolve(STAGING_DIR, "docker-compose.hosted.yml"));
  cp(CADDYFILE, resolve(STAGING_DIR, "Caddyfile"));
  writeFileSync(
    resolve(STAGING_DIR, "medplum.config.json"),
    renderConfig(hosts, secrets)
  );
  // Non-secret host vars for compose interpolation (docker-compose.hosted.yml).
  writeFileSync(
    resolve(STAGING_DIR, ".env"),
    `COORDINATOR_HOST=${hosts.coordinatorHost}\n` +
      `PATIENT_HOST=${hosts.patientHost}\n` +
      `API_HOST=${hosts.apiHost}\n`,
    { encoding: "utf8" }
  );
}

/** Render the hardened config from the committed example: drop the doc comment, substitute placeholders. */
function renderConfig(hosts: Hosts, secrets: Secrets): string {
  const config = JSON.parse(readFileSync(CONFIG_EXAMPLE, "utf8")) as Record<
    string,
    unknown
  >;
  delete config._comment;
  const subst = (v: unknown): unknown =>
    typeof v === "string"
      ? v
          .replaceAll("__API_HOST__", hosts.apiHost)
          .replaceAll("__APP_HOST__", hosts.coordinatorHost)
          .replaceAll("__PATIENT_HOST__", hosts.patientHost)
          .replaceAll("__SUPER_ADMIN_EMAIL__", secrets.superAdminEmail)
          .replaceAll("__SUPER_ADMIN_PASSWORD__", secrets.superAdminPassword)
      : v;
  for (const [key, value] of Object.entries(config)) {
    config[key] = subst(value);
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

// --- VM interaction (IAP) ---------------------------------------------------

/** Ship the config files (compose, overlay, Caddyfile, medplum.config.json, .env). */
function shipConfig(): void {
  const tarball = resolve(REPO_ROOT, "infra/gcp/.deploy.tgz");
  tarCreate(STAGING_DIR, tarball);
  scp(tarball, `~/deploy.tgz`);
  rmSync(tarball, { force: true });
  // Create both bundle dirs as the login user BEFORE compose up, so Docker does
  // not create them as root-owned dirs the later bundle ships can't write. The
  // dirs themselves are Caddy's live bind-mount sources - shipBundle only ever
  // replaces their CONTENTS, never the dirs, so a running Caddy keeps a valid
  // mount across redeploys.
  ssh(
    `mkdir -p ~/${REMOTE_DIR}/coordinator ~/${REMOTE_DIR}/patient && ` +
      `tar xzf ~/deploy.tgz -C ~/${REMOTE_DIR} && rm ~/deploy.tgz`
  );
}

function composeUp(): void {
  ssh(
    `cd ~/${REMOTE_DIR} && sudo docker compose -f docker-compose.yml -f docker-compose.hosted.yml up -d --wait`
  );
}

// --- Health wait ------------------------------------------------------------

async function waitForHealth(apiBase: string): Promise<void> {
  const deadline = Date.now() + 240_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiBase}healthcheck`);
      if (res.ok) {
        console.log("[deploy]     Medplum is healthy over HTTPS.");
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(5_000);
  }
  throw new Error(
    `Medplum did not become healthy over HTTPS within 240s (last: ${lastError})`
  );
}

// --- Small helpers ----------------------------------------------------------

function cp(from: string, to: string): void {
  writeFileSync(to, readFileSync(from));
}

main().catch((err: unknown) => {
  console.error("\n[deploy] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
