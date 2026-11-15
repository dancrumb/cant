# 0023. Error handling

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

Several ADRs say that something is an error at runtime, and leave what happens then to an ADR on error handling:

- A value that fails the runtime check when it is converted to an enum ([ADR 0013](0013-enums.md)).
- A facet that cannot be derived, such as an entity whose `@id` no longer exists ([ADR 0017](0017-faceted-types.md)).
- Division or modulo by zero, and a fractional operand to `%` ([ADR 0019](0019-operators.md)).
- Assigning to a negative index before the start of an array ([ADR 0021](0021-collections.md)).

[ADR 0010](0010-security.md) leaves how a refused `auth` rule is reported, such as with an HTTP 401 or 403, to the interpreter. The source EBNF has an `assert` expression.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- Values that might be missing are optionals, not errors, and must be checked before use ([ADR 0014](0014-optionals.md), [ADR 0016](0016-handling-optional-values.md)). Reading outside an array or a missing map member gives an empty optional, not an error ([ADR 0021](0021-collections.md)).
- Mistakes the compiler can find, such as mixing types or using an unchecked optional, are compile-time errors, so this ADR covers what can only go wrong at runtime.

## Open questions

These need answers before this ADR is accepted:

- **Model.** Are runtime errors exceptions that unwind until something handles them, result values that an action returns, or something else?
- **Handling.** Can a program catch or handle an error, and if so, with what syntax? Can it raise one of its own?
- **Kinds of error.** Are errors typed, so a program can tell a failed enum conversion from a missing entity? What information does an error carry?
- **Unhandled errors.** What happens when an error is not handled: does the action stop, and what does the trigger that started it report, for example to an HTTP caller?
- **Arithmetic.** Does division by zero raise an error, or give a value? JavaScript gives `Infinity` or `NaN`, which no ADR lets a `NUMBER` hold ([ADR 0012](0012-base-types.md)).
- **Assertions.** Is there an `assert`, as in the source EBNF?
- **Transactions.** If an action fails part-way, are changes it has already made, such as to entities, kept or undone?

## Consequences

TODO
