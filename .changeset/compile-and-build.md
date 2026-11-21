---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-shared": minor
---

The compiler can now compile a program for the interpreter (ADR 0039). `compile()` checks a program and gives its compiled program and source map, and `cant build` writes them to disk, as `<entry>.compiled.json` and `<entry>.compiled.json.map` in the program's root, or where `-o` says, with `--no-source-map` to leave the source map out. A build with problems writes nothing and removes the files an earlier build wrote. `@dancrumb/cant-shared` declares the compiled program's types. A constant can now declare an enum type and give one of its values, as in ADR 0034's `const defaultStatus: InvoiceStatus := "draft"`, which `cant check` wrongly rejected.
