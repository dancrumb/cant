---
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant-shared": minor
---

Implement the standard library's actions in the interpreter (ADRs 0021, 0026, 0036, 0042). The interpreter exports `STANDARD_ACTIONS`, the implementation of every `cant::IO`, `cant::Collections` and `cant::Time` action, by the symbol a compiled program names it with, such as `cant::IO#write`, each called with its arguments and context as ADR 0036 describes. `cant::IO` writes UTF-8 to and reads bytes from the standard streams and `FILE`s, raising `StreamError`; `cant::Collections` changes and compares sets with Cant's equality and converts members to text as the language does; and `cant::Time` does calendar moves in IANA time zones with date-fns, formats at `Intl`'s medium length, and parses `DATE_TIME` text. The native API, `@dancrumb/cant-native`, with `CantError`, `CantDuration` and `CantFile`, is a private package for now, bundled into the interpreter. `@dancrumb/cant-shared` exports `isDateTimeText`, which the parser now uses to check `DATE_TIME` literals.
