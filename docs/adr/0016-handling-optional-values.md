# 0016. Handling optional values

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

[ADR 0014](0014-optionals.md) gives a value that might be missing the internal type `Optional<T>`, written `T?`, which holds either a `T` or `NOTHING`. Using the value inside an `Optional<T>` as a `T` is a compile-time error unless the program has first checked whether it holds a `T` or `NOTHING`. ADR 0014 does not say how a program makes that check, so until this ADR is decided, a program cannot use an optional's value at all. It can only pass it on to other optional parameters.

Some rules from ADR 0014 limit the options:

- `Optional<T>` cannot be written in a program, so a check cannot name it.
- `NOTHING` cannot be passed as an argument or assigned to an identifier, though a program can compare against it ([ADR 0012](0012-base-types.md)).
- An identifier cannot be declared optional explicitly. It is optional only when it is assigned an optional value.

TODO: Describe the forces at play, such as how often programs handle missing values, how much code a check should take, and how easily the compiler can tell that a value has been checked.

## Decision

TODO

## Open questions

These need answers before this ADR is accepted:

- **How a program checks.** What does a check look like? For example, comparing against `NOTHING` in an `if` (`if user != NOTHING`), a dedicated keyword or operator, or a form that binds the value to a new name when it is present.
- **Narrowing.** After a check, how does the compiler know a value is a `T`? Is the same identifier narrowed to `T` in the branch where it has a value, or does the check introduce a new identifier? Does narrowing survive reassignment, or a loop?
- **Handling `NOTHING`.** Must a program handle the `NOTHING` case, or can it check only for the value and ignore the rest?
- **Fallback values.** Is there a short way to use a fallback when a value is missing, such as an operator that gives `T` from a `T?` and a default?
- **Chaining.** Is there a short way to read a field or call an action on an optional value, producing another optional, such as `user?.email`?
- **Checking results directly.** Can a program check the result of an action call without first assigning it to an identifier?
- **Returning early.** Can a program return, or stop, when a value is missing, and then use the value as a `T` for the rest of the block?

## Consequences

TODO
