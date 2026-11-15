# 0022. Entities

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

Several ADRs rely on **entities**, the records a Cant program stores and works with, but none defines them. [ADR 0010](0010-security.md) defines only the security lines of an entity declaration, and shows `fields` only to give its examples context. The source EBNF that Cant's grammar started from has an `entity` declaration with key-value metadata, `fields`, computed fields and relations between entities, and expressions to create, update, delete and query them.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- `entity` starts a top-level declaration and is reserved everywhere ([ADR 0010](0010-security.md)).
- An entity declaration can contain `subject`, `identity`, `group` and `role` lines, followed by its `fields` ([ADR 0010](0010-security.md)).
- An entity is a faceted type with exactly two facets: its identifier, `@id`, and its contents ([ADR 0017](0017-faceted-types.md)).
- `@id` is provided by the interpreter, cannot be named in `identity`, and picks out the same entity as the `identity` fields ([ADR 0017](0017-faceted-types.md)).
- Each entity type is its own type: a `User` can only be used where a `User` is expected, and two entities are equal when they have the same type and `@id` ([ADR 0017](0017-faceted-types.md)).
- Entities convert to text as their `@id` ([ADR 0011](0011-converting-values-to-text.md)).
- An entity is essentially an aggregation of models ([ADR 0027](0027-object-shapes.md)), the named object shapes whose fields have their own types, can be optional, can have defaults, and are mutable.

## Open questions

These need answers before this ADR is accepted:

- **Aggregating models.** How does an entity declare the models it is made of: by naming them, by declaring fields inline as in a `model`, or both? How does that fit with the `fields` line that [ADR 0010](0010-security.md) shows? Is an entity's contents facet an object of one of those models? Can an object of a model be used to create or update an entity?
- **Fields.** What is the grammar of `fields`? Can a field be optional, have a default, or be computed from other fields? Which types can a field have, including arrays, maps ([ADR 0021](0021-collections.md)) and other entities?
- **Relations.** How does one entity refer to another, and how are one-to-many and many-to-many relations declared?
- **Creating, changing and deleting.** How does a program create an entity, change its fields and delete it? `delete` is already a statement for collections only ([ADR 0021](0021-collections.md)).
- **Querying.** How does a program find entities, by `@id`, by `identity` fields or by other conditions, and how are results paged and ordered?
- **Membership and roles.** How do subjects become members of groups, and how are roles assigned ([ADR 0010](0010-security.md))?
- **Changing values.** Can an entity's fields change after it is created ([ADR 0018](0018-immutable-identifiers.md))?
- **Storage.** Where are entities stored, and what does the program control about it?
- **Metadata.** The source EBNF allows key-value metadata lines in an entity. Are they needed?

## Consequences

TODO
