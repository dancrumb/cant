---
"@dancrumb/cant-compiler": minor
---

Place a symbolic import without `into` in a namespace named after the module too, as well as the current namespace (ADR 0038), so `import IO` followed by `IO::write(…)` checks.
