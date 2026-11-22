---
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Run arrays, sets, `if`, `instanceOf` and prefix operators (ADR 0021, ADR 0033, ADR 0019). The interpreter holds arrays, with their empty slots, and sets, makes them from literals, passes them to native code as an `Array` and a `Set`, and takes an `Array`, a `Set` or a `Map` back, so `IO::read()` gives its bytes. It runs `if` and `else`, checks a value with `instanceOf` against a base type, `UNKNOWN`, `ERROR`, a declared error, model or enum, an optional or a collection, and applies `-`, `!`, `isEmpty` and `ignore`. A collection is converted to text as its elements joined with `", "`, and an error, once narrowed, as its name and its data, so `"OOPS: ${problem}"` writes `OOPS: StreamError: reason: …`.
