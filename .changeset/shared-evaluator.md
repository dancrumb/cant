---
"@dancrumb/cant-shared": minor
"@dancrumb/cant-compiler": minor
---

`@dancrumb/cant-shared` has an evaluator for constant expressions, `evaluate`, which the compiler and the interpreter share, with the values it gives (`Value`) and their conversion to text (`toText`). The compiler now uses it to find constant divisors and test case names, so names built from any constant value, such as a fractional number, an enum member or a date, are compared. `cant check` also reports a constant expression that can't be worked out, such as a `DATE_TIME` out of range, since it would fail when the program starts.
