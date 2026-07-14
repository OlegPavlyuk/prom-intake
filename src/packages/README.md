# Packages

Every directory directly under `src/packages/` is a **deep module**: a lot of
behaviour behind a small interface. Boundaries are enforced mechanically by
dependency-cruiser (`npm run lint:boundaries`), wired per
[`docs/architecture/module-boundaries.md`](../../docs/architecture/module-boundaries.md).

## Layout

```
src/packages/
  <name>/
    index.ts      <- an entry point (public). Import this from outside.
    client.ts     <- another entry point. A package may expose SEVERAL.
    lib/          <- implementation: hidden from outside, free to import itself.
    tests/        <- co-located tests + fixtures (a subfolder, so private).
```

A package's **public surface is its root files** (the entry points) - not one
designated `index.ts`. Anything inside *any* subfolder (`lib/`, `tests/`, ...) is
private, so a new folder never needs a config change.

## The four rules (all errors)

1. **Entry-point boundary** - code outside a package may import only that
   package's root files, never anything in its subfolders.
2. **Intra-package freedom** - a package's own files import each other freely.
3. **Tests through the entry points** - files under `<pkg>/tests/` import any
   package's entry points (and their own `tests/` fixtures), never internals.
4. **No cycles** - no dependency cycles.

## Conventions

- **Import only through a package's entry points (its root files).** Never reach
  into another package's `lib/`.
- **No barrel files.** Expose several small entry points (`index.ts`,
  `client.ts`, ...) instead of re-exporting a whole subtree through one index.
- Run `npm run lint:boundaries` to check; it also runs in CI and pre-commit.

`example/` is a copy-me starter template - copy it for a new package or delete it
once real packages exist.
