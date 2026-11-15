# 0026. Dates and times

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

`DATE_TIME` is a base type for timestamps ([ADR 0012](0012-base-types.md)), but a program can do little with one. There are no `DATE_TIME` literals, so enums of `DATE_TIME` cannot be written ([ADR 0013](0013-enums.md)), and the arithmetic operators reject `DATE_TIME` operands ([ADR 0019](0019-operators.md)), so a program cannot find the time between two timestamps or move one by a duration.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- A `DATE_TIME` converts to text in ISO 8601 form, in UTC, with exactly three decimal places of seconds and a `Z` ([ADR 0011](0011-converting-values-to-text.md)).
- `DATE_TIME` values can be compared with `==` and `!=`, which compare instants, and ordered with `<`, `<=`, `>` and `>=` ([ADR 0019](0019-operators.md)).
- Arithmetic on `DATE_TIME` is a compile-time error, and operands of different types cannot be combined ([ADR 0019](0019-operators.md)).

## Open questions

These need answers before this ADR is accepted:

- **Literals.** How is a `DATE_TIME` written in source: as an ISO 8601 string with a prefix, as a call, or in some other form?
- **The current time.** How does a program get the current time: a built-in value ([ADR 0024](0024-built-in-values.md)), an action in a built-in namespace, or something else?
- **Durations.** Is there a type for a length of time? If so, how is it written, and can it be added to or subtracted from a `DATE_TIME`?
- **Differences.** What does the time between two `DATE_TIME`s give: a duration, or a `NUMBER` of some unit?
- **Calendar arithmetic.** How does a program add a month or a day, where the length depends on the calendar and the time zone?
- **Time zones.** Does a `DATE_TIME` carry a time zone, or is it always an instant in UTC? How does a program work with local dates and times?
- **Dates without times.** Is there a separate type for a date, or a time of day?
- **Formatting and parsing.** How does a program show a `DATE_TIME` to people, or read one from text? [ADR 0011](0011-converting-values-to-text.md) suggests extended types ([ADR 0028](0028-extending-base-types.md)) for formatting.

## Consequences

TODO
