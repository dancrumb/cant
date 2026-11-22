---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-shared": minor
---

Add the built-in values `@stdin`, `@stdout` and `@stderr`, the interpreter process's standard streams (ADR 0040). They can be used in any trigger or action, but not in a constant expression. `@stdin` has an input stream type and `@stdout` and `@stderr` an output stream type, which a program can't name. A stream can't be converted to text, given where an `UNKNOWN` is expected, or compared with a stream of the other direction. `@dancrumb/cant-shared`'s compiled types gain `{ kind: 'stream', direction }`. Error messages that start with a type's description now start with a capital letter.
