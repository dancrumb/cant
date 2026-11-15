# 0027. Object shapes

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

[ADR 0021](0021-collections.md) gives objects one kind of type, the map `{T}`, whose members all have values of type `T`. An object whose members have values of different types, such as `{ name := "Ada", age := 36 }`, has no type, so writing one is a compile-time error. Programs need types for records with a fixed set of members, each with its own type.

The source EBNF that Cant's grammar started from has a `schema` declaration with `fields`, like an entity that is not stored, and uses object values with `create` and `update` to give an entity's fields.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- Object values are written `{ name := value, … }`, with comma-separated items, free layout and trailing commas, and a member's name can be an identifier, a keyword or a string ([ADR 0021](0021-collections.md)).
- Duplicate member names are a compile-time error ([ADR 0021](0021-collections.md)).
- Objects are passed by reference, and are equal only when they are the same object ([ADR 0019](0019-operators.md), [ADR 0021](0021-collections.md)).
- Cant otherwise favours nominal types: enums and entities are distinguished by name ([ADR 0013](0013-enums.md), [ADR 0017](0017-faceted-types.md)).

## Open questions

These need answers before this ADR is accepted:

- **Declared or structural.** Is a shape declared and named, such as with a `schema` declaration, so that only values made for it fit? Or is it given by its members, so that any object with the right members fits?
- **Typing object values.** Does an object value take its type from where it is used, such as the parameter it is passed to, or from its members?
- **Optional members.** Can a member be optional, or have a default?
- **Member access.** On a shaped object, the compiler knows which members exist. Does `value.name` then give a `T`, unlike on a map, where it gives a `T?`? Can `value[expression]` be used on a shaped object?
- **Entities.** How do shapes relate to entities ([ADR 0022](0022-entities.md))? Is an entity's contents facet a shaped object, and can an object value be used to create or update an entity?
- **Changing objects.** Can members be added to or deleted from a shaped object, as they can from a map?

## Consequences

TODO
