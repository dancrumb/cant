# 0014. Optionals

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

[ADR 0007](0007-actions.md) uses `?` in two places in an action's signature:

```cant
action FindUser(email: TEXT, includeDeleted?: BOOLEAN): User?
```

- After a parameter's name (`includeDeleted?`), it marks the parameter as optional.
- After the return type (`User?`), it means the action may return no value.

ADR 0007 defines the syntax but not what either form means in detail, or how the two relate. [ADR 0012](0012-base-types.md) adds `VOID`, which raises the question of how an action that returns nothing differs from one that may return nothing.

TODO: Describe the forces at play, such as safety (forgetting to handle a missing value), convenience for callers, and how triggers pass arguments ([ADR 0009](0009-triggers.md)).

## Decision

TODO: The rest of the decision.

### Optional returns

An action whose return type is marked `?`, such as `User?`, returns either a `User` or `NOTHING`, the value that stands for a missing one ([ADR 0012](0012-base-types.md)).

### `VOID` cannot be optional

`VOID` already means there is no value, so it cannot also be optional. `VOID?` is a syntax error. The return type in an action's signature ([ADR 0007](0007-actions.md)) is either `VOID` on its own or another type with an optional `?`:

```ebnf
ActionSignature  = Identifier, "(", [ParameterList], ")", ":", ReturnType ;
ReturnType       = VoidKeyword | TypeRef, ["?"] ;
```

A `TypeRef` is never `VOID` ([ADR 0012](0012-base-types.md)), so `?` can only follow other types.

```cant
action SayHello(): VOID     // valid
action SayHello(): VOID?    // syntax error
```

## Open questions

These need answers before this ADR is accepted:

- **Optional parameters.** What value does an optional parameter have when a caller leaves it out and it has no default? Is it `NOTHING`?
- **Defaults.** Can a parameter that is not marked `?` have a default value, and can an optional parameter have none?
- **Optional returns.** What can a caller do with the result of an action that returns `T?`? Does it have to check for `NOTHING` before using the result as a `T`?
- **One `?` or two.** The `?` goes after the name for parameters but after the type for return types. Should both use the same position, and can a parameter's type itself be optional (`name: TEXT?`)?
- **Where `NOTHING` is allowed.** Can only a type marked `?` hold `NOTHING`, or can any value be `NOTHING`?
- **Interpolating `NOTHING`.** `NOTHING` cannot be converted to text ([ADR 0011](0011-converting-values-to-text.md)). Is interpolating a value that might be `NOTHING`, such as the result of an action that returns `T?`, a compile-time error, or a runtime error only when the value is `NOTHING`? Runtime errors themselves are left to a future ADR on error handling.

## Consequences

TODO
