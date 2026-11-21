---
"@dancrumb/cant-compiler": minor
---

`cant check` now checks types. It reports operators given operands they don't take, including on dates and durations; conditions that aren't `BOOLEAN` and messages that aren't `TEXT`; arguments, returns, assignments, defaults and constants whose values don't fit, with enum compatibility and object values matched against models; fields a value doesn't have; VOID results used as values; actions that can end without returning a value; and values that can't be interpolated. Optionals must be checked before they are used, with narrowing by `isEmpty`, `instanceOf` and `@subject is`, through `!`, `and`, `or`, early returns, `assert` and earlier assertions.
