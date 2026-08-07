/**
 * Reset + re-seed the public demo (ADR-0012, T17). Demo data is **ephemeral by
 * design**: every deployment wipes whatever visitors created and re-seeds the
 * baseline, so each release starts deterministic. This is that payload -
 * `deploy-hosted.ts` runs it as the second half of a deploy, and the
 * `reset-demo` workflow runs it on its own as the on-demand recovery lever.
 *
 * A reset is a **project expunge**, not a selective delete: the super admin
 * hard-deletes the whole demo `Project` compartment
 * (`POST fhir/R4/Project/<id>/$expunge?everything=true`) and provisioning then
 * rebuilds it from nothing. Nothing survives that a selective delete could miss,
 * which is what makes "exactly the seeded baseline" checkable rather than hoped
 * for - `assertSeededBaseline` checks it at the end.
 *
 * Because the project is recreated, the Access-link Bot gets a new
 * `ProjectMembership`, so the `/webhook/<membership-id>` path changes. The
 * patient bundle embeds that path at build time, so a reset necessarily rebuilds
 * and re-ships it. The coordinator bundle is host-only and is left alone.
 *
 * Required env (Actions secrets in CI, the gitignored secrets file locally -
 * see `hosted-demo.ts`): the super-admin and demo-coordinator credentials,
 * plus the three hosts or a usable `terraform output`.
 *
 * Usage:
 *   npm run reset:hosted
 */
import { resolve } from "node:path";
import { MedplumClient } from "@medplum/core";
import type { Project } from "@medplum/fhirtypes";
import {
  demoProjectName,
  provisionHosted,
  superAdminLogin,
  type HostedEnv,
} from "./provision-hosted.js";
import {
  applyHostsToEnv,
  applySecretsToEnv,
  buildBundle,
  loadOrGenerateSecrets,
  readWebhookPath,
  REPO_ROOT,
  requireEnv,
  resolveHosts,
  run,
  shipBundle,
  sleep,
  useNodeSessionStorage,
  type Hosts,
} from "./hosted-demo.js";

useNodeSessionStorage();

/** How long to wait for the expunge to take effect (it may run asynchronously). */
const EXPUNGE_TIMEOUT_MS = 120_000;

/** What a reset leaves behind, for the caller to keep deploying with. */
export interface ResetResult {
  readonly env: HostedEnv;
  /** The freshly deployed Access-link Bot's `/webhook/<membership-id>` path. */
  readonly webhookPath: string;
}

/**
 * Expunge the demo project, rebuild it from scratch, and leave the patient
 * bundle on the VM pointing at the new webhook path. Assumes the caller has
 * already exported the hosts + secrets (`deploy-hosted.ts` does; the standalone
 * entry point below does it itself).
 */
export async function resetHostedDemo(hosts: Hosts): Promise<ResetResult> {
  const apiBase = `https://${hosts.apiHost}/`;

  console.log("[reset] 1/5 Expunging the demo project (super admin)...");
  await expungeDemoProject(apiBase);

  console.log("[reset] 2/5 Provisioning a fresh demo project...");
  const env = await provisionHosted();
  console.log(`[reset]     project ${env.projectId}`);

  console.log("[reset] 3/5 Seeding PHQ-9 + CodeSystems...");
  run("npm", ["run", "medplum:seed"], "Seed");

  console.log(
    "[reset] 4/5 Deploying Bots (submit + scoring) and the Subscription..."
  );
  run("npm", ["run", "medplum:deploy-bots"], "Deploy bots");
  const webhookPath = readWebhookPath();

  console.log(
    "[reset] 5/5 Rebuilding + shipping the patient bundle, then checking the baseline..."
  );
  buildBundle("patient", {
    VITE_MEDPLUM_BASE_URL: apiBase,
    VITE_ACCESS_LINK_WEBHOOK_URL: webhookPath,
  });
  shipBundle("patient", resolve(REPO_ROOT, "src/apps/patient/dist"));
  await assertSeededBaseline(apiBase);

  return { env, webhookPath };
}

/**
 * Hard-delete every project carrying the demo's exact name, then wait until it
 * is really gone. Medplum may answer the expunge asynchronously, so the search
 * going empty - not the response code - is the proof.
 */
async function expungeDemoProject(apiBase: string): Promise<void> {
  const name = demoProjectName();
  const admin = await superAdminLogin(apiBase);

  const doomed = await projectsNamed(admin, name);
  if (doomed.length === 0) {
    console.log(`[reset]     no project named "${name}" - nothing to expunge.`);
    return;
  }

  let lastError: unknown = null;
  for (const project of doomed) {
    try {
      await admin.post(
        `fhir/R4/Project/${project.id}/$expunge?everything=true`,
        {}
      );
      console.log(`[reset]     expunged project ${project.id}.`);
    } catch (err) {
      // An async expunge can answer with something the client cannot parse.
      // Keep the error; the poll below decides whether it actually mattered.
      lastError = err;
    }
  }

  await waitForGone(admin, name, lastError);
}

/** Project search by `name` is a contains-match, so filter to exact hits. */
async function projectsNamed(
  admin: MedplumClient,
  name: string
): Promise<Project[]> {
  const candidates = await admin.searchResources("Project", { name });
  return candidates.filter((p) => p.name === name);
}

/** Poll until no project with this exact name remains. */
async function waitForGone(
  admin: MedplumClient,
  name: string,
  lastError: unknown
): Promise<void> {
  const deadline = Date.now() + EXPUNGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await projectsNamed(admin, name)).length === 0) {
      return;
    }
    await sleep(2_000);
  }
  const because =
    lastError instanceof Error ? ` (last error: ${lastError.message})` : "";
  throw new Error(
    `Project "${name}" still exists ${EXPUNGE_TIMEOUT_MS / 1000}s after $expunge${because}`
  );
}

/**
 * The reset's own gate: the fresh project holds the seeded instrument and
 * **no** demo activity. Reads through the client credentials provisioning just
 * wrote, i.e. through the same surface the apps use.
 */
async function assertSeededBaseline(apiBase: string): Promise<void> {
  const envPath = resolve(REPO_ROOT, ".env");
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
  const medplum = new MedplumClient({ baseUrl: apiBase });
  await medplum.startClientLogin(
    requireEnv("MEDPLUM_CLIENT_ID"),
    requireEnv("MEDPLUM_CLIENT_SECRET")
  );

  const questionnaires = await countOf(medplum, "Questionnaire");
  if (questionnaires === 0) {
    throw new Error("reset left no seeded Questionnaire in the demo project");
  }
  // Everything a visitor can create lives in these three types - an Assignment
  // and a Flag are both `Task`s (ADR-0001, ADR-0002). A non-zero count means the
  // expunge missed data and the release would not start deterministic.
  for (const type of ["Patient", "QuestionnaireResponse", "Task"] as const) {
    const remaining = await countOf(medplum, type);
    if (remaining !== 0) {
      throw new Error(
        `reset left ${remaining} ${type} resource(s) in the demo project`
      );
    }
  }
  console.log(
    `[reset]     baseline verified: ${questionnaires} seeded Questionnaire(s), no demo activity.`
  );
}

async function countOf(
  medplum: MedplumClient,
  resourceType: "Patient" | "QuestionnaireResponse" | "Task" | "Questionnaire"
): Promise<number> {
  const bundle = await medplum.search(resourceType, { _summary: "count" });
  if (bundle.total === undefined) {
    throw new Error(`${resourceType} count search returned no total`);
  }
  return bundle.total;
}

// Standalone entry point: the `reset-demo` workflow's whole payload.
if (import.meta.url === `file://${process.argv[1]}`) {
  const hosts = resolveHosts();
  applyHostsToEnv(hosts);
  applySecretsToEnv(loadOrGenerateSecrets(), `https://${hosts.apiHost}/`);

  resetHostedDemo(hosts)
    .then(async ({ webhookPath }) => {
      process.env.WEBHOOK_PATH = webhookPath;
      run("npm", ["run", "smoke:hosted"], "Smoke check");
      console.log("\n[reset] Done. The demo is back at its seeded baseline.");
    })
    .catch((err: unknown) => {
      console.error(
        "\n[reset] failed:",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    });
}
