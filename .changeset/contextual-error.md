---
"@dancrumb/cant-shared": minor
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Make `error` a contextual keyword (ADR 0023). `error` is a keyword only where it starts a top-level error declaration, `error Name` or `export error Name`; everywhere else it is an ordinary identifier, so an action, a variable or a parameter can be called `error`. The tokenizer, and so the editor's highlighting, marks `error` as a keyword only in that position. `ERROR`, the type, is still reserved everywhere.
