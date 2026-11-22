---
"@dancrumb/cant-shared": minor
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Declare `cant::Collections` in Cant, with generic signatures (ADR 0043). Standard library modules can declare type parameters on actions, as in `values<T>(map: {T}): [T]` or `concat<C: Collection>(src: C, tgt: C): C`, and write the generic type `Collection<T>`; a program that does either gets a compile-time error. The compiler ships `stdlib/Collections.cant`, and checks calls to its actions: it works out each call's type parameters from its arguments, reports collections of the wrong kind or element type, and gives the call's result its precise type, so `concat` of two `[NUMBER]`s is a `[NUMBER]`. The parser and formatter handle type parameters and generic types, and compiled programs write them as `typeParameter` and `collection` types. Hovering over a `cant::Collections` action shows its declaration.
