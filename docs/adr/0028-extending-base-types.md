# 0028. Extending base types

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

[ADR 0011](0011-converting-values-to-text.md) says that a program will be able to define its own types by extending a base type ([ADR 0012](0012-base-types.md)), and that an extended type can define how its values are converted to text, in place of the base type's rule. It suggests this as the way to format dates for people. No ADR says how a type is extended.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- An extended type's conversion to text, when it defines one, replaces the base type's rule; otherwise the base type's rule is used ([ADR 0011](0011-converting-values-to-text.md)).
- Operators need operands of the same type ([ADR 0019](0019-operators.md)), so this ADR has to say whether an extended type counts as its base type for operators.

## Open questions

These need answers before this ADR is accepted:

- **Syntax.** How is an extended type declared, and where can it be used?
- **Which types.** Which base types can be extended? Can an enum, an entity or a collection be extended?
- **Compatibility.** Can a value of an extended type be used where its base type is expected, and the other way round? Do operators work on it as on its base type?
- **Constraints.** Can an extended type restrict its values, such as a `TEXT` that must look like an email address? Are those checked at compile time, at runtime, or both?
- **Behaviour.** Besides text conversion, can an extended type define other behaviour, such as parsing from text or its own operators?
- **Converting to text.** How is the conversion written: as an action, or in some other form?

## Consequences

TODO
