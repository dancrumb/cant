# 0011. Converting values to text

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Strings ([ADR 0008](0008-strings.md)) can contain interpolations, written `${ … }`. When a string is evaluated, each interpolated expression is evaluated and its result is inserted into the text. If the result is not `TEXT`, it has to be converted to text first.

Enum values ([ADR 0013](0013-enums.md)) can be interpolated too, whatever their value type, and are converted in the same way.

The values that need converting are those of the base types ([ADR 0012](0012-base-types.md)), the `NOTHING` value, enum values and faceted values ([ADR 0017](0017-faceted-types.md)). Text can only be joined by interpolation, since `+` does not join text ([ADR 0019](0019-operators.md)).

## Decision

A value is converted to text according to its type:

| Type | Text |
| --- | --- |
| `TEXT` | The value itself, unchanged |
| `NUMBER` | The number in decimal notation, without trailing zeros after the decimal point or an exponent |
| `BOOLEAN` | `"true"` or `"false"` |
| `DATE_TIME` | The ISO 8601 representation of the timestamp in UTC, with milliseconds, ending in `Z` |
| `FILE` | Its URL, as a faceted type (see below) |
| `VOID` | An error |
| `NOTHING` | An error, as [ADR 0014](0014-optionals.md) describes |
| An enum | The member's value, converted by the rules above for its type |
| A faceted type, such as `FILE` or an entity | Its identifier, converted by the rules above for its type |
| An array | Each element converted to text, joined with `", "`, skipping empty slots ([ADR 0021](0021-collections.md)) |
| A set | Each element converted to text, joined with `", "` ([ADR 0021](0021-collections.md)) |
| A map | Each member written as `name: value`, with the value converted to text, joined with `", "` ([ADR 0021](0021-collections.md)) |

### Numbers

A `NUMBER` is written in plain decimal notation, as short as it can be without losing any of its value:

- Zeros at the end of the decimal part are left out, and so is the decimal point if nothing follows it. `1.50` is written `"1.5"`, and `2.0` is written `"2"`.
- An exponent is never used, however large or small the number. One million million million million is written `"1000000000000000000000000"`, not `"1e24"`, and one millionth is written `"0.000001"`, not `"1e-6"`.
- A negative number starts with `-`, as in `"-3.25"`.

### Dates and times

A `DATE_TIME` is written in ISO 8601 form in UTC, with `Z` at the end to show it, whatever time zone the value came from. Fractional seconds are always written to exactly three decimal places, even when they are zero. For example, `"2026-11-14T09:30:00.000Z"` and `"2026-11-14T09:30:00.250Z"`.

### Examples

```cant
"Total: ${3}"        // "Total: 3"
"Paid: ${true}"      // "Paid: true"
"Status: ${status}"  // "Status: paid", when status is InvoiceStatus.paid
```

An enum value is converted by taking the member's value ([ADR 0013](0013-enums.md)) and applying the rule for that value's type. A `TEXT` value is used unchanged, so `InvoiceStatus.paid` becomes `"paid"`. A `NUMBER` value is written as a number, so `Priority.High`, whose value is `3`, becomes `"3"`. A `BOOLEAN` or `DATE_TIME` value follows its rule in the same way. The member's name is never used, so `Status.InProgress` becomes `"In Progress"`, not `"InProgress"`.

The rules for numbers, dates and times apply to enum values of those types too.

`VOID` and `NOTHING` cannot be converted, because there is no value to write. `VOID` is not a value at all ([ADR 0012](0012-base-types.md)), and `NOTHING` stands for a missing one. A program that wants to show a missing value has to check for `NOTHING` and choose the text itself. How interpolating `NOTHING`, or a value that might be `NOTHING`, is reported is decided by [ADR 0014](0014-optionals.md).

### Faceted types

Every faceted type ([ADR 0017](0017-faceted-types.md)) converts to text as its identifier facet, and that identifier is then converted by the rules above for its own type. A `FILE` becomes its URL ([ADR 0015](0015-files.md)), which may be a `data:` URL, and an entity becomes its `@id`.

### Extended types

A program will be able to define its own types by extending a base type, and an extended type can define how its values are converted to text. When it does, that conversion is used in place of the base type's rule. When it does not, the base type's rule is used. How types are extended, and how a conversion is written, will be decided by [ADR 0028](0028-extending-base-types.md).

Arrays and maps are converted as [ADR 0021](0021-collections.md) describes: an array's elements, or a map's members written as `name: value`, are converted and joined with `", "`.

## Consequences

- Every base type except `VOID` has one fixed text form, so the same value always produces the same text. For `FILE` and other faceted types, that form is their identifier.
- Numbers are never written with an exponent, so very large or very small numbers can produce long text. In exchange, the text is always plain digits that people and other systems can read without knowing scientific notation.
- Because every `DATE_TIME` is written in UTC, the text does not show the time zone a value came from, but the same moment always produces the same text. Because the fractional seconds always have three digits, every `DATE_TIME` is written at the same length.
- `true` and `false` are written in lower case, matching how they are written in programs.
- Enum values are written as their values, not their member names, so the text matches the data a program stores and sends.
- `NOTHING` never appears silently in text, as `null` or an empty string might, so a missing value cannot slip into a message unnoticed. The cost is that programs have to handle missing values before interpolating them.
- `DATE_TIME` values are written in a standard form that other systems can parse, but not one that is friendly to read. Formatting dates for people needs something other than interpolation, such as an extended type with its own conversion.
- Because extended types can define their own conversion, the same base value can produce different text depending on its type, so the type, not just the value, decides what an interpolation produces.
