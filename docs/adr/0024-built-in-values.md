# 0024. Built-in values

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

A **built-in value** is written `@<identifier>` ([ADR 0009](0009-triggers.md)). Several ADRs use them, and promise a later ADR that gives the full list:

- `@subject`, `@anonymous` and `@defined` in `auth` rules and predicates ([ADR 0009](0009-triggers.md), [ADR 0010](0010-security.md)).
- `@id`, an entity's identifier facet ([ADR 0017](0017-faceted-types.md)).
- `@all`, which exposes or hides all of a model's fields in an entity ([ADR 0022](0022-entities.md)), and, in `passes @all`, lets an action pass along any error ([ADR 0023](0023-error-handling.md)).

## Decision

Not decided yet. Earlier ADRs already constrain it:

- The grammar is `BuiltIn = "@", Identifier`, with no space after the `@` ([ADR 0009](0009-triggers.md)). The `@` prefix is reserved, so built-in values cannot clash with anything a program declares ([ADR 0010](0010-security.md)).
- `@subject` is always defined: it is the subject that caused the trigger, or `@anonymous` when there is none ([ADR 0010](0010-security.md)).
- `@anonymous` and `@defined` are the only built-in values that can be a `SubjectType` ([ADR 0009](0009-triggers.md)).
- `@id` is provided by the interpreter for every entity ([ADR 0017](0017-faceted-types.md)).

## Open questions

These need answers before this ADR is accepted:

- **The full list.** Which built-in values exist, and what is each one's type?
- **Where they can be used.** `@subject` is available in any action, and `@id` belongs to an entity. Is `@id` written `user.@id`, or some other way? Are some built-in values only available in certain places, such as inside a trigger?
- **Request and event data.** Trigger arguments such as `user := event.user` ([ADR 0009](0009-triggers.md)) refer to data from the request or event. Is `event` a built-in value, written `@event`, or something else?
- **Other candidates.** Should the current time, the current request or the program's configuration be built-in values?
- **`@id`.** Can a program read an entity's `@id`, whose type, `EntityId`, is internal ([ADR 0022](0022-entities.md))? If so, what can it do with it, and how is an `EntityId` converted to text, given that an entity converts to text as its `@id` ([ADR 0011](0011-converting-values-to-text.md))?
- **Programs.** Can a program, or a module, define built-in values of its own?

## Consequences

TODO
