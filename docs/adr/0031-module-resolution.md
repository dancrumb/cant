# 0031. Module resolution

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

An import's module identifier can be symbolic, such as `IO` or `cant::IO`, or a URL string ([ADR 0006](0006-imports.md)). URL identifiers are resolved relative to the importing module, but [ADR 0006](0006-imports.md) leaves the algorithm that resolves symbolic identifiers to its own ADR.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- A symbolic identifier is written `[<scope>::]<identifier>`, and its scope defaults to `cant`, so `import IO` and `import cant::IO` are the same ([ADR 0006](0006-imports.md)).
- `into` names the namespace that a module's symbols go into, and `as` declares the module's type, such as `"json"` ([ADR 0006](0006-imports.md)).

## Open questions

These need answers before this ADR is accepted:

- **Scopes.** What scopes exist besides `cant`? Who can publish modules under a scope, and how is a scope mapped to a location?
- **The `cant` scope.** Are `cant` modules, such as `IO`, built into the interpreter, or fetched like any other module?
- **Versions.** How does a program choose a version of a module, and is there a lock file?
- **Local modules.** Can a symbolic identifier refer to a module in the program's own project, or only URL strings can?
- **Caching and security.** Are fetched modules cached, and checked for integrity?
- **Module types.** Which values of `as` are supported, and how is each type of module turned into Cant symbols? A module whose actions are implemented in TypeScript is still Cant source, so it needs no type of its own ([ADR 0036](0036-native-modules.md)).

## Consequences

TODO
