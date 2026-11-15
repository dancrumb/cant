# 0029. Accessing facets

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

[ADR 0017](0017-faceted-types.md) defines faceted types, whose values each have several facets, but leaves how a program uses them to a later ADR. A `FILE` has URL, stream and blob facets ([ADR 0015](0015-files.md)), and an entity has an `@id` and its contents, but a program has no way to ask for any of them.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- Only Cant defines faceted types, and a value can be created from any one of its facets, with the interpreter providing the others ([ADR 0017](0017-faceted-types.md)).
- The URL, stream and blob facets follow JavaScript semantics, and their types cannot be named in a program ([ADR 0017](0017-faceted-types.md)).
- Deriving a facet can be expensive and can fail ([ADR 0017](0017-faceted-types.md)); failures are handled by [ADR 0023](0023-error-handling.md).
- A faceted value's identifier decides its equality and its text ([ADR 0017](0017-faceted-types.md)).

## Open questions

These need answers before this ADR is accepted:

- **Syntax.** How does a program ask for a facet: with a member such as `file.url`, a built-in value such as `entity.@id`, a conversion, or something else?
- **What a facet gives.** The stream and blob types cannot be named. What can a program do with a facet it cannot name? Can it read a blob's size and media type ([ADR 0015](0015-files.md))?
- **Creating values.** When can a program create a faceted value itself, such as a `FILE` from text, or an entity from an `@id`?
- **Identifiers as values.** Can an entity's `@id`, or a `FILE`'s URL, be used where the faceted type is expected?
- **Cost.** Since deriving a facet can be expensive, should the syntax make that cost visible?

## Consequences

TODO
