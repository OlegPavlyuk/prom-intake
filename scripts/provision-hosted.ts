/**
 * Provision (or reuse) the demo project on the HOSTED Medplum (ADR-0012, T16).
 *
 * The hosted server runs with `registerEnabled: false`, so the open-registration
 * flow that `provision-local.ts` uses (`startNewUser` -> `startNewProject`) is
 * rejected by design - a public demo must not let anyone create projects. This
 * is the one place hosted use genuinely differs, so provisioning goes through the
 * generated **super admin** instead (the account seeded by `defaultSuperAdmin*`
 * in the hosted medplum.config.json):
 *
 *   1. super-admin login;
 *   2. find-or-create the demo `Project`;
 *   3. invite the demo coordinator as a project admin with a KNOWN password and
 *      `sendEmail: false` (headless - no SMTP on the demo box), `upsert: true`
 *      (idempotent);
 *   4. create a `ClientApplication` in that project (client-credentials for
 *      `medplum:seed` / `medplum:deploy-bots` / the harness).
 *
 * It writes the same two files the local flow produces, so `medplum:seed` and
 * `medplum:deploy-bots` run unchanged afterwards:
 *   - `.env`         (MEDPLUM_BASE_URL + client credentials)
 *   - `.dev-user.json` ({ baseUrl, email, password, projectId } - the coordinator
 *                       login `verifier-ui` and the T18 README demo account use)
 *
 * Idempotent: if a prior run's `.env` client credentials still authenticate
 * against the live hosted server, the project is reused as-is; only a wiped
 * server (fresh deploy volume) triggers a fresh super-admin provision.
 *
 * Required env (supplied by `scripts/deploy-hosted.ts` from its secrets file):
 *   MEDPLUM_BASE_URL              hosted api. base URL
 *   MEDPLUM_SUPER_ADMIN_EMAIL     generated super-admin login
 *   MEDPLUM_SUPER_ADMIN_PASSWORD
 *   DEMO_COORDINATOR_EMAIL        generated demo coordinator login
 *   DEMO_COORDINATOR_PASSWORD
 *   PROJECT_NAME                  optional; defaults to "PROM Intake Demo"
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient, MemoryStorage } from "@medplum/core";
import type {
  ClientApplication,
  Project,
  ProjectMembership,
} from "@medplum/fhirtypes";

// MedplumClient's password login uses a browser PKCE/`sessionStorage`. Back it
// with in-memory storage so the flow works in Node (mirrors the sibling scripts).
const globalWithStorage = globalThis as typeof globalThis & {
  sessionStorage?: Storage;
};
globalWithStorage.sessionStorage ??= new MemoryStorage() as unknown as Storage;

const ENV_PATH = resolve(process.cwd(), ".env");
const DEV_USER_PATH = resolve(process.cwd(), ".dev-user.json");
const DEFAULT_PROJECT_NAME = "PROM Intake Demo";

/** The demo project's exact name - the handle both provisioning and reset use. */
export function demoProjectName(): string {
  return process.env.PROJECT_NAME ?? DEFAULT_PROJECT_NAME;
}

/** The credentials + URLs the hosted run needs, returned to the orchestrator. */
export interface HostedEnv {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
  readonly projectId: string;
  /** True when a fresh project was created, false when an existing one was reused. */
  readonly created: boolean;
}

interface DevUserFile {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
  readonly projectId: string;
}

/**
 * Provision (or reuse) the hosted demo project. Safe to call repeatedly; the
 * super-admin provisioning only runs when there is no live project to reuse.
 */
export async function provisionHosted(): Promise<HostedEnv> {
  const baseUrl = requireEnv("MEDPLUM_BASE_URL");

  const reused = await reuseIfLive(baseUrl);
  if (reused) {
    return { ...reused, created: false };
  }

  const created = await provisionFresh(baseUrl);
  return { ...created, created: true };
}

/**
 * Reuse a prior run's project when its `.env` client credentials still log in
 * against the live hosted server (the project survived this deploy) and
 * `.dev-user.json` is present. Any failure (files missing, server wiped, creds
 * rejected, or creds pointing at a different server) returns `null` = "provision
 * fresh".
 */
async function reuseIfLive(baseUrl: string): Promise<DevUserFile | null> {
  if (!existsSync(ENV_PATH) || !existsSync(DEV_USER_PATH)) {
    return null;
  }
  const clientId = readEnvValue(ENV_PATH, "MEDPLUM_CLIENT_ID");
  const clientSecret = readEnvValue(ENV_PATH, "MEDPLUM_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return null;
  }
  let devUser: DevUserFile;
  try {
    devUser = JSON.parse(readFileSync(DEV_USER_PATH, "utf8")) as DevUserFile;
  } catch {
    return null;
  }
  // The stored creds must belong to THIS hosted server, not a leftover local
  // project - probe against the current baseUrl, and only reuse if it matches.
  if (devUser.baseUrl !== baseUrl) {
    return null;
  }
  try {
    const probe = new MedplumClient({ baseUrl });
    await probe.startClientLogin(clientId, clientSecret);
    return devUser;
  } catch {
    return null;
  }
}

/** Super-admin path: create/find the project, invite the coordinator, mint a client. */
async function provisionFresh(baseUrl: string): Promise<DevUserFile> {
  const projectName = demoProjectName();
  const email = requireEnv("DEMO_COORDINATOR_EMAIL");
  const password = requireEnv("DEMO_COORDINATOR_PASSWORD");

  const admin = await superAdminLogin(baseUrl);

  const project = await ensureProject(admin, projectName);
  const projectId = project.id;
  if (!projectId) {
    throw new Error("Created project has no id");
  }

  // Invite the coordinator as a project admin with a known password. `sendEmail:
  // false` keeps it headless (no SMTP on the demo box); `upsert` makes re-runs
  // against a surviving project idempotent.
  const membership = (await admin.invite(projectId, {
    resourceType: "Practitioner",
    firstName: "Demo",
    lastName: "Coordinator",
    email,
    password,
    sendEmail: false,
    upsert: true,
    membership: { admin: true },
  })) as ProjectMembership;
  console.log(`Coordinator invited (membership ${membership.id}, admin).`);

  // Mint client credentials in the project via the admin endpoint (this also
  // creates the client's ProjectMembership - a plain FHIR create would omit it
  // and the client-credentials login would fail). Super admin may create clients
  // in any project.
  const client = (await admin.post(`admin/projects/${projectId}/client`, {
    name: "PROM Intake Demo (client credentials)",
    description:
      "Client-credentials app for seed/bots/harness on the hosted demo (#58).",
  })) as ClientApplication;
  if (!client.id || !client.secret) {
    throw new Error("Admin client endpoint did not return an id and secret");
  }

  writeFileSync(
    ENV_PATH,
    `# Generated by scripts/provision-hosted.ts - hosted GCP demo project.\n` +
      `# Do not commit. Regenerated on a fresh deploy (wiped server volume).\n` +
      `MEDPLUM_BASE_URL=${baseUrl}\n` +
      `MEDPLUM_CLIENT_ID=${client.id}\n` +
      `MEDPLUM_CLIENT_SECRET=${client.secret}\n`,
    { encoding: "utf8" }
  );
  const devUser: DevUserFile = { baseUrl, email, password, projectId };
  writeFileSync(DEV_USER_PATH, JSON.stringify(devUser, null, 2), {
    encoding: "utf8",
  });
  return devUser;
}

/**
 * Find the demo project by exact name, or create it. Project search by `name` is
 * a contains-match, so filter to an exact hit; a fresh create returns a Project
 * the super admin can then invite into.
 */
async function ensureProject(
  admin: MedplumClient,
  name: string
): Promise<Project> {
  const candidates = await admin.searchResources("Project", { name });
  const existing = candidates.find((p) => p.name === name);
  if (existing) {
    console.log(`Reusing existing project ${existing.id} ("${name}").`);
    return existing;
  }
  const created = await admin.createResource<Project>({
    resourceType: "Project",
    name,
    description: "Public PROM-intake portfolio demo (ADR-0012).",
  });
  console.log(`Created project ${created.id} ("${name}").`);
  return created;
}

/**
 * Log in as the generated super admin (`defaultSuperAdmin*` in the hosted
 * config). Exported because the reset path (`reset-hosted.ts`) needs the same
 * identity to expunge the demo project.
 */
export async function superAdminLogin(baseUrl: string): Promise<MedplumClient> {
  const admin = new MedplumClient({ baseUrl });
  const login = await admin.startLogin({
    email: requireEnv("MEDPLUM_SUPER_ADMIN_EMAIL"),
    password: requireEnv("MEDPLUM_SUPER_ADMIN_PASSWORD"),
  });
  if (!login?.code) {
    throw new Error("Super-admin login did not return an authorization code");
  }
  await admin.processCode(login.code);
  return admin;
}

/** Read a single `KEY=value` from a dotenv-style file without a parser dep. */
function readEnvValue(path: string, key: string): string | null {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      return trimmed.slice(key.length + 1).trim();
    }
  }
  return null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

// Standalone entry point (also usable on its own; `deploy-hosted` imports the fn).
if (import.meta.url === `file://${process.argv[1]}`) {
  provisionHosted()
    .then((env) => {
      console.log(
        env.created
          ? `\nProvisioned a fresh hosted project ${env.projectId}.`
          : `\nReusing the existing hosted project ${env.projectId}.`
      );
      // Print the email only; the password is in the gitignored .dev-user.json
      // (this script's payload is reused by T17, where stdout is captured).
      console.log(
        `  coordinator login: ${env.email} (password in .dev-user.json)`
      );
      console.log(`Wrote .env and .dev-user.json (both gitignored).`);
    })
    .catch((err) => {
      console.error("\nHosted provisioning failed:", err);
      process.exit(1);
    });
}
