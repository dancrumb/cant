# 0030. Mutability

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Every identifier in Cant is a constant ([ADR 0018](0018-immutable-identifiers.md)): once given a value, it cannot be given another. [ADR 0018](0018-immutable-identifiers.md) says support for mutability will come later, and that it will need to revisit where narrowing holds ([ADR 0016](0016-handling-optional-values.md)). Meanwhile, the contents of collections can change ([ADR 0021](0021-collections.md)), and Cant has no `++` or `--`, partly because identifiers cannot be reassigned ([ADR 0019](0019-operators.md)).

## Decision

Plain identifiers are immutable by default: once an identifier is given a value, it cannot be given another, as [ADR 0018](0018-immutable-identifiers.md) already says. Reassignable identifiers will be explored in a later ADR (see Deferred).

This means:

- Narrowing an optional after `isEmpty` holds for the rest of the scope, since the identifier cannot change ([ADR 0016](0016-handling-optional-values.md)).
- A nested block can shadow a name from an enclosing block, which is not a reassignment ([ADR 0018](0018-immutable-identifiers.md)).
- Parameters and loop variables are constants ([ADR 0018](0018-immutable-identifiers.md), [ADR 0020](0020-action-parameters.md)).

Values can still change without reassigning an identifier:

- Collections are passed by reference, so a change made through one name is seen through every name that holds the collection ([ADR 0021](0021-collections.md)).
- A model's fields are mutable, and objects are passed by reference too ([ADR 0027](0027-object-shapes.md)).
- An entity's exposed fields can be changed by assignment, like a model's, but saving the change needs an explicit keyword ([ADR 0022](0022-entities.md)).

## Deferred

A later ADR will decide whether, and how, a program can opt in to reassignable identifiers. It will need to answer:

- **Syntax.** How is a mutable identifier declared, and is reassignment written with `:=`?
- **Narrowing.** Where does narrowing stop holding once an identifier can be reassigned, such as inside loops ([ADR 0016](0016-handling-optional-values.md))?
- **Parameters and loop variables.** Can these ever be reassigned?

## Consequences

- An identifier's value never changes after it is given, so a reader can rely on it, and narrowing after `isEmpty` always holds.
- Programs change state through collections, model fields and entity fields, not by reassigning identifiers. Since collections and models are passed by reference, a change made through one name is seen through every other name for the same value.
- A loop that accumulates a value has to use a collection, or a model field, until reassignable identifiers are added.
- Adding reassignable identifiers later as an opt-in will not change the meaning of existing programs.
