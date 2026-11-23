---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"@dancrumb/cant": minor
---

Two imports that bring in different symbols with the same name are no longer an error at the imports (ADR 0038). The name is ambiguous where both place it, and an `ambiguous-name` error is reported only where it is used without its module, so `import Text` and `import Collections` can both be imported, with `Text::length` and `Collections::length` telling their `length`s apart. Completions leave the ambiguous name out.
