# 0030. Mutability

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

Every identifier in Cant is a constant ([ADR 0018](0018-immutable-identifiers.md)): once given a value, it cannot be given another. [ADR 0018](0018-immutable-identifiers.md) says support for mutability will come later, and that it will need to revisit where narrowing holds ([ADR 0016](0016-handling-optional-values.md)). Meanwhile, the contents of collections can change ([ADR 0021](0021-collections.md)), and Cant has no `++` or `--`, partly because identifiers cannot be reassigned ([ADR 0019](0019-operators.md)).

## Decision

Not decided yet. Earlier ADRs already constrain it:

- Narrowing an optional after `isEmpty` relies on the identifier not changing ([ADR 0016](0016-handling-optional-values.md)).
- A nested block can shadow a name from an enclosing block, which is not a reassignment ([ADR 0018](0018-immutable-identifiers.md)).
- Parameters and loop variables are constants ([ADR 0018](0018-immutable-identifiers.md), [ADR 0020](0020-action-parameters.md)).
- Collections are passed by reference, so a change made through one name is seen through every name that holds the collection ([ADR 0021](0021-collections.md)).
- A model's fields are mutable, and objects are passed by reference too ([ADR 0027](0027-object-shapes.md)).

## Open questions

These need answers before this ADR is accepted:

- **Whether to add it.** Does Cant need reassignable identifiers at all, given that a loop that accumulates a value can often use a collection or a new constant instead?
- **Syntax.** If identifiers can be reassigned, how is a mutable one declared, and is reassignment written with `:=`?
- **Narrowing.** Where does narrowing stop holding once an identifier can be reassigned, such as inside loops?
- **Parameters and loop variables.** Can these ever be reassigned?
- **Entity fields.** Can an entity's fields be changed in place, as a model's fields can ([ADR 0027](0027-object-shapes.md))?

## Consequences

TODO
