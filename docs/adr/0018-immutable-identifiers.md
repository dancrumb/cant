# 0018. Immutable identifiers

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Programs give names to values with `:=`, the assignment operator ([ADR 0007](0007-actions.md)), as in `user := FindUser(email)`. Nothing yet says whether a name can later be given a different value.

The answer matters beyond assignment itself. [ADR 0016](0016-handling-optional-values.md) narrows an optional identifier to its inner type once it has been checked. If the identifier could be reassigned after the check, the compiler would have to track every reassignment, including those inside loops, to know whether the narrowing still holds.

Cant does not need mutable identifiers yet, and adding them later is easier than taking them away.

## Decision

For now, every identifier in Cant is a constant. Once an identifier has been given a value, it cannot be given another. Assigning to it again is a compile-time error:

```cant
user := FindUser(email)
user := FindUser(otherEmail)  // compile-time error: user has already been assigned
```

This applies to every kind of identifier:

- **Assigned identifiers,** such as `user` above.
- **Parameters.** An action cannot assign a new value to one of its parameters.
- **Loop variables.** In `for item in items`, `item` is a new constant on each pass through the loop. The loop gives it its value, and the loop body cannot assign to it.

### Shadowing

A nested block, such as the body of an `if` or a loop, can assign a new identifier with the same name as one in an enclosing block. The new identifier shadows the outer one: inside the nested block, the name refers to the new identifier, and when the block ends, the name refers to the outer one again. This is not a reassignment, because the outer identifier keeps its value.

```cant
name := "Ada"
if isAdmin
    name := "Administrator"  // valid: a new identifier, shadowing the outer name
    Greet(name)              // "Administrator"
Greet(name)                  // "Ada"
```

Within a single block, a name can still only be assigned once, so the earlier example of assigning `user` twice remains an error.

A shadowing identifier has its own type and its own narrowing ([ADR 0016](0016-handling-optional-values.md)). Narrowing the outer identifier does not narrow the inner one, and the other way round.

### Values

This is about identifiers, not the values they refer to. Whether a value itself can change, such as an entity's fields ([ADR 0010](0010-security.md)), is not decided here.

Support for mutability will be added in a later ADR. That ADR will need to revisit where narrowing holds ([ADR 0016](0016-handling-optional-values.md)).

## Consequences

- An identifier always means the same value wherever it is in scope, so code is easier to follow, and narrowing ([ADR 0016](0016-handling-optional-values.md)) holds for as long as the identifier is in scope.
- Code that would usually update a variable, such as a running total, has to be written another way until mutability is supported.
- A `while` loop ([ADR 0007](0007-actions.md)) whose condition only uses identifiers can never change its condition, so it either never runs or never stops. Until mutability is supported, a `while` loop is only useful when its condition calls actions, or when the loop ends with `break` or `return`.
- Shadowing lets a nested block reuse a name without a new one having to be invented. The cost is that a reader has to check which block an identifier belongs to, since the same name can mean different values in different blocks.
- Adding mutability later will not break programs written now, because every program that is valid with constants stays valid.
