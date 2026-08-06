/**
 * Scripted manual deploy of the hosted demo runtime to the GCE VM (ADR-0012,
 * T16). This is the payload T17 automates in GitHub Actions; keeping it as one
 * idempotent script means the pipeline is a thin wrapper, not a reimplementation.
 *
 * End to end (safe to re-run; ends with the smoke check green):
 *   1. read the reserved-IP sslip.io hosts from `terraform -chdir=infra/gcp output`;
 *   2. load-or-generate the hosted secrets (super-admin + demo coordinator) - env
 *      overrides for T17's Actions secrets, else a gitignored local file;
 *   3. render the hardened medplum.config.json from the committed example variant;
 *   4. build the coordinator bundle with the hosted VITE_* values;
 *   5. ship compose + overlay + Caddyfile + config + coordinator bundle to the VM
 *      over IAP and bring the stack up (Postgres + Redis + Medplum + Caddy);
 *   6. wait for Medplum health over public HTTPS (proves Let's Encrypt issued);
 *   7. provision the demo project (super-admin path, since registration is off),
 *      seed PHQ-9, deploy the Bots + Subscription - reusing the existing scripts;
 *   8. build the patient bundle with the now-known /webhook/<membership> path and
 *      ship it;
 *   9. run the HTTP smoke check.
 *
 * The VM is reached only over IAP (no public SSH). Substrate coordinates default
 * to the T15 facts and are overridable via env (VM_NAME / VM_ZONE / GCP_PROJECT).
 *
 * Usage:
 *   npm run deploy:hosted
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { provisionHosted } from "./provision-hosted.js";

const VM_NAME = process.env.VM_NAME ?? "prom-intake-demo";
const VM_ZONE = process.env.VM_ZONE ?? "europe-west1-b";
const GCP_PROJECT = process.env.GCP_PROJECT ?? "prom-intake-demo";
const REMOTE_DIR = "prom-intake"; // under the OS Login user's home

const REPO_ROOT = process.cwd();
const STAGING_DIR = resolve(REPO_ROOT, "infra/gcp/.deploy");
const SECRETS_PATH = resolve(REPO_ROOT, "infra/gcp/.deploy-secrets.json");
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

interface Hosts {
  readonly apiHost: string;
  readonly coordinatorHost: string;
  readonly patientHost: string;
}

interface Secrets {
  readonly superAdminEmail: string;
  readonly superAdminPassword: string;
  readonly coordinatorEmail: string;
  readonly coordinatorPassword: string;
}

async function main(): Promise<void> {
  const hosts = readHosts();
  const apiBase = `https://${hosts.apiHost}/`;
  console.log(
    `[deploy] target: ${hosts.coordinatorHost} / ${hosts.patientHost} / ${hosts.apiHost}`
  );

  const secrets = loadOrGenerateSecrets();

  // Super-admin creds flow to provisioning + deploy-bots via env; the hosted
  // Medplum base URL likewise. Client creds live in `.env` (provisioning writes).
  process.env.MEDPLUM_BASE_URL = apiBase;
  process.env.MEDPLUM_SUPER_ADMIN_EMAIL = secrets.superAdminEmail;
  process.env.MEDPLUM_SUPER_ADMIN_PASSWORD = secrets.superAdminPassword;
  process.env.DEMO_COORDINATOR_EMAIL = secrets.coordinatorEmail;
  process.env.DEMO_COORDINATOR_PASSWORD = secrets.coordinatorPassword;

  console.log(
    "[deploy] 1/7 Staging compose + Caddyfile + hardened config, building coordinator bundle..."
  );
  stageDeployDir(hosts, secrets);
  buildBundle("coordinator", {
    VITE_MEDPLUM_BASE_URL: apiBase,
    VITE_PATIENT_APP_BASE_URL: `https://${hosts.patientHost}/`,
  });

  console.log(
    "[deploy] 2/7 Shipping to the VM over IAP and bringing the stack up..."
  );
  shipConfig();
  shipBundle("coordinator", resolve(REPO_ROOT, "src/apps/coordinator/dist"));
  composeUp();

  console.log(
    "[deploy] 3/7 Waiting for Medplum health over HTTPS (Let's Encrypt issuance)..."
  );
  await waitForHealth(apiBase);

  console.log(
    "[deploy] 4/7 Provisioning the demo project (super-admin path)..."
  );
  const env = await provisionHosted();
  console.log(
    env.created
      ? `[deploy]     created project ${env.projectId}`
      : `[deploy]     reusing project ${env.projectId}`
  );

  console.log("[deploy] 5/7 Seeding PHQ-9 + CodeSystems...");
  run("npm", ["run", "medplum:seed"], "Seed");

  console.log(
    "[deploy] 6/7 Deploying Bots (submit + scoring) and the Subscription..."
  );
  run("npm", ["run", "medplum:deploy-bots"], "Deploy bots");
  const webhookPath = readWebhookPath();

  console.log(
    "[deploy] 7/7 Building + shipping the patient bundle, then smoke-checking..."
  );
  buildBundle("patient", {
    VITE_MEDPLUM_BASE_URL: apiBase,
    VITE_ACCESS_LINK_WEBHOOK_URL: webhookPath,
  });
  shipBundle("patient", resolve(REPO_ROOT, "src/apps/patient/dist"));

  process.env.API_HOST = hosts.apiHost;
  process.env.COORDINATOR_HOST = hosts.coordinatorHost;
  process.env.PATIENT_HOST = hosts.patientHost;
  process.env.WEBHOOK_PATH = webhookPath;
  run("npm", ["run", "smoke:hosted"], "Smoke check");

  console.log("\n[deploy] Done. The demo is live:");
  console.log(`  Coordinator: https://${hosts.coordinatorHost}/`);
  console.log(`  Patient:     https://${hosts.patientHost}/`);
  console.log(`  Medplum API: https://${hosts.apiHost}/`);
  // Never print the password - this script is the payload T17 runs in GitHub
  // Actions, where stdout is captured. It lives in the gitignored secrets file
  // (local) or the DEMO_COORDINATOR_PASSWORD secret (CI); T18 publishes the login.
  console.log(
    `  Coordinator login: ${env.email} (password in infra/gcp/.deploy-secrets.json)`
  );
}

// --- Hosts + secrets --------------------------------------------------------

function readHosts(): Hosts {
  const raw = execFileSync(
    "terraform",
    ["-chdir=infra/gcp", "output", "-json"],
    {
      encoding: "utf8",
    }
  );
  const out = JSON.parse(raw) as Record<string, { value: string }>;
  const hosts = {
    apiHost: out.api_host?.value,
    coordinatorHost: out.coordinator_host?.value,
    patientHost: out.patient_host?.value,
  };
  if (!hosts.apiHost || !hosts.coordinatorHost || !hosts.patientHost) {
    throw new Error(
      "terraform output is missing the sslip.io hosts (is the substrate applied?)"
    );
  }
  return hosts as Hosts;
}

/**
 * Secrets precedence: full env override (T17's Actions secrets) wins; otherwise
 * a gitignored local file is generated once and reused, so the super-admin
 * password stays consistent with what the server seeded on first boot (the
 * `defaultSuperAdmin*` config only applies to an empty database).
 */
function loadOrGenerateSecrets(): Secrets {
  const fromEnv = envSecrets();
  if (fromEnv) {
    return fromEnv;
  }
  if (existsSync(SECRETS_PATH)) {
    return JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as Secrets;
  }
  const secrets: Secrets = {
    superAdminEmail: "superadmin@prom-intake.demo",
    superAdminPassword: strongSecret(),
    coordinatorEmail: "coordinator@prom-intake.demo",
    coordinatorPassword: strongSecret(),
  };
  writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), {
    encoding: "utf8",
  });
  console.log(
    `[deploy]     generated ${SECRETS_PATH} (gitignored - the source of truth for demo creds).`
  );
  return secrets;
}

function envSecrets(): Secrets | null {
  const s = {
    superAdminEmail: process.env.MEDPLUM_SUPER_ADMIN_EMAIL,
    superAdminPassword: process.env.MEDPLUM_SUPER_ADMIN_PASSWORD,
    coordinatorEmail: process.env.DEMO_COORDINATOR_EMAIL,
    coordinatorPassword: process.env.DEMO_COORDINATOR_PASSWORD,
  };
  return s.superAdminEmail &&
    s.superAdminPassword &&
    s.coordinatorEmail &&
    s.coordinatorPassword
    ? (s as Secrets)
    : null;
}

/** A URL-safe, high-entropy secret that comfortably clears Medplum's policy. */
function strongSecret(): string {
  return randomBytes(24).toString("base64url");
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

// --- Bundles ----------------------------------------------------------------

/** Build one app's static bundle with hosted VITE_* values, then clean the env file. */
function buildBundle(
  app: "coordinator" | "patient",
  viteEnv: Record<string, string>
): void {
  const appDir = resolve(REPO_ROOT, "src/apps", app);
  const envFile = resolve(appDir, ".env.production.local");
  const body = Object.entries(viteEnv)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(
    envFile,
    `# Generated by scripts/deploy-hosted.ts (transient). Do not commit.\n${body}\n`
  );
  try {
    run("npm", ["run", `build:${app}`], `Build ${app}`);
  } finally {
    rmSync(envFile, { force: true });
  }
}

/** The webhook path deploy-bots wrote to the patient app's .env.local. */
function readWebhookPath(): string {
  const envLocal = resolve(REPO_ROOT, "src/apps/patient/.env.local");
  const value = existsSync(envLocal)
    ? readEnvValue(envLocal, "VITE_ACCESS_LINK_WEBHOOK_URL")
    : null;
  if (!value) {
    throw new Error(
      "Could not read VITE_ACCESS_LINK_WEBHOOK_URL after deploy-bots"
    );
  }
  return value;
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
  // replaces their CONTENTS (below), never the dirs, so a running Caddy keeps a
  // valid mount across redeploys.
  ssh(
    `mkdir -p ~/${REMOTE_DIR}/coordinator ~/${REMOTE_DIR}/patient && ` +
      `tar xzf ~/deploy.tgz -C ~/${REMOTE_DIR} && rm ~/deploy.tgz`
  );
}

/**
 * Replace a bundle dir's CONTENTS in place. Caddy bind-mounts these dirs, and a
 * bind mount tracks the dir inode - deleting and recreating the dir would orphan
 * a running Caddy's mount (it would serve an empty, deleted inode). So clear the
 * contents (`find -delete`, dotfiles included) and extract into the same dir; the
 * live mount then reflects the new bundle with no container restart.
 */
function shipBundle(app: string, distDir: string): void {
  const tarball = resolve(REPO_ROOT, `infra/gcp/.${app}.tgz`);
  tarCreate(distDir, tarball);
  scp(tarball, `~/${app}.tgz`);
  rmSync(tarball, { force: true });
  ssh(
    `mkdir -p ~/${REMOTE_DIR}/${app} && find ~/${REMOTE_DIR}/${app} -mindepth 1 -delete && ` +
      `tar xzf ~/${app}.tgz -C ~/${REMOTE_DIR}/${app} && rm ~/${app}.tgz`
  );
}

/** tar a dir's contents, without macOS AppleDouble (`._*`) sidecar files. */
function tarCreate(dir: string, tarball: string): void {
  execFileSync("tar", ["czf", tarball, "-C", dir, "."], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
}

function composeUp(): void {
  ssh(
    `cd ~/${REMOTE_DIR} && sudo docker compose -f docker-compose.yml -f docker-compose.hosted.yml up -d --wait`
  );
}

function scp(local: string, remote: string): void {
  gcloud([
    "compute",
    "scp",
    "--tunnel-through-iap",
    `--zone=${VM_ZONE}`,
    `--project=${GCP_PROJECT}`,
    "--quiet",
    local,
    `${VM_NAME}:${remote}`,
  ]);
}

function ssh(command: string): void {
  gcloud([
    "compute",
    "ssh",
    VM_NAME,
    "--tunnel-through-iap",
    `--zone=${VM_ZONE}`,
    `--project=${GCP_PROJECT}`,
    "--quiet",
    `--command=${command}`,
  ]);
}

function gcloud(args: string[]): void {
  const result = spawnSync("gcloud", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `gcloud ${args[0]} ${args[1]} failed (exit ${result.status ?? "signal"})`
    );
  }
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

function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error)
    throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
}

function cp(from: string, to: string): void {
  writeFileSync(to, readFileSync(from));
}

function readEnvValue(path: string, key: string): string | null {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("\n[deploy] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
