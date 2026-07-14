import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load `.env` into process.env so integration tests pick up the real-Medplum
// credentials written by `npm run medplum:provision`. CI passes the same three
// variables directly, so `.env` is simply absent there.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}
