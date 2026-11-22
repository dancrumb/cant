---
"@dancrumb/cant-shared": minor
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.
