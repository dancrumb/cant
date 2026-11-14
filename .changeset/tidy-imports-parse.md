---
"@dancrumb/cant-shared": minor
---

Parse `namespace` declarations, `ns::symbol` references, and imports of the form `import <module> [into <identifier>] [as <string>]`, following ADRs 0005 and 0006

The `module` of an `import` node is now a `moduleName` node (with an optional `scope`) or a string, instead of an identifier
