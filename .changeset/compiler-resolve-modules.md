---
"@dancrumb/cant-compiler": minor
---

`cant check` now checks whole programs: it follows each entry file's imports, resolving them through the `cant` standard library, `cant.json` scopes and relative files, and rejecting remote URLs and `as`. It works out each module's exports and re-exports, places imported symbols by `into` or the current namespace, reports names that clash there, and resolves the types, errors, models, entities and actions that declarations refer to, reporting unknown names and namespaces and names of the wrong kind. The package exports `checkProgram`, `loadProgram` and `resolveNames`.
