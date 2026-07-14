# CLAUDE.md

Operating instructions for any agent working in this repository. Read this first, then the
[Operating Manual](docs/workflows/OPERATING_MANUAL.md).

## How we work

This project is built with **documentation-first, spec-driven development** powered by the skills
under `.agents/skills/`. The full process - lifecycle, kickoff order, agent workflow, reviews - is in
**[`docs/workflows/OPERATING_MANUAL.md`](docs/workflows/OPERATING_MANUAL.md)**. That manual is the
source of truth; this file is the quick pointer.

The short version: idea -> product docs -> architecture/ADRs -> reviewed spec (GitHub issue) ->
vertical-slice tickets -> one fresh agent session per ticket (implement, self-review, verify, PR) ->
human review + merge -> docs updated in the same PR.

## Before you touch code

Read, in this order:

1. The [Operating Manual](docs/workflows/OPERATING_MANUAL.md).
2. The GitHub issue you are working (`gh issue view <NN> --comments`) - it is your brief.
3. [`CONTEXT.md`](CONTEXT.md) - the domain glossary. Use its terms; don't invent synonyms.
4. Relevant records in [`docs/adr/`](docs/adr/) and the pertinent [`docs/architecture/`](docs/architecture/) files.

Work **one ticket per fresh session**. Everything you need must come from the issue and the repo -
not from a prior conversation.

## Documentation map

- **Product (WHAT & WHY):** [`docs/product/`](docs/product/)
- **Architecture (HOW):** [`docs/architecture/`](docs/architecture/)
- **Decisions:** [`docs/adr/`](docs/adr/)
- **Specs (mirror; canonical = GitHub issues):** [`docs/specs/`](docs/specs/)
- **Domain glossary:** [`CONTEXT.md`](CONTEXT.md)
- **Process:** [`docs/workflows/`](docs/workflows/)

## Conventions

- **Branches:** `<type>/<issue#>-<slug>` (`feat`/`fix`/`chore`/`refactor`/`docs`). One branch per
  ticket.
- **Commits & PRs:** imperative subject, reference `#NN`; PR body has "Closes #NN" + acceptance
  checklist; update docs in the same PR.
- **Never** add an AI/agent co-author line to commits.
- **Never** use the em dash. Use a plain dash `-`.
- **Tests** exercise behaviour through a module's seam, not its internals. `/implement` uses TDD at
  the agreed seams.
- **Packages are deep modules** - import only through a package's entry points (its root files),
  never its subfolders. See [`src/packages/README.md`](src/packages/README.md) before adding or
  importing one. Boundaries are enforced by `npm run lint:boundaries`.
- **Integration tests run against a real Medplum** ([ADR-0008](docs/adr/0008-integration-tests-against-real-medplum.md)).
  Bring one up with `docker compose -f infra/medplum/docker-compose.yml up -d` then
  `npm run medplum:provision`. See [`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md).
- Do not manually edit auto-generated files (e.g. `skills-lock.json`, any `CHANGELOG.md`).

## Agent skills

### Issue tracker

Issues and PRDs live as **GitHub issues**, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
