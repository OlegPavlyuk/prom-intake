# Specs (Feature PRDs)

The **canonical** copy of every feature spec / PRD lives on the **GitHub issue tracker** (created by
the `/to-spec` skill and labelled `ready-for-agent`). See `docs/agents/issue-tracker.md`.

This directory is an **optional local mirror** for specs you want versioned alongside the code (for
offline reading or long-lived reference). When you keep a local copy:

- Name it after the issue: `NNNN-short-slug.md` where `NNNN` is the GitHub issue number.
- Put a link back to the issue at the top, and treat the issue as source of truth if they diverge.

Do not hand-author specs here from scratch - run `/to-spec` so the structure, seams, and
`ready-for-agent` label are produced consistently.

## Local mirrors

- [`phq9-tracer-bullet.md`](phq9-tracer-bullet.md) - v1 spec (issue #1).
- [`phq9-tracer-bullet-tickets.md`](phq9-tracer-bullet-tickets.md) - v1 ticket breakdown (#13-#23).
- [`iteration-2-tickets.md`](iteration-2-tickets.md) - Iteration 2 ticket breakdown (spec #45, #46-#48).
