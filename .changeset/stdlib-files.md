---
"@dancrumb/cant-compiler": patch
"@dancrumb/cant-lsp": patch
"cant-vscode": patch
---

The standard library's own source files, in `@dancrumb/cant-compiler`'s `stdlib` folder, are checked as the standard library modules they declare, so editing `IO.cant` or `Collections.cant` no longer reports `ReadStream`, `WriteStream`, type parameters or `Collection<T>` as errors, and `cant check` accepts them. A file with the same name anywhere else is still an ordinary module.
