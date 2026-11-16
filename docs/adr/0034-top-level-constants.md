# 0034. Top-level constants

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

Identifiers so far only exist inside action bodies, where every identifier is a constant ([ADR 0018](0018-immutable-identifiers.md), [ADR 0030](0030-mutability.md)). Triggers are top-level, and a trigger source's parameter values must be constant expressions ([ADR 0025](0025-trigger-sources.md), [ADR 0023](0023-error-handling.md)), so without top-level constants they can only use literals, enum values and operators. Programs need a way to share a value, such as an API's base path, between several triggers.

## Decision

Top-level constants are a Cant construct: a program can declare a constant at the top level, alongside actions, models, enums and errors. The rest is not decided yet. Earlier ADRs already constrain it:

- Identifiers are immutable, so a top-level constant can never be given another value ([ADR 0030](0030-mutability.md)).
- A constant expression can use identifiers whose values the compiler knows ([ADR 0023](0023-error-handling.md)), so a top-level constant given a constant expression can be used in another constant expression, such as a trigger's parameters.
- Type names are unique within a namespace ([ADR 0013](0013-enums.md), [ADR 0027](0027-object-shapes.md)), but constants are values, not types.

## Open questions

These need answers before this ADR is accepted:

- **Syntax.** Is a top-level constant written as an assignment at the top level, as in `apiBase := "/api/v1"`, or with a keyword? Can it declare its type?
- **Values.** Must its value be a constant expression, or can it be any expression evaluated once when the program starts, such as a call to an action? If it can be any expression, how are errors from it handled ([ADR 0023](0023-error-handling.md))?
- **Use in actions.** Can action bodies use top-level constants? Can a local identifier or parameter shadow one ([ADR 0018](0018-immutable-identifiers.md))?
- **Modules.** Can a top-level constant be exported from a module and imported into another, as in `config::apiBase` ([ADR 0005](0005-module-namespaces.md), [ADR 0006](0006-imports.md))?
- **Names.** Can a constant share a name with an action, a type or another constant in the same namespace?
- **Collections and models.** Collections and models are mutable ([ADR 0021](0021-collections.md), [ADR 0027](0027-object-shapes.md)). Can a top-level constant hold one, and if so, can its contents be changed, given that every trigger would share it?

## Consequences

TODO
