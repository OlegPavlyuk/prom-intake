/**
 * Register a Medplum user with a KNOWN email/password so the client apps'
 * built-in-auth `SignInForm` can be driven during verification.
 *
 * `provision-medplum.ts` mints CLIENT credentials (client-credentials grant) for
 * the integration harness; those cannot log a human into `SignInForm`. This
 * script fills that gap: it registers a fresh user + project (recaptcha disabled
 * in the dev config), then writes `.dev-user.json` (gitignored) and prints the
 * credentials, so a browser verification session can log in.
 *
 * Usage (local docker-compose Medplum):
 *   docker compose -f infra/medplum/docker-compose.yml up -d --wait
 *   npm run medplum:dev-user            # generates a unique user, writes .dev-user.json
 *   DEV_USER_EMAIL=me@example.com DEV_USER_PASSWORD='S3cret!' npm run medplum:dev-user
 *
 * The written file shape is { baseUrl, email, password, projectId }. This is a
 * DEV convenience only - it creates a throwaway project each run. It is not part
 * of the app or the integration harness, and it deliberately does not add any
 * browser tooling (Playwright is deferred to the E2E ticket - see ADR-0010).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient, MemoryStorage, resolveId } from "@medplum/core";

// MedplumClient's PKCE register flow expects a browser `sessionStorage`; back it
// with in-memory storage in Node so the code verifier round-trips (mirrors
// provision-medplum.ts). The "window is not defined" notice it may print is a
// benign fallback to a plain code challenge and is fine for a dev user.
const globalWithStorage = globalThis as typeof globalThis & {
  sessionStorage?: Storage;
};
globalWithStorage.sessionStorage ??= new MemoryStorage() as unknown as Storage;

const baseUrl = process.env.MEDPLUM_BASE_URL ?? "http://localhost:8103/";
const suffix = Date.now();
const email = process.env.DEV_USER_EMAIL ?? `coordinator+${suffix}@example.com`;
const password = process.env.DEV_USER_PASSWORD ?? `Coordinator-${suffix}!`;

async function main(): Promise<void> {
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
    projectName: `Coordinator Dev ${suffix}`,
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

  const outPath = resolve(process.cwd(), ".dev-user.json");
  writeFileSync(
    outPath,
    JSON.stringify({ baseUrl, email, password, projectId }, null, 2),
    { encoding: "utf8" }
  );

  console.log(`\nRegistered dev user in a fresh project.`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  project:  ${projectId}`);
  console.log(`Wrote ${outPath} (gitignored).`);
}

main().catch((err) => {
  console.error("\nDev-user registration failed:", err);
  process.exit(1);
});
