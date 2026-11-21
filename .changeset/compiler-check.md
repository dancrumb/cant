---
"@dancrumb/cant-compiler": minor
---

Add `cant check <files...>`, which parses each Cant file, reports a syntax error where it is, and reports names declared twice where the ADRs allow only one: types, actions and constants in a namespace, exported symbols, test case names, and parameters, fields, enum members and values, roles and entity lines inside a declaration. The package now exports `check`, `collectDeclarations` and `formatDiagnostic`, and a symbol table of each module's declarations by namespace.
