---
"@dancrumb/cant-compiler": minor
---

`cant check` now checks error handling (ADR 0023). Calls to actions with `raises` or `passes`, and `/` and `%` unless the divisor is a non-zero constant, give results that must be handled: checked with `instanceOf`, passed, ignored or used. It reports results that are never handled, unchecked results returned, errors raised or passed that the action doesn't declare, `raise` data that doesn't match the error's, duplicate and misplaced error clauses, division by a constant zero, fractional `%` operands, and statements that can raise `IndexBeforeStart`, `UnknownField`, `RequiredField`, `CardinalityViolation` or `InvalidEnumValue` without listing it. `instanceOf` narrows results and errors on both branches, and `@result`, `@error` and an error's `data` are typed.
