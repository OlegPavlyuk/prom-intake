/**
 * The single entry point for the full local app environment (#43). One command
 * that brings up everything the end-to-end workflow needs -
 * assign -> complete -> score -> flag -> worklist -> resolve - all in ONE
 * Medplum project, then runs both client apps:
 *
 *   1. start the Docker Medplum stack (Postgres + Redis + server) and wait for
 *      health;
 *   2. provision (or reuse) a unified local project with both a coordinator
 *      login and client credentials (`scripts/provision-local.ts`);
 *   3. seed the baseline: PHQ-9 Instrument + CodeSystems + synthetic patients;
 *   4. deploy both Bots (Access-link submit + Scoring) and the Subscription;
 *   5. run the coordinator (:3000) and patient (:3001) Vite dev servers
 *      concurrently, in the foreground.
 *
 * Usage:
 *   npm run dev:full            # reuse a live project if there is one
 *   npm run dev:full -- --fresh # force a brand-new project
 *
 * Steps 3-4 reuse the existing idempotent npm scripts, so their logic stays in
 * one place. Ctrl-C stops both dev servers; the Docker stack is left running
 * (tear it down with `docker compose -f infra/medplum/docker-compose.yml down -v`).
 */
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { provisionLocal } from "./provision-local.js";

const COMPOSE_FILE = "infra/medplum/docker-compose.yml";
const COORDINATOR_URL = "http://localhost:3000/";
const PATIENT_URL = "http://localhost:3001/";

/** Run a command to completion, inheriting stdio; throw on non-zero exit. */
function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
  }
}

/** Spawn a long-running dev server, prefixing its output so the two interleave clearly. */
function startServer(name: string, script: string): ChildProcess {
  const child = spawn("npm", ["run", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = (line: string) => `[${name}] ${line}`;
  const pipe = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) => {
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix(line)}\n`);
    });
  };
  pipe(child.stdout!, process.stdout);
  pipe(child.stderr!, process.stderr);
  return child;
}

async function main(): Promise<void> {
  const fresh = process.argv.includes("--fresh");

  console.log(
    "[dev:full] 1/4 Starting Docker Medplum (Postgres + Redis + server)..."
  );
  run(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "up", "-d", "--wait"],
    "Docker Medplum"
  );

  console.log(
    `[dev:full] 2/4 Provisioning the local project${fresh ? " (fresh)" : ""}...`
  );
  const env = await provisionLocal({ fresh });
  console.log(
    env.created
      ? `[dev:full]     created project ${env.projectId}`
      : `[dev:full]     reusing project ${env.projectId}`
  );

  console.log(
    "[dev:full] 3/4 Seeding PHQ-9 + CodeSystems + synthetic patients..."
  );
  run("npm", ["run", "medplum:seed"], "Seed");

  console.log(
    "[dev:full] 4/4 Deploying Bots (submit + scoring) and the Subscription..."
  );
  run("npm", ["run", "medplum:deploy-bots"], "Deploy bots");

  console.log("\n[dev:full] Environment ready. Starting both apps...");
  console.log(
    `  Coordinator: ${COORDINATOR_URL}  (sign in: ${env.email} / ${env.password})`
  );
  console.log(
    `  Patient:     ${PATIENT_URL}  (open an Access link assigned in the coordinator)`
  );
  console.log("  Stop with Ctrl-C. Medplum keeps running; tear down with:");
  console.log(`    docker compose -f ${COMPOSE_FILE} down -v\n`);

  const servers = [
    startServer("coordinator", "dev:coordinator"),
    startServer("patient", "dev:patient"),
  ];

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[dev:full] Stopping dev servers...");
    for (const s of servers) s.kill("SIGTERM");
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // If either server dies on its own, bring the whole command down.
  for (const s of servers) {
    s.on("exit", (code) => {
      if (!shuttingDown) {
        console.error(
          `[dev:full] a dev server exited (code ${code}); shutting down.`
        );
        shutdown();
      }
    });
  }
}

main().catch((err) => {
  console.error(
    "\n[dev:full] failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
