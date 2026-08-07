/**
 * HTTP smoke check for the hosted GCP demo (ADR-0012, T16). The behavioural seam
 * of the deployment: `scripts/deploy-hosted.ts` runs it as its final gate, and
 * the T17 pipeline reuses it verbatim. Deliberately **lightweight - HTTP/health
 * level only, no browser automation** (per the #55 review): a browser pass is a
 * separate manual `verifier-ui` step.
 *
 * Over public HTTPS it asserts, and exits non-zero on the first-seen failure(s):
 *   1. Medplum healthcheck is OK on api.
 *   2. app. serves the coordinator bundle (200 + its <title> marker) and that
 *      bundle carries the demo banner.
 *   3. forms. serves the patient bundle, likewise.
 *   4. the seeded PHQ-9 Questionnaire is queryable (client-credentials FHIR read).
 *   5. an Access-link `open` round-trips through forms./webhook/* - proving the
 *      same-origin proxy reaches the Bot (a bogus token yields the Bot's own
 *      `{ status: "not-found" }`, not a Caddy 404/502).
 *
 * Hosts come from env (API_HOST / COORDINATOR_HOST / PATIENT_HOST); if unset it
 * falls back to `terraform -chdir=infra/gcp output`. Checks 4-5 use the client
 * credentials in `.env`. The webhook path comes from WEBHOOK_PATH if set, else it
 * is discovered from the deployed Access-link Bot's ProjectMembership.
 *
 * Usage:
 *   npm run smoke:hosted
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient } from "@medplum/core";
import { PHQ9 } from "../src/packages/instrument/phq9.js";
import {
  requireEnv,
  resolveHosts,
  useNodeSessionStorage,
} from "./hosted-demo.js";

useNodeSessionStorage();

const BOT_IDENTIFIER = "https://prom-intake.example/bot|access-link-submit";
const COORDINATOR_TITLE = "PROM Intake - Coordinator";
const PATIENT_TITLE = "PROM Intake - Complete your questionnaire";
/**
 * A distinctive slice of the demo banner's copy (T18). Both apps hold it as a
 * single string literal, so it survives bundling verbatim - and it is compiled in
 * only when `VITE_DEMO_BANNER` was set, which is what makes finding it proof that
 * the deployed demo is labelled "synthetic data only" rather than passing for a
 * real clinical system.
 */
const DEMO_BANNER_MARKER = "Public demo - synthetic data only.";

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const hosts = resolveHosts();
  const apiBase = `https://${hosts.apiHost}/`;
  const results: CheckResult[] = [];

  results.push(
    await check("Medplum healthcheck OK on api.", async () => {
      const res = await fetch(`${apiBase}healthcheck`);
      if (!res.ok) throw new Error(`GET /healthcheck -> HTTP ${res.status}`);
    })
  );

  results.push(
    await check("app. serves the coordinator bundle", () =>
      assertServesBundle(hosts.coordinatorHost, COORDINATOR_TITLE)
    )
  );

  results.push(
    await check("forms. serves the patient bundle", () =>
      assertServesBundle(hosts.patientHost, PATIENT_TITLE)
    )
  );

  // Checks 4 + 5 need an authenticated client for the FHIR read (and, unless
  // WEBHOOK_PATH is provided, to discover the webhook path). One login, reused.
  const medplum = await clientLogin(apiBase);

  results.push(
    await check("seeded PHQ-9 Questionnaire is queryable", async () => {
      const found = await medplum.searchOne("Questionnaire", {
        url: PHQ9.questionnaireUrl,
      });
      if (!found) {
        throw new Error(`no Questionnaire with url ${PHQ9.questionnaireUrl}`);
      }
      if (found.title !== PHQ9.title) {
        throw new Error(`unexpected title ${JSON.stringify(found.title)}`);
      }
    })
  );

  results.push(
    await check(
      "Access-link open round-trips through forms./webhook/*",
      async () => {
        const webhookPath =
          process.env.WEBHOOK_PATH ?? (await discoverWebhookPath(medplum));
        const url = `https://${hosts.patientHost}${webhookPath}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "open",
            token: "smoke-check-nonexistent-token",
          }),
        });
        if (!res.ok) {
          throw new Error(`POST ${webhookPath} -> HTTP ${res.status} (proxy)`);
        }
        const body = (await res.json()) as { status?: string };
        // A bogus token MUST resolve to the Bot's own "not-found" - proving Caddy
        // proxied same-origin to Medplum and the Bot ran (not a Caddy error page).
        if (body.status !== "not-found") {
          throw new Error(`unexpected Bot response ${JSON.stringify(body)}`);
        }
      }
    )
  );

  const failed = results.filter((r) => !r.ok);
  console.log("");
  for (const r of results) {
    console.log(
      `${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : ` - ${r.error}`}`
    );
  }
  if (failed.length > 0) {
    console.error(`\nSmoke check FAILED (${failed.length}/${results.length}).`);
    process.exit(1);
  }
  console.log(`\nSmoke check passed (${results.length}/${results.length}).`);
}

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly error?: string;
}

async function check(
  name: string,
  fn: () => Promise<void>
): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * A served SPA bundle: HTTP 200 whose index.html carries the app's <title>, and
 * whose entry script carries the demo banner.
 */
async function assertServesBundle(
  host: string,
  titleMarker: string
): Promise<void> {
  const res = await fetch(`https://${host}/`);
  if (!res.ok) {
    throw new Error(`GET https://${host}/ -> HTTP ${res.status}`);
  }
  const html = await res.text();
  if (!html.includes(titleMarker)) {
    throw new Error(`served HTML missing marker "${titleMarker}"`);
  }
  await assertBundleIsLabelledDemo(host, html);
}

/**
 * The banner is a build-flag feature, so "is this deployment labelled as a demo?"
 * is answerable without a browser: fetch the entry module the served HTML points
 * at and look for the copy. A bundle built without `VITE_DEMO_BANNER` folds the
 * flag to `false` and drops the string, so its absence means an unlabelled public
 * deployment - which is exactly the thing that must never ship (ADR-0012).
 */
async function assertBundleIsLabelledDemo(
  host: string,
  html: string
): Promise<void> {
  const src = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
  if (!src) {
    throw new Error("served HTML references no module script to check");
  }
  const res = await fetch(new URL(src, `https://${host}/`));
  if (!res.ok) {
    throw new Error(`GET https://${host}${src} -> HTTP ${res.status}`);
  }
  if (!(await res.text()).includes(DEMO_BANNER_MARKER)) {
    throw new Error(
      `bundle ${src} carries no demo banner - it was built without VITE_DEMO_BANNER`
    );
  }
}

/** Log in with the client credentials in `.env` (client-credentials grant). */
async function clientLogin(baseUrl: string): Promise<MedplumClient> {
  const clientId = requireEnv("MEDPLUM_CLIENT_ID");
  const clientSecret = requireEnv("MEDPLUM_CLIENT_SECRET");
  const medplum = new MedplumClient({ baseUrl });
  await medplum.startClientLogin(clientId, clientSecret);
  return medplum;
}

/** Resolve the public webhook path from the deployed Access-link Bot's membership. */
async function discoverWebhookPath(medplum: MedplumClient): Promise<string> {
  const bot = await medplum.searchOne("Bot", { identifier: BOT_IDENTIFIER });
  if (!bot?.id) {
    throw new Error("Access-link Bot not found (deploy-bots did not run?)");
  }
  const membership = await medplum.searchOne("ProjectMembership", {
    profile: `Bot/${bot.id}`,
  });
  if (!membership?.id) {
    throw new Error("Access-link Bot has no ProjectMembership");
  }
  return `/webhook/${membership.id}`;
}

main().catch((err) => {
  console.error("\nSmoke check errored:", err);
  process.exit(1);
});
