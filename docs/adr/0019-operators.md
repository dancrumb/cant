# 0019. Operators

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

Several ADRs use operators, and some decide parts of how they behave, but no ADR lists them all or gives their full order of precedence:

- [ADR 0005](0005-module-namespaces.md) uses `::` to name a symbol in a namespace.
- [ADR 0007](0007-actions.md) uses `:=` for default values and `+` in an example (`greeting + name`), and says expressions will be defined later.
- [ADR 0009](0009-triggers.md) and [ADR 0010](0010-security.md) combine `auth` predicates with `and`, `or` and parentheses, with `and` binding more tightly than `or`.
- [ADR 0013](0013-enums.md) uses `.` to name an enum member (`InvoiceStatus.paid`) and `:=` to give a member its value.
- [ADR 0016](0016-handling-optional-values.md) adds `isEmpty` and `orElse`, uses `!` and `==`, says `or` short-circuits, and fixes part of the order of precedence.
- [ADR 0018](0018-immutable-identifiers.md) makes every identifier a constant, so `:=` only ever gives a name its first value.

The tokenizer already recognises these symbol operators: `::`, `:=`, `<=`, `>=`, `==`, `<`, `>`, `+`, `*`, `-`, `\`, `!` and `.`, and the word operators `and` and `or`. Some of these have no meaning in any ADR yet.

This ADR is the single place where every operator, what it does, and its precedence are defined. Later ADRs that add an operator should amend this one.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Operators

| Operator | Form | Meaning | Source |
| --- | --- | --- | --- |
| `::` | `namespace::name` | The symbol `name` in the namespace `namespace` | [ADR 0005](0005-module-namespaces.md) |
| `.` | `value.member` | A member of a value, such as a field. Also names an enum member (`InvoiceStatus.paid`), the one place `.` is used on a type | [ADR 0013](0013-enums.md); objects to come |
| `( … )` | `action(arguments)` | Calls an action | [ADR 0007](0007-actions.md) |
| `orElse` | `a orElse b` | The value inside the optional `a`, or `b` if `a` is empty | [ADR 0016](0016-handling-optional-values.md) |
| `isEmpty` | `isEmpty a` | Whether the optional `a` holds `NOTHING`. `a` must be an optional | [ADR 0016](0016-handling-optional-values.md), amended here |
| `!` | `!a` | Boolean not | Used in [ADR 0016](0016-handling-optional-values.md) |
| `-` | `-a` | Negation | TODO |
| `*` | `a * b` | Multiplication | TODO |
| `+` | `a + b` | Addition | TODO |
| `-` | `a - b` | Subtraction | TODO |
| `==` | `a == b` | Equality | Used in [ADR 0016](0016-handling-optional-values.md) |
| `!=` | `a != b` | Inequality: `true` exactly when `a == b` is `false` | This ADR |
| `<`, `<=`, `>`, `>=` | `a < b` | Ordering | TODO |
| `and` | `a and b` | Boolean and, short-circuiting | [ADR 0009](0009-triggers.md) |
| `or` | `a or b` | Boolean or, short-circuiting | [ADR 0009](0009-triggers.md), [ADR 0016](0016-handling-optional-values.md) |
| `( … )` | `(a)` | Grouping | [ADR 0009](0009-triggers.md) |

`:=` is not an expression operator, and it does not produce a value of its own. It gives a value to a name in an assignment, to a default value ([ADR 0007](0007-actions.md)), to a trigger argument ([ADR 0009](0009-triggers.md)) or to an enum member ([ADR 0013](0013-enums.md)), and it gives a new value to an element or member of a collection ([ADR 0021](0021-collections.md)).

### `::` and `.`

`::` names a symbol in a namespace, and `.` reaches a member of a value. Enums are the one exception: an enum member is written with `.` after the enum's name, as in `InvoiceStatus.paid` ([ADR 0013](0013-enums.md)), even though the enum is a type, not a value. So `billing::InvoiceStatus.paid` uses `::` to find the enum and `.` to pick its member.

### Precedence

Operators are listed from the most tightly binding to the least. Rows marked *proposed* are a first pass and are not yet decided; the others follow from earlier ADRs.

| Level | Operators | Associativity | Status |
| --- | --- | --- | --- |
| 1 | `::` | Left | Settled ([ADR 0016](0016-handling-optional-values.md)) |
| 2 | `.`, calls | Left | Settled ([ADR 0016](0016-handling-optional-values.md)) |
| 3 | `orElse` | Left | Settled ([ADR 0016](0016-handling-optional-values.md)) |
| 4 | `isEmpty`, `!`, unary `-` | Right (prefix) | `isEmpty` settled; `!` and `-` proposed |
| 5 | `*` and division | Left | Proposed |
| 6 | `+`, `-` | Left | Proposed |
| 7 | `==`, `!=`, `<`, `<=`, `>`, `>=` | None | Proposed |
| 8 | `and` | Left | Settled relative to `or` ([ADR 0009](0009-triggers.md)) |
| 9 | `or` | Left | Settled relative to `and` ([ADR 0009](0009-triggers.md)) |

What earlier ADRs already fix:

- `::`, `.` and calls bind more tightly than `orElse`, so `FindUser(email) orElse guest` applies `orElse` to the call's result.
- `orElse` binds more tightly than `isEmpty`, arithmetic, comparison and boolean operators.
- `isEmpty` binds more tightly than comparison operators.
- `and` binds more tightly than `or`.

Putting `!` and unary `-` at the same level as `isEmpty` means that `!a orElse b` is read as `!(a orElse b)`, matching how `isEmpty` already works.

Making comparison non-associative means that `a == b == c` is an error, rather than comparing a `BOOLEAN` with `c`.

### Short-circuiting

`and`, `or` and `orElse` short-circuit: each evaluates its right-hand side only when the left-hand side does not already decide the result.

| Operator | Right-hand side is evaluated only when the left-hand side is |
| --- | --- |
| `and` | `true` |
| `or` | `false` ([ADR 0016](0016-handling-optional-values.md)) |
| `orElse` | empty ([ADR 0016](0016-handling-optional-values.md)) |

So if the right-hand side is an action call, the action is not called unless its result is needed.

### Settled rules for particular operands

- **`NOTHING`.** Comparing a value against `NOTHING`, with `==`, `!=` or any other comparison operator, is a syntax error ([ADR 0016](0016-handling-optional-values.md)).
- **`isEmpty` needs an optional.** Applying `isEmpty` to a value that is not optional is a compile-time error, just as applying `orElse` to one is ([ADR 0016](0016-handling-optional-values.md)). This amends ADR 0016, which made `isEmpty` on a value that is not optional `false`. Both operators now reject a value that cannot be empty, since checking it, or falling back from it, could never do anything.
- **Optionals.** Any operator that uses an optional's value as a `T`, such as `+` or `==`, is a compile-time error on an unchecked optional ([ADR 0014](0014-optionals.md)). `isEmpty` and `orElse` are the exceptions.
- **Enums.** At runtime, an enum value is its member's value ([ADR 0013](0013-enums.md)), so operators act on that value.
- **Faceted values.** Two faceted values are equal if they have the same specific type and their identifiers match ([ADR 0017](0017-faceted-types.md)).

TODO: Define each operator's meaning for each type, and the grammar.

## Open questions

These need answers before this ADR is accepted:

- **Precedence.** Are the proposed levels right? In particular, should `!` bind more loosely than comparison, as `not` does in some languages, so that `!a == b` means `!(a == b)`?
- **Missing operators.** The tokenizer has no `/`. How is division written? `/` cannot start a comment, since comments start with `//`, but it needs care in the tokenizer. Is there a remainder operator?
- **Unused token.** The tokenizer recognises `\`, but no ADR gives it a meaning. Is it division, or should it be removed?
- **`+` on `TEXT`.** [ADR 0007](0007-actions.md) and [ADR 0012](0012-base-types.md) use `greeting + name`. Does `+` join `TEXT` values, or should text be joined only with interpolation ([ADR 0008](0008-strings.md))? If `+` joins text, does it convert a non-`TEXT` operand using [ADR 0011](0011-converting-values-to-text.md)?
- **Mixed types.** Can an operator combine operands of different types, such as `NUMBER` and an enum whose value type is `NUMBER`, or two different enums? Is `InvoiceStatus.paid == QuoteStatus.paid` allowed, and is it `true`, given that both are `"paid"` at runtime?
- **Ordering.** Which types can be ordered with `<`? `NUMBER` and `DATE_TIME` seem natural. What about `TEXT`, which needs a collation, and `BOOLEAN`, enums and faceted values?
- **Boolean operands.** Must the operands of `and`, `or` and `!` be `BOOLEAN`, or can other values be used as conditions?
- **Arithmetic errors.** What happens on division by zero, and on overflow or loss of precision in `NUMBER`, which [ADR 0012](0012-base-types.md) says is represented without losing precision? Runtime errors are left to the future ADR on error handling.
- **Operators in `auth` rules.** `auth` rules ([ADR 0010](0010-security.md)) have their own grammar using `and`, `or` and parentheses. Are they expressions, so that every operator here can be used in them, or do they stay a separate, smaller language?

## Consequences

TODO
