/**
 * Shared vocabulary for the hosted GCP demo (ADR-0012): where the demo lives,
 * which credentials open it, how a bundle is built, and how bytes reach the VM.
 *
 * `deploy-hosted.ts` (full deploy), `reset-hosted.ts` (reset + re-seed) and
 * `smoke-hosted.ts` (the gate) all speak it, so the T17 pipeline orchestrates
 * one implementation instead of three.
 *
 * Everything here is **env-first**: GitHub Actions supplies hosts and secrets
 * from repo variables/secrets, while a developer's machine falls back to
 * `terraform output` and a gitignored local secrets file.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

/** The demo VM, as `gcloud` addresses it. Overridable for a second environment. */
export const VM_NAME = process.env.VM_NAME ?? "prom-intake-demo";
export const VM_ZONE = process.env.VM_ZONE ?? "europe-west1-b";
export const GCP_PROJECT = process.env.GCP_PROJECT ?? "prom-intake-demo";

/** The deploy dir under the OS Login user's home on the VM. */
export const REMOTE_DIR = "prom-intake";

export const REPO_ROOT = process.cwd();
export const SECRETS_PATH = resolve(
  REPO_ROOT,
  "infra/gcp/.deploy-secrets.json"
);

/** The three origin-isolated hosts (ADR-0010) the demo is served on. */
export interface Hosts {
  readonly apiHost: string;
  readonly coordinatorHost: string;
  readonly patientHost: string;
}

/** The Medplum logins the demo is bootstrapped and published with. */
export interface Secrets {
  readonly superAdminEmail: string;
  readonly superAdminPassword: string;
  readonly coordinatorEmail: string;
  readonly coordinatorPassword: string;
}

// --- Hosts ------------------------------------------------------------------

/**
 * Hosts from `API_HOST`/`COORDINATOR_HOST`/`PATIENT_HOST` when all three are
 * set (the pipeline derives them from the VM's reserved IP), else from
 * `terraform -chdir=infra/gcp output` (a developer machine with the state
 * bucket). Terraform is the definition of these names; this is the read side.
 */
export function resolveHosts(): Hosts {
  const fromEnv = {
    apiHost: process.env.API_HOST,
    coordinatorHost: process.env.COORDINATOR_HOST,
    patientHost: process.env.PATIENT_HOST,
  };
  if (fromEnv.apiHost && fromEnv.coordinatorHost && fromEnv.patientHost) {
    return fromEnv as Hosts;
  }
  const raw = execFileSync(
    "terraform",
    ["-chdir=infra/gcp", "output", "-json"],
    { encoding: "utf8" }
  );
  const out = JSON.parse(raw) as Record<string, { value: string } | undefined>;
  const hosts = {
    apiHost: out.api_host?.value,
    coordinatorHost: out.coordinator_host?.value,
    patientHost: out.patient_host?.value,
  };
  if (!hosts.apiHost || !hosts.coordinatorHost || !hosts.patientHost) {
    throw new Error(
      "set API_HOST/COORDINATOR_HOST/PATIENT_HOST or apply the terraform substrate"
    );
  }
  return hosts as Hosts;
}

/** Publish the resolved hosts to the environment child scripts inherit. */
export function exportHosts(hosts: Hosts): void {
  process.env.API_HOST = hosts.apiHost;
  process.env.COORDINATOR_HOST = hosts.coordinatorHost;
  process.env.PATIENT_HOST = hosts.patientHost;
}

// --- Secrets ----------------------------------------------------------------

/**
 * Secrets precedence: a full env override (the pipeline's Actions secrets) wins;
 * otherwise a gitignored local file is generated once and reused, so the
 * super-admin password stays consistent with what the server seeded on first
 * boot (the `defaultSuperAdmin*` config only applies to an empty database).
 */
export function loadOrGenerateSecrets(): Secrets {
  const fromEnv = envSecrets();
  if (fromEnv) {
    return fromEnv;
  }
  // On a runner there is no local file to fall back to and generating one would
  // silently invent a super-admin password the server has never seen - the
  // failure would then surface as an inscrutable login error several steps
  // later. Say what is actually missing instead.
  if (process.env.CI) {
    throw new Error(
      "Missing Actions secrets: MEDPLUM_SUPER_ADMIN_EMAIL/PASSWORD and " +
        "DEMO_COORDINATOR_EMAIL/PASSWORD must all be set (see docs/architecture/cicd.md)"
    );
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
    `[hosted]     generated ${SECRETS_PATH} (gitignored - the source of truth for demo creds).`
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

/** Publish the secrets to the environment provisioning + bots inherit. */
export function exportSecrets(secrets: Secrets, apiBase: string): void {
  process.env.MEDPLUM_BASE_URL = apiBase;
  process.env.MEDPLUM_SUPER_ADMIN_EMAIL = secrets.superAdminEmail;
  process.env.MEDPLUM_SUPER_ADMIN_PASSWORD = secrets.superAdminPassword;
  process.env.DEMO_COORDINATOR_EMAIL = secrets.coordinatorEmail;
  process.env.DEMO_COORDINATOR_PASSWORD = secrets.coordinatorPassword;
}

/** A URL-safe, high-entropy secret that comfortably clears Medplum's policy. */
function strongSecret(): string {
  return randomBytes(24).toString("base64url");
}

// --- Bundles ----------------------------------------------------------------

/** Build one app's static bundle with hosted VITE_* values, then clean the env file. */
export function buildBundle(
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
    `# Generated by the hosted deploy scripts (transient). Do not commit.\n${body}\n`
  );
  try {
    run("npm", ["run", `build:${app}`], `Build ${app}`);
  } finally {
    rmSync(envFile, { force: true });
  }
}

/** The webhook path `medplum:deploy-bots` wrote to the patient app's .env.local. */
export function readWebhookPath(): string {
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

/**
 * Replace a bundle dir's CONTENTS in place. Caddy bind-mounts these dirs, and a
 * bind mount tracks the dir inode - deleting and recreating the dir would orphan
 * a running Caddy's mount (it would serve an empty, deleted inode). So clear the
 * contents (`find -delete`, dotfiles included) and extract into the same dir; the
 * live mount then reflects the new bundle with no container restart.
 */
export function shipBundle(app: string, distDir: string): void {
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
export function tarCreate(dir: string, tarball: string): void {
  execFileSync("tar", ["czf", tarball, "-C", dir, "."], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
}

export function scp(local: string, remote: string): void {
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

export function ssh(command: string): void {
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

// --- Small helpers ----------------------------------------------------------

export function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error)
    throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
}

/** Read a single `KEY=value` from a dotenv-style file without a parser dep. */
export function readEnvValue(path: string, key: string): string | null {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
