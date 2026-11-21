# 0026. Dates and times

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

`DATE_TIME` is a base type for timestamps ([ADR 0012](0012-base-types.md)), but a program can do little with one. There are no `DATE_TIME` literals, so enums of `DATE_TIME` cannot be written ([ADR 0013](0013-enums.md)), and the arithmetic operators reject `DATE_TIME` operands ([ADR 0019](0019-operators.md)), so a program cannot find the time between two timestamps or move one by a duration.

Earlier ADRs already constrain it:

- A `DATE_TIME` converts to text in ISO 8601 form, in UTC, with exactly three decimal places of seconds and a `Z` ([ADR 0011](0011-converting-values-to-text.md)).
- `DATE_TIME` values can be compared with `==` and `!=`, which compare instants, and ordered with `<`, `<=`, `>` and `>=` ([ADR 0019](0019-operators.md)).
- Arithmetic on `DATE_TIME` is a compile-time error, and operands of different types cannot be combined ([ADR 0019](0019-operators.md)).
- A `DATE_TIME` is passed to native code as a JavaScript `Date` ([ADR 0036](0036-native-modules.md)), which holds an instant to the millisecond.
- The standard library modules are native modules provided by the interpreter ([ADR 0031](0031-module-resolution.md), [ADR 0036](0036-native-modules.md)).

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### `DATE_TIME` is an instant

A `DATE_TIME` is an instant in time, to the millisecond, with no time zone. Two `DATE_TIME`s made in different time zones for the same moment are the same value. Time zones only appear in the actions that need one, such as for calendar arithmetic and formatting (see [`cant::Time`](#canttime)).

### `DURATION`

`DURATION` is a new base type ([ADR 0012](0012-base-types.md)) for an exact length of time, to the millisecond, such as 90 minutes or 30 days. It can be negative. A day in a `DURATION` is always exactly 24 hours: a `DURATION` never means a calendar month or year, whose lengths vary. Like the other base type names, `DURATION` is a keyword reserved everywhere ([ADR 0012](0012-base-types.md)).

### Literals

A `DATE_TIME` or a `DURATION` is written as its type's name with an ISO 8601 string in parentheses, as a set value is written `SET(…)` ([ADR 0021](0021-collections.md)):

```ebnf
Literal        = StringLiteral | NumberLiteral | BooleanLiteral | DateTimeLiteral | DurationLiteral ;
DateTimeLiteral = DateTimeKeyword, "(", ConstantStringLiteral, ")" ;
DurationLiteral = DurationKeyword, "(", ConstantStringLiteral, ")" ;
```

```cant
const launch := DATE_TIME("2026-11-21T09:30:00Z")
const gracePeriod := DURATION("P7DT12H")

enum Deadline
    EndOfYear := DATE_TIME("2026-12-31T23:59:59.999Z")
    MidYear := DATE_TIME("2026-06-30T00:00:00+01:00")
```

- **The string.** The string must be a string literal with no interpolations ([ADR 0008](0008-strings.md)), so the compiler knows its value. The compiler checks it, and a string that isn't valid for the type is a compile-time error.
- **`DATE_TIME` strings.** An ISO 8601 date and time, in the extended form `YYYY-MM-DDTHH:MM`, then optionally `:SS` and up to three digits of fractional seconds, then either `Z` or an offset such as `+01:00`. The offset is required, so the string always names one instant, and the year must be from `0000` to `9999`. A date that doesn't exist, such as `2026-02-30`, is an error. The offset only decides which instant the string means: it isn't kept ([`DATE_TIME` is an instant](#date_time-is-an-instant)).
- **`DURATION` strings.** An ISO 8601 duration made of days, hours, minutes and seconds: `P`, then optionally a number of days and `D`, then optionally `T` followed by any of hours `H`, minutes `M` and seconds `S`, in that order, as in `"P30D"`, `"PT90M"` or `"PT0.5S"`. Seconds can have up to three digits of fractional seconds. Years, months and weeks aren't allowed, since a `DURATION` is exact. A negative duration is written with unary `-`, as in `-DURATION("PT1H")`.
- **Constants.** These literals are constant expressions ([ADR 0023](0023-error-handling.md)), so they can be used in top-level constants ([ADR 0034](0034-top-level-constants.md)) and source parameters ([ADR 0025](0025-trigger-sources.md)). They are `ConstantValue`s too, so enums can now have `DATE_TIME` or `DURATION` values ([ADR 0013](0013-enums.md)).
- **No confusion with types.** As with `SET` ([ADR 0021](0021-collections.md)), a type and a value are never written in the same place, so `DATE_TIME` as a type and `DATE_TIME("…")` as a value can't be confused.

### The current time

`@now` is a new built-in value ([ADR 0024](0024-built-in-values.md)): the `DATE_TIME` at which the current trigger fired.

- **Fixed for a run.** `@now` has the same value throughout a trigger's run: in its settings, in its action and in every action that action calls. Reading it twice always gives the same instant, so code that uses it gives the same result however long it runs.
- **Anywhere.** Like `@subject`, `@now` doesn't come from a source, so it can be used in any trigger and in any action ([ADR 0024](0024-built-in-values.md), [ADR 0025](0025-trigger-sources.md)). It isn't a constant expression, so it can't be used in a top-level constant or a source parameter.
- **In tests.** A `TestCase` trigger ([ADR 0037](0037-test-case-trigger-source.md)) has a new optional parameter, `now`, a `DATE_TIME` that sets `@now` for the test case. Without it, `@now` is the instant the test case started.

```cant
trigger ExpireInvoices on TestCase
    parameters
        name := "expires invoices that are more than 30 days overdue"
        now := DATE_TIME("2026-12-01T00:00:00Z")
```

### Arithmetic

`DATE_TIME` and `DURATION` add these operations to the arithmetic operators ([ADR 0019](0019-operators.md)). They are the exceptions to the rule that an operator's operands must have the same type:

| Expression | Result |
| --- | --- |
| `DATE_TIME + DURATION`, `DURATION + DATE_TIME` | `DATE_TIME`: the instant moved later by the duration |
| `DATE_TIME - DURATION` | `DATE_TIME`: the instant moved earlier by the duration |
| `DATE_TIME - DATE_TIME` | `DURATION`: the time from the right instant to the left one, negative if the left one is earlier |
| `DURATION + DURATION`, `DURATION - DURATION` | `DURATION` |
| `-DURATION` | `DURATION`, negated |
| `DURATION * NUMBER`, `NUMBER * DURATION` | `DURATION`, scaled |
| `DURATION / NUMBER` | `DURATION`, divided |
| `DURATION / DURATION` | `NUMBER`: how many times the right duration fits into the left, which can be fractional |

```cant
due := issued + DURATION("P30D")
overdueBy := @now - due
if overdueBy > gracePeriod
    // ...
weeks := overdueBy / DURATION("P7D")   // a NUMBER
```

- **Milliseconds.** A result that isn't a whole number of milliseconds, such as from `DURATION("PT1S") / 3`, is truncated towards zero, as a fractional array index is ([ADR 0021](0021-collections.md)).
- **Division by zero.** Dividing a `DURATION` by zero, with a `NUMBER` or with a zero `DURATION`, raises `DivisionByZero`, as `/` on `NUMBER`s does, with the same rule for constant expressions ([ADR 0023](0023-error-handling.md)).
- **Out of range.** A `DATE_TIME` result outside the range a `DATE_TIME` can hold panics ([ADR 0023](0023-error-handling.md)).
- **Not allowed.** Adding two `DATE_TIME`s, multiplying or dividing a `DATE_TIME`, `%` and `**` on either type, and mixing a `DURATION` with a `NUMBER` in `+` or `-` are compile-time errors.

`DURATION`s can be compared with `==` and `!=`, and ordered with `<`, `<=`, `>` and `>=`, like `NUMBER`s ([ADR 0019](0019-operators.md)).

### Converting to text

A `DURATION` is converted to text in ISO 8601 form, using days, hours, minutes and seconds, each as large as it can be and left out when it is zero ([ADR 0011](0011-converting-values-to-text.md)):

- 90 minutes is `"PT1H30M"`, 36 hours is `"P1DT12H"`, and 30 days is `"P30D"`.
- Fractional seconds are written to exactly three decimal places when they aren't zero, as in `"PT1.500S"`, matching how a `DATE_TIME` writes them.
- A zero duration is `"PT0S"`, and a negative one starts with `-`, as in `"-PT1H"`.

A `DATE_TIME` is still converted as [ADR 0011](0011-converting-values-to-text.md) says, in UTC.

### `cant::Time`

Everything that needs a calendar or a time zone is an action in a standard library module, `cant::Time` ([ADR 0031](0031-module-resolution.md)). A time zone is named by its IANA name, as `TEXT`, such as `"Europe/London"` or `"UTC"`. For now, the module has these actions:

| Action | Gives |
| --- | --- |
| `addDays(time: DATE_TIME, days: NUMBER, zone: TEXT): DATE_TIME` | `time` moved by whole calendar days in `zone`, keeping its local time of day |
| `addMonths(time: DATE_TIME, months: NUMBER, zone: TEXT): DATE_TIME` | `time` moved by whole calendar months in `zone` |
| `addYears(time: DATE_TIME, years: NUMBER, zone: TEXT): DATE_TIME` | `time` moved by whole calendar years in `zone` |
| `format(time: DATE_TIME, zone: TEXT, locale?: TEXT := "en", style?: enum("date", "time", "dateTime") := "dateTime"): TEXT` | `time` written for people, in `zone`, following the locale's conventions, as JavaScript's `Intl.DateTimeFormat` writes it |
| `parse(text: TEXT): DATE_TIME` | The instant that `text` names, written as a `DATE_TIME` literal's string is |

- **Calendar moves.** `days`, `months` and `years` can be negative, and must be whole numbers. Adding days keeps the local time of day in `zone`, so across a daylight saving change, one day can be 23 or 25 hours. Adding months or years keeps the day of the month where it can, and otherwise uses the month's last day, so 31 January plus one month is 28 or 29 February. A local time that doesn't exist in `zone`, because the clocks went forward, is moved later by the length of the gap.
- **Errors.** Each action that takes a `zone` raises `Time::UnknownTimeZone` when `zone` isn't a time zone the interpreter knows. `addDays`, `addMonths` and `addYears` raise `Time::NotWholeNumber` when given a fractional number. `parse` raises `Time::InvalidDateTime` when `text` isn't a valid timestamp. These errors are declared in `cant::Time`, so a program imports it to name them ([ADR 0023](0023-error-handling.md)). The examples here import it `into Time`.
- **Exact moves.** Moving by an exact length of time needs no action: it is `+` or `-` with a `DURATION`.

More actions can be added to the module later.

### Native code

A `DURATION` is passed to native code as a `CantDuration`, from the native API ([ADR 0036](0036-native-modules.md)), which holds a whole number of milliseconds. It isn't passed as a `number`, so that a `DURATION` and a `NUMBER` are never confused, and the interpreter infers the type `DURATION` for a `CantDuration` where the signature declares `UNKNOWN` ([ADR 0036](0036-native-modules.md)). A `DATE_TIME` is still a `Date`.

## Deferred

- **Dates and times of day.** There is no type for a calendar date without a time, or a time of day without a date. Until there is, a program can hold a date as `TEXT`, such as `"2026-11-21"`, or as a `DATE_TIME` at midnight UTC. Types such as `DATE` and `TIME` may be added later.
- **Time zones as a type.** Time zones are `TEXT` for now. A type, or an enum, of time zones may be added later.
- **Formatting with extended types.** Extended types may define their own conversions to text ([ADR 0011](0011-converting-values-to-text.md), [ADR 0028](0028-extending-base-types.md)), such as a date type that always formats itself for people.
- **More of `cant::Time`.** Actions such as the start of a day or month in a zone, the day of the week, or parsing formats other than ISO 8601.

## Consequences

- A `DATE_TIME` is always an instant, so two values for the same moment are equal, sort correctly and convert to the same text, wherever they came from. A program that cares about a time zone passes the zone to the actions that need one.
- `DATE_TIME` and `DURATION` literals are checked at compile time and are constant expressions, so timestamps and lengths of time can be top-level constants, source parameters and enum values.
- `@now` is fixed for each trigger's run, so time-dependent code is deterministic within a run, and a test case can set it, so code that depends on the current time can be tested without a stand-in for the clock.
- `DURATION` is exact, so durations can always be compared and added, and `DATE_TIME` arithmetic with them is simple. Calendar arithmetic, which is not exact, is kept in actions that always name a time zone, so daylight saving and month lengths are handled in one place.
- The arithmetic operators gain their first operations on mixed types, so the type rules of [ADR 0019](0019-operators.md) gain exceptions.
- `DURATION` is a new base type, so it becomes a reserved word, and a program that uses `DURATION` as a name stops compiling ([ADR 0012](0012-base-types.md)). `@now` joins the built-in values, and `cant::Time` the standard library.
- Formatting follows `Intl`, so text for people depends on the locales and time zone data the interpreter's JavaScript runtime has.
- Calendar dates and times of day have no types of their own yet, so programs that need them have to represent them some other way.
