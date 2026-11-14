# 0011. Converting values to text

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

Strings ([ADR 0008](0008-strings.md)) can contain interpolations, written `${ … }`. When a string is evaluated, each interpolated expression is evaluated and its result is inserted into the text. If the result is not a string, it has to be converted to text first, and nothing yet says how.

TODO: Describe the values that need converting, such as `NOTHING`, numbers, booleans, enum values ([ADR 0013](0013-enums.md)), lists and objects, and any other forces at play.

## Decision

TODO

## Open questions

These need answers before this ADR is accepted:

- **Which values can be converted.** Can every value be interpolated, or are some, such as objects, an error?
- **How each kind of value is written.** For example, how numbers are formatted, and how `NOTHING`, lists and objects appear.
- **Custom conversions.** Can a program define how its own types are converted to text?
- **When errors are reported.** If a value cannot be converted, is that a compile-time error, a runtime error, or both?

## Consequences

TODO
