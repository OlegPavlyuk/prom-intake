/**
 * Provision ONE local Medplum project that carries everything the full local
 * app run needs: a known human login (for the coordinator `SignInForm`) AND
 * client credentials (for `medplum:seed`, `medplum:deploy-bots`, and the
 * integration harness). It writes both `.env` (client creds) and
 * `.dev-user.json` (login), so the coordinator, the Bots, and the seeded PHQ-9
 * all live in the same project - the coordinator sees the data it assigns and
 * the Flags the Scoring Bot raises.
 *
 * This is the single-project counterpart to the two narrower scripts:
 *   - `provision-medplum.ts` mints client creds only (integration harness), and
 *   - `register-dev-user.ts` registers a human login only (verifier-ui),
 * each in its OWN project. Neither alone backs the end-to-end workflow; this
 * one does. (#43)
 *
 * Idempotent: if a previous run's `.env` client credentials still authenticate
 * against the live server, the project is reused as-is; if the server was wiped
 * (`docker compose down -v`), a fresh unified project is provisioned. Pass
 * `--fresh` to force a new project.
 *
 * Usage (server already up):
 *   npm run medplum:provision-local
 *   npm run medplum:provision-local -- --fresh
 * Normally you do not run this directly - `npm run dev:full` calls it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient, MemoryStorage, resolveId } from "@medplum/core";
import type { ClientApplication } from "@medplum/fhirtypes";

// MedplumClient's PKCE register/login flow expects a browser `sessionStorage`;
// back it with in-memory storage in Node so the code verifier round-trips. The
// "window is not defined" notice it may print is a benign fallback to a plain
// code challenge and is fine for local dev (mirrors the sibling scripts).
const globalWithStorage = globalThis as typeof globalThis & {
  sessionStorage?: Storage;
};
globalWithStorage.sessionStorage ??= new MemoryStorage() as unknown as Storage;

const ENV_PATH = resolve(process.cwd(), ".env");
const DEV_USER_PATH = resolve(process.cwd(), ".dev-user.json");

/** The credentials + URLs a full local run needs, returned to the orchestrator. */
export interface LocalEnv {
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
 * Provision (or reuse) the unified local project. Safe to call repeatedly; the
 * heavy registration only happens when there is no live project to reuse.
 */
export async function provisionLocal(
  options: { readonly fresh?: boolean } = {}
): Promise<LocalEnv> {
  const baseUrl = process.env.MEDPLUM_BASE_URL ?? "http://localhost:8103/";

  if (!options.fresh) {
    const reused = await reuseIfLive(baseUrl);
    if (reused) {
      return { ...reused, created: false };
    }
  }

  const created = await provisionFresh(baseUrl);
  return { ...created, created: true };
}

/**
 * Reuse a prior run's project when its `.env` client credentials still log in
 * against the live server (the project survived) and `.dev-user.json` is
 * present. Any failure (files missing, server wiped, creds rejected) returns
 * `null`, i.e. "provision fresh".
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
  try {
    const probe = new MedplumClient({ baseUrl });
    await probe.startClientLogin(clientId, clientSecret);
    // A live login proves the project still exists on this server.
    return devUser;
  } catch {
    return null;
  }
}

/** Register a fresh user + project, mint client creds in it, write both files. */
async function provisionFresh(baseUrl: string): Promise<DevUserFile> {
  const suffix = Date.now();
  const email =
    process.env.DEV_USER_EMAIL ?? `coordinator+${suffix}@example.com`;
  const password = process.env.DEV_USER_PASSWORD ?? `Coordinator-${suffix}!`;

  const medplum = new MedplumClient({ baseUrl });
  const newUser = await medplum.startNewUser({
    firstName: "Casey",
    lastName: "Coordinator",
    email,
    password,
    recaptchaToken: "", // dev config has no recaptcha keys -> validation skipped
  });
  const newProject = await medplum.startNewProject({
    login: newUser.login,
    projectName: `PROM Intake Local ${suffix}`,
  });
  if (!newProject.code) {
    throw new Error(
      "Project registration did not return an authorization code"
    );
  }
  await medplum.processCode(newProject.code);

  const projectId = resolveId(medplum.getActiveLogin()?.project);
  if (!projectId) {
    throw new Error("Could not resolve the new project id after registration");
  }

  // The newly-registered user is this project's admin, so it can mint a
  // ClientApplication via the admin endpoint - which also creates the client's
  // ProjectMembership + a server-minted secret (a plain FHIR create omits the
  // membership and the client-credentials login is then rejected).
  const client = (await medplum.post(`admin/projects/${projectId}/client`, {
    name: "PROM Intake Local (client credentials)",
    description:
      "Client-credentials app for seed/bots/harness in the local project (#43).",
  })) as ClientApplication;
  if (!client.id || !client.secret) {
    throw new Error("Admin client endpoint did not return an id and secret");
  }

  writeFileSync(
    ENV_PATH,
    `# Generated by scripts/provision-local.ts - local single-project full-app run.\n` +
      `# Do not commit. Regenerate with \`npm run medplum:provision-local -- --fresh\`.\n` +
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

// Standalone entry point (also usable on its own; `dev:full` imports the fn).
if (import.meta.url === `file://${process.argv[1]}`) {
  provisionLocal({ fresh: process.argv.includes("--fresh") })
    .then((env) => {
      console.log(
        env.created
          ? `\nProvisioned a fresh local project ${env.projectId}.`
          : `\nReusing the existing local project ${env.projectId}.`
      );
      console.log(`  coordinator login: ${env.email} / ${env.password}`);
      console.log(`Wrote .env and .dev-user.json (both gitignored).`);
    })
    .catch((err) => {
      console.error("\nLocal provisioning failed:", err);
      process.exit(1);
    });
}
