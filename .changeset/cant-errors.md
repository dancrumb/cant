---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Declare `cant::Errors` in Cant (ADR 0023). The compiler ships `stdlib/Errors.cant`, which declares the eight built-in errors, with no `data`, so every standard library module is now declared in Cant and loaded from its source. A compiled program still records the built-in errors whether or not it imports `cant::Errors`. The compiler no longer exports `STANDARD_LIBRARY` and `StandardKind`; it exports `STANDARD_SOURCES`, the Cant source of each standard library module, by name.
