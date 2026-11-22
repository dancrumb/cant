---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Check `cant::` imports in the editor against the standard library of the Cant that runs the program (ADR 0031), rather than the copy bundled into the extension. The language server looks up from the entry module for the `stdlib` folder of a `@dancrumb/cant-compiler` package: the package itself or a `packages/compiler` beside it, as in Cant's own repository, where unsaved changes to its files are seen; then the one the installed `@dancrumb/cant` uses, in `node_modules`. It falls back to its own copy. So a new standard library action, such as `IO::readline`, can be used as soon as the installed Cant has it. A compiler `Host` can now give a `standardLibrary`, and `findStandardLibrary` and `standardLibraryIn` are exported.
