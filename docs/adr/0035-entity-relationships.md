# 0035. Entity relationships

- **Status:** Proposed
- **Date:** 2026-11-16

## Context

Entities are the records a Cant program stores ([ADR 0022](0022-entities.md)), and each one is made of models ([ADR 0027](0027-object-shapes.md)). [ADR 0022](0022-entities.md) leaves how one entity refers to another to a separate ADR, and this is that ADR.

[ADR 0010](0010-security.md) already shows a relationship. Its `Membership` entity links an `Organization` to a `User`, through a model whose fields have entity types:

```cant
model MembershipRecord
    organization: Organization
    user: User
```

The source EBNF that Cant's grammar started from has relations between entities.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- An entity is a faceted type with two facets, its identifier `@id` and its contents. Two entities are equal when they have the same type and `@id`, and an entity converts to text as its `@id` ([ADR 0017](0017-faceted-types.md), [ADR 0011](0011-converting-values-to-text.md), [ADR 0022](0022-entities.md)).
- Each entity type is its own type, so a field typed `User` can only hold a `User` ([ADR 0022](0022-entities.md)).
- An entity's `identity` line can name fields that hold entities, as `Membership`'s does ([ADR 0010](0010-security.md)).
- Fields can be optional, and collections can hold any type ([ADR 0014](0014-optionals.md), [ADR 0021](0021-collections.md)).

## Open questions

These need answers before this ADR is accepted:

- **Entity-typed fields.** Can a model field have an entity type, as in `MembershipRecord`? If so, does it store the entity, or only a reference to it, such as its `@id`?
- **Kinds of relationship.** How are one-to-one, one-to-many and many-to-many relationships declared? Is a many-to-many relationship always an entity of its own, like `Membership`?
- **Both directions.** Can a relationship be followed from both ends, such as from an `Organization` to its members, and is the reverse side declared or inferred?
- **Loading.** When a program reads an entity, are the entities it refers to loaded with it, loaded when first used, or loaded only when asked for?
- **Missing entities.** What happens when an entity that another refers to is deleted? Is the reference cleared, is the delete refused, or are the referring entities deleted too?
- **Models without entities.** Can a model that is not part of any entity hold an entity, for example as an action's parameter?

## Consequences

TODO
