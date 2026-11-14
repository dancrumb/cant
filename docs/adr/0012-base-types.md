# 0012. Base types

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

Actions ([ADR 0007](0007-actions.md)) refer to types in their parameters and return values. A `TypeRef` can be a built-in type, but nothing yet says which built-in types exist. The examples so far use `String` and `VOID`.

TODO: Describe what the base types need to support, such as values ([ADR 0007](0007-actions.md)), string interpolation ([ADR 0011](0011-converting-values-to-text.md)) and entity fields ([ADR 0010](0010-security.md)).

## Decision

TODO

## Open questions

These need answers before this ADR is accepted:

- **The set of base types.** Which types are built in? For example, strings, integers, decimals, booleans, dates and times, lists and maps.
- **Naming.** How are base type names written? The examples so far mix `String` and `VOID`.
- **Nothing and null.** Is `VOID` a type, and how does it relate to `null` and the `?` that marks a nullable return type?
- **Reserved names.** Are base type names keywords, or identifiers that a program could shadow?

## Consequences

TODO
