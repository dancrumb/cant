---
---

Accept ADR 0038 on namespaces from imports: a symbolic import without `into` also places its symbols in a namespace named after the module, so `import IO` allows both `write(…)` and `IO::write(…)`. It amends ADR 0006.
