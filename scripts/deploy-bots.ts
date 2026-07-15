/**
 * Deploy the Access-link `publicWebhook` submit Bot to the LOCAL docker-compose
 * Medplum (ADR-0005, ADR-0009). This is the one unauthenticated entry point the
 * account-less patient page uses for both `open` (validate + render) and
 * `submit` (atomic consume). There is no Medplum-documented "tokenized link, no
 * account" pattern, so the whole pipeline is invented and lives here.
 *
 * What it does (idempotent - safe to re-run):
 *   1. bundle `src/packages/access-link/bot.ts` into one self-contained file,
 *      with a banner that maps Node's WebCrypto onto `globalThis.crypto` (the
 *      vmcontext sandbox exposes `require('node:crypto')` but not `crypto`);
 *   2. create (or reuse) the Bot + its scoped AccessPolicy in the target project,
 *      as the client-credentials app (whose home IS that project) - so both are
 *      homed alongside the tokens/assignments the Bot must reach;
 *   3. `$deploy` the bundled code;
 *   4. enable the `bots` project feature and create/attach the Bot's
 *      ProjectMembership + AccessPolicy - the two super-admin-only steps (a
 *      public Bot MUST have an AccessPolicy on its membership);
 *   5. write the webhook URL to `src/apps/patient/.env.local` for the patient app.
 *
 * Usage (after `npm run medplum:provision` + `npm run medplum:seed`, with the
 * server started with `vmContextBotsEnabled: true` - see medplum.config.json):
 *   npm run medplum:deploy-bots
 *
 * Dev-only: the two admin steps authenticate as the seeded super admin
 * (admin@example.com / medplum_admin by default; override with
 * MEDPLUM_SUPER_ADMIN_EMAIL/PASSWORD). A hosted/prod deploy would use the Medplum
 * CLI and a reviewed AccessPolicy.
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { MedplumClient, MemoryStorage, resolveId } from "@medplum/core";
import type {
  AccessPolicy,
  Bot,
  Project,
  ProjectMembership,
  Reference,
} from "@medplum/fhirtypes";
import {
  CS_TASK_CODE,
  TASK_CODE_ASSIGNMENT,
} from "../src/packages/terminology/systems.js";

// MedplumClient's password login uses a browser PKCE/`sessionStorage`. Back it
// with in-memory storage so the flow works in Node (mirrors provision-medplum).
const globalWithStorage = globalThis as typeof globalThis & {
  sessionStorage?: Storage;
};
globalWithStorage.sessionStorage ??= new MemoryStorage() as unknown as Storage;

const BOT_IDENTIFIER_SYSTEM = "https://prom-intake.example/bot";
const BOT_IDENTIFIER_VALUE = "access-link-submit";
const ACCESS_POLICY_NAME = "Access-link submit Bot (public webhook)";

// The vmcontext sandbox has `require('node:crypto')` but no global `crypto`, and
// the Access-link module hashes tokens via `globalThis.crypto.subtle` (ADR-0005,
// isomorphic for browser + Node). Bridge them at the top of the deployed bundle.
const CRYPTO_BANNER =
  "const { webcrypto } = require('node:crypto'); " +
  "if (!globalThis.crypto) globalThis.crypto = webcrypto;";

// esbuild's CJS wrapper reassigns `module.exports` to a fresh object, but the
// vmcontext runner reads `handler` off the original `exports`. Copy it across so
// `exports.handler` resolves to the bundled function.
const HANDLER_FOOTER =
  "if (typeof module !== 'undefined' && module.exports && module.exports.handler) " +
  "exports.handler = module.exports.handler;";

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
  const baseUrl = process.env.MEDPLUM_BASE_URL ?? "http://localhost:8103/";

  const code = await bundleBot();
  console.log(`Bundled Bot code (${code.length} bytes).`);

  // The client-credentials app lives in the target project; create the Bot +
  // AccessPolicy through it so they are homed there (a Bot created via the admin
  // endpoint lands in the caller's project, which for super admin is the wrong
  // one). Only feature-enable + membership need super admin.
  const app = new MedplumClient({ baseUrl });
  await app.startClientLogin(
    requireEnv("MEDPLUM_CLIENT_ID"),
    requireEnv("MEDPLUM_CLIENT_SECRET")
  );
  const projectRef = app.getActiveLogin()?.project;
  const projectId = resolveId(projectRef);
  if (!projectRef || !projectId) {
    throw new Error("Could not resolve the target project from .env creds");
  }

  const policy = await ensureAccessPolicy(app);
  const bot = await ensureBot(app, code);
  console.log(`Bot ${bot.id} ready and deployed (vmcontext, publicWebhook).`);

  const admin = await superAdminLogin(baseUrl);
  await enableBotsFeature(admin, projectId);
  const membership = await ensureBotMembership(admin, bot, policy, projectRef);
  console.log(`AccessPolicy attached to membership ${membership.id}.`);

  // A same-origin RELATIVE path: Medplum sends no CORS headers on `/webhook`, so
  // the patient app calls it same-origin and the dev server (or a prod reverse
  // proxy) routes `/webhook` to Medplum. See src/apps/patient/vite.config.ts.
  const webhookPath = `/webhook/${membership.id}`;
  writePatientEnv(baseUrl, webhookPath);
  console.log(`\nWebhook path (same-origin): ${webhookPath}`);
  console.log(
    "Wrote VITE_ACCESS_LINK_WEBHOOK_URL to src/apps/patient/.env.local"
  );
}

/** Bundle bot.ts to a single CommonJS file exporting `handler` (vmcontext shape). */
async function bundleBot(): Promise<string> {
  const result = await build({
    entryPoints: [resolve("src/packages/access-link/bot.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    banner: { js: CRYPTO_BANNER },
    footer: { js: HANDLER_FOOTER },
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0]!.text;
}

/** Create or reuse the submit Bot (vmcontext + publicWebhook), then `$deploy`. */
async function ensureBot(app: MedplumClient, code: string): Promise<Bot> {
  const existing = await app.searchOne("Bot", {
    identifier: `${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE}`,
  });
  const base =
    existing ??
    (await app.createResource<Bot>({
      resourceType: "Bot",
      name: "Access-link submit Bot",
      description:
        "publicWebhook Bot: open + submit for the account-less patient page (#17, ADR-0005).",
    } as Bot));

  const bot = await app.updateResource({
    ...base,
    identifier: [
      { system: BOT_IDENTIFIER_SYSTEM, value: BOT_IDENTIFIER_VALUE },
    ],
    runtimeVersion: "vmcontext",
    publicWebhook: true,
  } as Bot);

  await app.post(`fhir/R4/Bot/${bot.id}/$deploy`, { code });
  return bot;
}

/**
 * The narrowly scoped AccessPolicy for the public submit Bot (NFR-5, ADR-0005).
 * A leaked link's net capability: create ONE QuestionnaireResponse, burn its own
 * token, and complete the bound Assignment - and read NO patient data. The
 * QuestionnaireResponse is create-only (no read/search), so answers cannot be
 * harvested; Task writes are restricted to assignment Tasks (never Flags); and
 * there is no Patient/Observation access at all.
 *
 * `Basic` is intentionally NOT criteria-scoped, unlike `Task`: the Bot reads two
 * `Basic` types (its token + the InstrumentConfig for the completeness re-check)
 * and their discriminating codes are private to the access-link / instrument
 * modules, so scoping here would either leak those private codes into this script
 * or need two overlapping criteria. `Basic` holds only non-PHI reference/token
 * data (token records store a hash, never the raw token), so a broad read/update
 * is an accepted, defence-in-depth-only gap - the real per-Assignment scoping is
 * the token binding enforced in the Bot's code, and the public surface is just
 * `{ operation, token, answers }`, not arbitrary FHIR.
 */
async function ensureAccessPolicy(app: MedplumClient): Promise<AccessPolicy> {
  const resource: AccessPolicy["resource"] = [
    { resourceType: "QuestionnaireResponse", interaction: ["create"] },
    { resourceType: "Questionnaire", interaction: ["read", "search"] },
    // See the docstring: non-PHI reference/token data; not criteria-scoped.
    { resourceType: "Basic", interaction: ["read", "search", "update"] },
    {
      resourceType: "Task",
      criteria: `Task?code=${CS_TASK_CODE}|${TASK_CODE_ASSIGNMENT}`,
      interaction: ["read", "search", "update"],
    },
  ];
  const existing = await app.searchOne("AccessPolicy", {
    name: ACCESS_POLICY_NAME,
  });
  if (existing) {
    return app.updateResource({ ...existing, resource });
  }
  return app.createResource({
    resourceType: "AccessPolicy",
    name: ACCESS_POLICY_NAME,
    resource,
  });
}

/** Enable the `bots` project feature (required for vmcontext Bots; super admin). */
async function enableBotsFeature(
  admin: MedplumClient,
  projectId: string
): Promise<void> {
  const project = (await admin.readResource("Project", projectId)) as Project;
  const features = new Set(project.features ?? []);
  if (features.has("bots")) {
    return;
  }
  features.add("bots");
  await admin.updateResource({
    ...project,
    features: [...features] as Project["features"],
  });
  console.log("Enabled the `bots` project feature.");
}

/**
 * Create or reuse the Bot's ProjectMembership in the target project and attach
 * the AccessPolicy (a public Bot must have one). The client-credentials app
 * cannot create memberships, so this is a super-admin step; the membership id is
 * the public webhook path (`/webhook/{id}`).
 */
async function ensureBotMembership(
  admin: MedplumClient,
  bot: Bot,
  policy: AccessPolicy,
  projectRef: Reference<Project>
): Promise<ProjectMembership> {
  const accessPolicy: Reference<AccessPolicy> = {
    reference: `AccessPolicy/${policy.id}`,
  };
  const botRef = { reference: `Bot/${bot.id}` };
  const existing = await admin.searchOne("ProjectMembership", {
    profile: `Bot/${bot.id}`,
  });
  if (existing) {
    return admin.updateResource({ ...existing, accessPolicy });
  }
  return admin.createResource({
    resourceType: "ProjectMembership",
    project: projectRef,
    user: botRef as ProjectMembership["user"],
    profile: botRef,
    accessPolicy,
  });
}

async function superAdminLogin(baseUrl: string): Promise<MedplumClient> {
  const admin = new MedplumClient({ baseUrl });
  const email = process.env.MEDPLUM_SUPER_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.MEDPLUM_SUPER_ADMIN_PASSWORD ?? "medplum_admin";
  const login = await admin.startLogin({ email, password });
  if (!login?.code) {
    throw new Error("Super-admin login did not return an authorization code");
  }
  await admin.processCode(login.code);
  return admin;
}

function writePatientEnv(baseUrl: string, webhookPath: string): void {
  writeFileSync(
    resolve("src/apps/patient/.env.local"),
    `# Generated by scripts/deploy-bots.ts - local Medplum. Do not commit.\n` +
      `VITE_MEDPLUM_BASE_URL=${baseUrl}\n` +
      `VITE_ACCESS_LINK_WEBHOOK_URL=${webhookPath}\n`,
    { encoding: "utf8" }
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} (run medplum:provision)`);
  }
  return value;
}

main().catch((err) => {
  console.error("\nBot deploy failed:", err);
  process.exit(1);
});
