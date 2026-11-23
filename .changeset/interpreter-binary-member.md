---
"@dancrumb/cant-shared": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Run binary operators and member access (ADR 0019, ADR 0021, ADR 0027). The interpreter evaluates `==`, `!=`, `<`, `<=`, `>` and `>=`, arithmetic on numbers, dates and durations, `and` and `or`, which only evaluate their right when it decides the result, `orElse`, and `in` on arrays, sets and maps. Division by zero and a fractional modulo give `cant::Errors`' errors, as in constant expressions, and `arithmetic` is exported from `@dancrumb/cant-shared` so the compiler and the interpreter share one implementation. It reads an object's fields, a map's members and an error's `data`, as in `problem.data.reason`.
