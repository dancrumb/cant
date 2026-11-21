# 0028. Extending base types

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

[ADR 0011](0011-converting-values-to-text.md) says that a program will be able to define its own types by extending a base type ([ADR 0012](0012-base-types.md)), and that an extended type can define how its values are converted to text, in place of the base type's rule. It suggests this as the way to format dates for people. No ADR says how a type is extended.

Since then, other ADRs have covered some of what extended types were meant for:

- People-friendly dates and times are written with `format` in `cant::Time` ([ADR 0026](0026-dates-and-times.md)).
- Values that can only be one of a fixed set are enums ([ADR 0013](0013-enums.md)), and records with their own fields are models ([ADR 0027](0027-object-shapes.md)).
- Behaviour that Cant can't express is written as native actions ([ADR 0036](0036-native-modules.md)).

## Decision

For now, a program cannot extend a base type, and Cant has no extended types. Extending base types is deferred to a later version of Cant.

Until then, every value of a base type is converted to text, compared and used with operators by that base type's rules ([ADR 0011](0011-converting-values-to-text.md), [ADR 0019](0019-operators.md)).

## Deferred

When a later version of Cant adds extended types, its ADR will need to keep the constraints that earlier ADRs set:

- An extended type's conversion to text, when it defines one, replaces the base type's rule; otherwise the base type's rule is used ([ADR 0011](0011-converting-values-to-text.md)).
- Operators need operands of the same type ([ADR 0019](0019-operators.md)), so it has to say whether an extended type counts as its base type for operators.

It will also need to answer:

- **Syntax.** How is an extended type declared, and where can it be used?
- **Which types.** Which base types can be extended? Can an enum, an entity or a collection be extended?
- **Compatibility.** Can a value of an extended type be used where its base type is expected, and the other way round? Do operators work on it as on its base type?
- **Constraints.** Can an extended type restrict its values, such as a `TEXT` that must look like an email address? Are those checked at compile time, at runtime, or both?
- **Behaviour.** Besides text conversion, can an extended type define other behaviour, such as parsing from text or its own operators?
- **Converting to text.** How is the conversion written: as an action, or in some other form?

## Consequences

- The type system stays as it is: a value's type is a base type, an enum, a model, an entity, a collection or `UNKNOWN`, and each base type has one fixed set of rules.
- A base value always converts to the same text, whatever it represents, so the value alone decides what an interpolation produces.
- Programs can't give a base value a more specific meaning in its type, such as an email address or an amount of money. They use the base type, or wrap the value in a model, and check its values in actions.
- Formatting for people goes through actions, such as `format` in `cant::Time` ([ADR 0026](0026-dates-and-times.md)), rather than through a type's own conversion to text.
- Adding extended types in a later version won't change the meaning of programs written now, since none of them can use one.
