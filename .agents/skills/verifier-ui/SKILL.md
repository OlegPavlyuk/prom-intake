---
name: verifier-ui
description: "Repo recipe for verifying the client apps (Vite + React) in a real browser against local Medplum: browser harness, built-in-auth login, and the auth-flow checklist. Use when /verify (or a UI ticket) needs to drive the coordinator or patient surface end-to-end."
---

# Verifier: client apps in a real browser

This is the repo's evidence-capture protocol for the **client apps** under
`src/apps/` ([ADR-0010](../../../docs/adr/0010-frontend-architecture.md)). The
bundled `/verify` skill is the general methodology (run the app, drive the
surface, capture what you see); **this** skill is the concrete recipe so you do
not re-derive the browser harness and the Medplum login each time.

Use it whenever a change touches a client app and you need to observe it in the
browser: the Coordinator app shell and auth, the assign flow, the Patient
completion page, or the Worklist.

> **Not committed E2E infra.** ADR-0010 defers browser-E2E tooling (Playwright
> etc.) to the tracer-bullet E2E ticket. This recipe installs `playwright-core`
> **ephemerally (`--no-save`)** for a manual verification session and cleans up
> after - it must not add Playwright to `package.json`. Component behaviour is
> covered separately by the `ui` vitest project (jsdom); see the seam notes
> below.

## Prerequisites

Local Medplum must be up and a login user must exist:

```bash
docker compose -f infra/medplum/docker-compose.yml up -d --wait   # Postgres + Redis + Medplum
npm run medplum:dev-user                                          # writes .dev-user.json (email/password)
```

`npm run medplum:dev-user` registers a KNOWN email/password user in a throwaway
project and writes `.dev-user.json` (gitignored). `SignInForm` needs a real
user; `npm run medplum:provision` only mints client-credentials for the
integration harness and cannot log a human in.

## Drive the surface

1. **Start the dev server** (background) and confirm it serves:

   ```bash
   npm run dev:coordinator > /tmp/vite.log 2>&1 &      # http://localhost:3000
   sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
   ```

2. **Install the browser driver ephemerally** and note the two gotchas:

   ```bash
   npm i -D playwright-core --no-save                  # ephemeral; not saved to package.json
   ```

   - The driver launches the **system Chrome** via `executablePath` (this repo
     has no downloaded Playwright browser). Set it to your OS's Chrome path -
     e.g. macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
     Linux typically `/usr/bin/google-chrome`.
   - **The driver script must live at the repo root** (e.g. `.verify-drive.mjs`).
     ESM ignores `NODE_PATH`, so a script in a scratch dir cannot resolve
     `playwright-core` from the repo's `node_modules`.

3. **Driver skeleton** - copy to `.verify-drive.mjs`, adapt the middle for the
   flow under test, run with `node .verify-drive.mjs`:

   ```js
   import { chromium } from "playwright-core";
   import { readFileSync } from "node:fs";

   const { email, password } = JSON.parse(readFileSync("./.dev-user.json", "utf8"));
   const shot = (n) => `/tmp/shot-${n}.png`;

   const browser = await chromium.launch({
     // macOS system Chrome; set to your OS's Chrome path.
     executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
     headless: true,
   });
   const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
   page.on("console", (m) => m.type() === "error" && console.log("PAGE ERROR:", m.text()));

   try {
     // Sign-in gate
     await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
     await page.getByRole("heading", { name: /coordinator sign in/i }).waitFor();
     await page.screenshot({ path: shot("1-signin") });

     // Built-in auth: SignInForm is a two-step form - email -> Next, then password -> Sign in
     await page.getByRole("textbox", { name: /email/i }).fill(email);
     await page.getByRole("button", { name: /next/i }).click();
     await page.getByLabel(/password/i).fill(password);
     await page.getByRole("button", { name: /^sign in$/i }).click();

     // Authenticated surface
     await page.getByRole("button", { name: /sign out/i }).waitFor({ timeout: 15000 });
     await page.screenshot({ path: shot("2-auth") });

     // Session persists across refresh (Medplum client owns the tokens)
     await page.reload({ waitUntil: "networkidle" });
     await page.getByRole("button", { name: /sign out/i }).waitFor({ timeout: 15000 });

     // Logout returns to the gate
     await page.getByRole("button", { name: /sign out/i }).click();
     await page.getByRole("heading", { name: /coordinator sign in/i }).waitFor({ timeout: 15000 });
     await page.screenshot({ path: shot("3-logout") });

     // Probe: reload after logout must NOT resurrect the session
     await page.reload({ waitUntil: "networkidle" });
     const leaked = await page.getByRole("button", { name: /sign out/i }).isVisible().catch(() => false);
     console.log("probe reload-after-logout leaked session:", leaked);
   } finally {
     await browser.close();
   }
   ```

   Read the screenshots (`/tmp/shot-*.png`) - they are the evidence. Watch the
   `PAGE ERROR:` lines for **unexpected or repeated** errors and for genuinely
   missing assets (a stylesheet, a script, an expected image) - those are real
   blemishes worth fixing. Use judgement: a single benign 404 is not
   automatically a defect.

## Auth-flow checklist (authenticated surfaces)

- [ ] Unauthenticated visit shows the **sign-in gate**, not app content.
- [ ] After login the **authenticated page renders**.
- [ ] **Refresh persists** the session (no re-login) - the Medplum client stores/refreshes tokens.
- [ ] **Logout** returns to the sign-in gate (`medplum.signOut()`).
- [ ] **Reload after logout does not resurrect** the session (no leaked auth).
- [ ] No unexpected console errors during the flow.

## Component-test seam (jsdom, not the browser)

Fast component checks live in the `ui` vitest project (`npm run test:ui`), driven
through `@medplum/mock`'s `MockClient` - use these for logic, the browser recipe
above for real end-to-end evidence:

- Authenticated: `new MockClient()`. Unauthenticated: `new MockClient({ profile: null })`.
- **`MockClient.signOut()` does NOT clear its profile stub.** To test the gate
  re-closing on session loss, drive `act(() => medplum.setProfile(undefined))`
  and assert the sign-in gate returns.
- jsdom lacks `matchMedia` (Mantine's hooks need it); the shim lives in
  `src/test-support/setup-ui.ts`.
- Assert your own stable markers (a "Coordinator sign in" heading, a "Sign out"
  button), not `@medplum/react`'s internal form markup.

## Patient surface

The patient completion page is **account-less** ([ADR-0005](../../../docs/adr/0005-access-link-security-model.md)):
skip the login steps entirely. Drive it by opening an Access-link URL and
verifying it renders only the blank Instrument (no patient/clinical data). It has
no `SignInForm`, no `ProtectedRoute`, and no stored session.

## Cleanup

```bash
pkill -f "vite --config src/apps/coordinator" 2>/dev/null   # stop the dev server
rm -f .verify-drive.mjs                                     # remove the driver script
rm -rf src/apps/coordinator/dist                            # remove any build output
```

`.dev-user.json` is gitignored; each `medplum:dev-user` run leaves a throwaway
Medplum project. `docker compose ... down -v` wipes them all.
