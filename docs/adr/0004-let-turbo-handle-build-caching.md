# 0004. Let Turborepo handle build caching

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The packages were built with TypeScript project references (`tsc -b`), which keeps its own incremental build cache in `.tsbuildinfo` files. Turborepo already caches each package's build and runs builds in dependency order, so there were two caching layers doing the same job. The two also interacted badly: after `pnpm clean`, `tsc -b --noEmit` failed with TS6310 because it would not type check against a referenced project it was not allowed to build.

## Decision

Turborepo is the only build cache. Packages are built with plain `tsc` and type checked with `tsc --noEmit`, with no project references, `composite` or `.tsbuildinfo` files. A package finds the types of `@dancrumb/cant-shared` in that package's built `dist` through the pnpm workspace link, and turbo's `^build` dependency makes sure it is built first.

## Consequences

- There is one cache to reason about, and typecheck works from a clean checkout.
- Builds and checks should be run through `pnpm` (and so through turbo). Running `tsc` directly in a package does not build `cant-shared` first, so it can fail or see stale types.
- Editors resolve `cant-shared` through its built declaration files. Declaration maps still lead go-to-definition to the source.
