---
"@dancrumb/cant-lsp": minor
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-shared": minor
"cant-vscode": minor
---

The language server, `cant-lsp`, checks each open `.cant` file as the entry of a program and reports every problem `cant check` finds, in that file and in the modules it imports, using the editor's unsaved text. It also offers go to definition, find references, hover, the document outline and completion of keywords, visible names and locals. The VS Code extension starts it for `.cant` files. The compiler now exports `symbolOf`, and the shared package exports `KEYWORDS`.
