---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Add `cant::Console`, the standard library module for logging (ADR 0044). The compiler ships `stdlib/Console.cant`, which declares `LogLevel` (`Error`, `Warn`, `Info`, `Debug`, `Trace`), an action for each level, `error`, `warn`, `info`, `debug` and `trace`, each taking `message: TEXT` and `data?: {UNKNOWN}`, and `log`, which also takes `level?: LogLevel := LogLevel.Info`. The interpreter implements them: each call writes one line to the program's `@stderr`, the level padded to five characters, the message, and the data's members as text, two spaces after it, and never raises, dropping a line it can't write. The interpreter also evaluates map literals, gives maps to native code as a `Map`, and converts them to text, and gives standard library actions the program's streams in their context.
