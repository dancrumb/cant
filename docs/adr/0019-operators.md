# 0019. Operators

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Several ADRs use operators, and some decide parts of how they behave, but no ADR lists them all or gives their full order of precedence:

- [ADR 0005](0005-module-namespaces.md) uses `::` to name a symbol in a namespace.
- [ADR 0007](0007-actions.md) uses `:=` for default values and refers to expressions without defining them.
- [ADR 0009](0009-triggers.md) and [ADR 0010](0010-security.md) combine `auth` predicates with `and`, `or` and parentheses, with `and` binding more tightly than `or`.
- [ADR 0013](0013-enums.md) uses `.` to name an enum member (`InvoiceStatus.paid`) and `:=` to give a member its value.
- [ADR 0016](0016-handling-optional-values.md) adds `isEmpty` and `orElse`, uses `!` and `==`, says `or` short-circuits, and fixes part of the order of precedence.
- [ADR 0018](0018-immutable-identifiers.md) makes every identifier a constant, so `:=` only ever gives a name its first value.

Before this ADR, the tokenizer recognised these symbol operators: `::`, `:=`, `<=`, `>=`, `==`, `<`, `>`, `+`, `*`, `-`, `\`, `!` and `.`, and the word operators `and` and `or`. It had no operator for division, and `\` had no meaning in any ADR.

This ADR is the single place where every operator, what it does, and its precedence are defined. Later ADRs that add an operator should update this one.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Operators

| Operator | Form | Meaning | Source |
| --- | --- | --- | --- |
| `::` | `namespace::name` | The symbol `name` in the namespace `namespace` | [ADR 0005](0005-module-namespaces.md) |
| `.` | `value.member` | A member of a value, such as a member of a map. Also names an enum member (`InvoiceStatus.paid`), the one place `.` is used on a type | [ADR 0013](0013-enums.md), [ADR 0021](0021-collections.md) |
| `( … )` | `action(arguments)` | Calls an action | [ADR 0007](0007-actions.md) |
| `[ … ]` | `a[i]` | An element of an array, or a member of a map | [ADR 0021](0021-collections.md) |
| `orElse` | `a orElse b` | The value inside the optional `a`, or `b` if `a` is empty | [ADR 0016](0016-handling-optional-values.md) |
| `isEmpty` | `isEmpty a` | Whether the optional `a` holds `NOTHING`. `a` must be an optional | [ADR 0016](0016-handling-optional-values.md) |
| `!` | `!a` | Boolean not | Used in [ADR 0016](0016-handling-optional-values.md) |
| `-` | `-a` | Negation | This ADR |
| `**` | `a ** b` | Exponentiation: `a` to the power `b` | This ADR |
| `*` | `a * b` | Multiplication | This ADR |
| `/` | `a / b` | Division. The result can be fractional: `7 / 2` is `3.5` | This ADR |
| `%` | `a % b` | Modulo | This ADR |
| `+` | `a + b` | Addition | This ADR |
| `-` | `a - b` | Subtraction | This ADR |
| `==` | `a == b` | Equality | Used in [ADR 0016](0016-handling-optional-values.md) |
| `!=` | `a != b` | Inequality: `true` exactly when `a == b` is `false` | This ADR |
| `<`, `<=`, `>`, `>=` | `a < b` | Ordering | This ADR |
| `in` | `a in b` | Whether `a` is in the collection `b` | [ADR 0021](0021-collections.md) |
| `instanceOf` | `a instanceOf T` | Whether the value `a` is of the type `T` | [ADR 0033](0033-unknown-type.md) |
| `and` | `a and b` | Boolean and, short-circuiting | [ADR 0009](0009-triggers.md) |
| `or` | `a or b` | Boolean or, short-circuiting | [ADR 0009](0009-triggers.md), [ADR 0016](0016-handling-optional-values.md) |
| `( … )` | `(a)` | Grouping | [ADR 0009](0009-triggers.md) |

`:=` is not an expression operator, and it does not produce a value of its own. It gives a value to a name in an assignment, to a default value ([ADR 0007](0007-actions.md)), to a trigger argument ([ADR 0009](0009-triggers.md)) or to an enum member ([ADR 0013](0013-enums.md)), and it gives a new value to an element or member of a collection ([ADR 0021](0021-collections.md)).

### Division, modulo and `\`

- `/` divides and `%` gives the modulo. Both are new tokens.
- `%` is a mathematical modulo: its result has the sign of the right operand, not the left. So `-7 % 3` is `2` and `7 % -3` is `-2`. This differs from JavaScript's `%`, which gives `-1` and `1`.
- `%` only works on whole numbers. A fractional operand is an error: a compile-time error when the compiler can tell, as with `7.5 % 2`, and a runtime error otherwise. At runtime it raises the built-in error `FractionalModulo` ([ADR 0023](0023-error-handling.md)).
- `\` is not an operator, and the tokenizer no longer recognises it as one. Inside a string, `\` still starts an escape ([ADR 0008](0008-strings.md)).
- A comment starts with `//` ([ADR 0007](0007-actions.md)), so the tokenizer reads `//` as the start of a comment, never as two `/` operators.

### Exponentiation, and operators Cant does not have

- `**` raises its left operand to the power of its right. It is right-associative, so `2 ** 3 ** 2` is `2 ** (3 ** 2)`, which is `512`. It binds more loosely than the prefix operators, so `-2 ** 2` is `(-2) ** 2`, which is `4`, and its right operand can be a prefix expression, as in `2 ** -1`. This differs from mathematical notation and Python, where `-2 ** 2` is `-4`, and from JavaScript, where it is a syntax error.
- There are no increment or decrement operators, `++` and `--`. Since identifiers are constants ([ADR 0018](0018-immutable-identifiers.md)), a program writes a new value instead, as in `next := count + 1`, or assigns to a collection member, as in `scores[0] := scores[0] orElse 0 + 1`.
- There are no bitwise operators. JavaScript's `&`, `|`, `^`, `~`, `<<`, `>>` and `>>>` have no equivalent in Cant.
- There is no conditional (ternary) operator, `a ? b : c`. A program chooses between values with `if` ([ADR 0007](0007-actions.md)). `?` is only used to mark optional types and parameters ([ADR 0014](0014-optionals.md)).

### Operators in `auth` rules

An `auth` rule is an ordinary expression, so every operator in this ADR can be used in one, but the rule as a whole must have the type `BOOLEAN`. The `can` and `is` predicates about `@subject` are `BOOLEAN` expressions too, and can be used in any expression, not only in an `auth` rule. A predicate names a group with `within`, not `in`, so that `in` only ever tests whether a value is in a collection ([ADR 0021](0021-collections.md)). The predicates' grammar and meaning are defined in [ADR 0010](0010-security.md).

### `::` and `.`

`::` names a symbol in a namespace, and `.` reaches a member of a value. Enums are the one exception: an enum member is written with `.` after the enum's name, as in `InvoiceStatus.paid` ([ADR 0013](0013-enums.md)), even though the enum is a type, not a value. So `billing::InvoiceStatus.paid` uses `::` to find the enum and `.` to pick its member.

### Precedence

Operators are listed from the most tightly binding to the least.

| Level | Operators | Associativity | Status |
| --- | --- | --- | --- |
| 1 | `::` | Left | Settled ([ADR 0016](0016-handling-optional-values.md)) |
| 2 | `.`, calls, `[ … ]` | Left | Settled ([ADR 0016](0016-handling-optional-values.md), [ADR 0021](0021-collections.md)) |
| 3 | `orElse` | Left | Settled ([ADR 0016](0016-handling-optional-values.md)) |
| 4 | `isEmpty`, `ignore`, `!`, unary `-` | Right (prefix) | Settled ([ADR 0023](0023-error-handling.md) adds `ignore`) |
| 5 | `**` | Right | Settled |
| 6 | `*`, `/`, `%` | Left | Settled |
| 7 | `+`, `-` | Left | Settled |
| 8 | `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `instanceOf`, `can`, `is` | None | Settled |
| 9 | `and` | Left | Settled |
| 10 | `or` | Left | Settled |

What earlier ADRs already fix:

- `::`, `.` and calls bind more tightly than `orElse`, so `FindUser(email) orElse guest` applies `orElse` to the call's result.
- `orElse` binds more tightly than `isEmpty`, arithmetic, comparison and boolean operators.
- `isEmpty` binds more tightly than comparison operators.
- `and` binds more tightly than `or`.

Putting `!` and unary `-` at the same level as `isEmpty` means that `!a orElse b` is read as `!(a orElse b)`, matching how `isEmpty` already works.

`!` binds more tightly than comparison, as in JavaScript, so `!a == b` means `(!a) == b`, not `!(a == b)`.

`orElse` binds far more tightly than JavaScript's `??`, which sits with `||` near the bottom. This is deliberate: falling back from an empty optional is usually the first thing done to it, so `a orElse 0 + 1` means `(a orElse 0) + 1`.

Making comparison non-associative means that `a == b == c` is an error, rather than comparing a `BOOLEAN` with `c`.

The `can` and `is` predicates sit at the comparison level, since each compares a subject with a permission, a role or a type. So they bind more tightly than `and` and `or`, and `@subject is User and @subject can "edit"` means `(@subject is User) and (@subject can "edit")`. A predicate's `within` clause is part of the predicate, not a separate operator.

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
- **`isEmpty` and `orElse` need an optional.** Applying either to a value that is not optional is a compile-time error ([ADR 0016](0016-handling-optional-values.md)), since checking it, or falling back from it, could never do anything.
- **Optionals.** Any operator that uses an optional's value as a `T`, such as `+` or `==`, is a compile-time error on an unchecked optional ([ADR 0014](0014-optionals.md)). `isEmpty` and `orElse` are the exceptions.
- **Enums.** At runtime, an enum value is its member's value ([ADR 0013](0013-enums.md)), so operators act on that value. Enums are compared by value: comparing two enum values compares their members' values, even if they belong to different enums, so `InvoiceStatus.paid == QuoteStatus.paid` is `true` when both members' values are `"paid"`. Comparing an enum value with a value of its enum's value type does the same, so `status == "paid"` is `true` when `status` is `InvoiceStatus.paid`.
- **`+` does not join text.** `+` is not defined on `TEXT`, so `greeting + name` is a compile-time error. Text is joined with interpolation instead, as in `"${greeting}${name}"` ([ADR 0008](0008-strings.md)).
- **Boolean operands.** The operands of `and`, `or` and `!` must be `BOOLEAN`. Any other operand, such as a `NUMBER` or a `TEXT`, is a compile-time error, so there are no "truthy" or "falsy" values.
- **Faceted values.** Two faceted values are equal if they have the same specific type and their identifiers match ([ADR 0017](0017-faceted-types.md)).
- **Mixed types.** An operator's operands must be of the same type. Combining operands of different types, such as `1 == "1"` or a `NUMBER` plus a `DATE_TIME`, is a compile-time error. The one exception is enums, which are compared by value, as above.
- **Ordering text.** `TEXT` values are ordered lexicographically, by UTF-16 code unit, as JavaScript's `<` orders strings. So `"apple" < "banana"` and `"app" < "apple"`, and every uppercase ASCII letter comes before every lowercase one, so `"Z" < "a"`.
- **What can be ordered.** `NUMBER`, `DATE_TIME` and `TEXT` values can be ordered with `<`, `<=`, `>` and `>=`, and so can enums whose value type can be. `BOOLEAN` and faceted values cannot be ordered, and ordering them is a compile-time error.
- **Arithmetic.** The arithmetic operators, `+`, `-`, `*`, `/`, `%`, `**` and unary `-`, need operands of type `NUMBER`. Any other operand, including a `DATE_TIME`, is a compile-time error. Working with dates and times, such as finding the time between two `DATE_TIME`s or moving one by a duration, is left to [ADR 0026](0026-dates-and-times.md).
- **Equality.** `==` and `!=` compare values, for every type except collections. Two `NUMBER`s, `TEXT`s, `BOOLEAN`s or `DATE_TIME`s are equal when their values are, so two `DATE_TIME`s are equal when they are the same instant. Collections are the exception: two arrays or maps are equal only if they are the same collection, not when their contents match, so `[1, 2] == [1, 2]` is `false` ([ADR 0021](0021-collections.md)).

### Grammar

This grammar puts the operators above into expressions. Each rule is one level of the precedence table, from the loosest at the top to the tightest at the bottom.

```ebnf
Expression          = OrExpression ;
OrExpression        = AndExpression, {"or", AndExpression} ;
AndExpression       = Comparison, {"and", Comparison} ;
Comparison          = AuthPredicate
                    | Additive, InstanceOfKeyword, TypeRef, ["?"]
                    | Additive, [ComparisonOperator, Additive] ;
ComparisonOperator  = "==" | "!=" | "<" | "<=" | ">" | ">=" | InKeyword ;
Additive            = Multiplicative, {("+" | "-"), Multiplicative} ;
Multiplicative      = Power, {("*" | "/" | "%"), Power} ;
Power               = Prefix, ["**", Power] ;
Prefix              = (IsEmptyKeyword | IgnoreKeyword | "!" | "-"), Prefix
                    | Fallback ;
Fallback            = Postfix, {OrElseKeyword, ["-"], Postfix} ;
Postfix             = Primary, {Suffix} ;
Suffix              = ".", (Identifier | ?keyword?)
                    | "(", [ArgumentList], ")"
                    | "[", Expression, "]" ;
Primary             = Literal | Identifier | QualifiedIdentifier | BuiltIn
                    | ArrayValue | ObjectValue | SetValue | "(", Expression, ")" ;
Literal             = StringLiteral | NumberLiteral | BooleanLiteral ;
```

Number and boolean literals are written as in JavaScript:

```ebnf
BooleanLiteral      = "true" | "false" ;
NumberLiteral       = DecimalLiteral | HexLiteral | OctalLiteral | BinaryLiteral ;
DecimalLiteral      = (DecimalInteger, [".", [Digits]] | ".", Digits), [Exponent] ;
DecimalInteger      = "0" | NonZeroDigit, [["_"], Digits] ;
Exponent            = ("e" | "E"), ["+" | "-"], Digits ;
Digits              = Digit, {["_"], Digit} ;
HexLiteral          = "0", ("x" | "X"), HexDigit, {["_"], HexDigit} ;
OctalLiteral        = "0", ("o" | "O"), OctalDigit, {["_"], OctalDigit} ;
BinaryLiteral       = "0", ("b" | "B"), BinaryDigit, {["_"], BinaryDigit} ;
```

- So `42`, `3.14`, `.5`, `5.`, `1e3`, `2.5E-4`, `1_000_000`, `0xFF`, `0o17` and `0b1010` are all `NUMBER` literals, and `true` and `false` are the `BOOLEAN` literals.
- As in JavaScript's strict mode, a decimal literal cannot start with `0` followed by another digit, so `017` is an error, not an octal number. A `_` separator must sit between two digits.
- A number literal is never negative. `-1` is unary `-` applied to the literal `1`, as in JavaScript.
- JavaScript's `BigInt` literals, such as `10n`, are not supported, since Cant has a single `NUMBER` type ([ADR 0012](0012-base-types.md)). `NaN` and `Infinity` are not literals in JavaScript either, and Cant has no names for them.

- `Comparison` has at most one operator, which makes comparisons non-associative. `AuthPredicate` is the `can` and `is` predicate defined above, at the same level.
- `Power`'s operands are `Prefix` expressions, so a prefix operator applies to the operand, not the whole power: `-2 ** 2` is `(-2) ** 2`, and `2 ** -1` is allowed. Its right operand is itself a `Power`, which makes `**` right-associative.
- `orElse`'s right operand can be negated, so `count orElse -1` and `offset orElse -step` are allowed, even though unary `-` otherwise binds more loosely than `orElse`. No other prefix operator is allowed there.
- `Prefix` contains `Fallback`, so `isEmpty a orElse b` and `!a orElse b` apply the prefix operator to the result of `orElse`.
- The three `Suffix` forms are member access ([ADR 0021](0021-collections.md)), calls ([ADR 0020](0020-action-parameters.md)) and indexing ([ADR 0021](0021-collections.md)). `Prefix` includes `isEmpty` ([ADR 0016](0016-handling-optional-values.md)) and `ignore` ([ADR 0023](0023-error-handling.md)).
- `QualifiedIdentifier` is a name in a namespace, `namespace::name` ([ADR 0005](0005-module-namespaces.md)), so `::` binds before any other operator.
- `StringLiteral` comes from [ADR 0008](0008-strings.md), `BuiltIn` from [ADR 0009](0009-triggers.md), and `ArrayValue`, `ObjectValue` and `SetValue` from [ADR 0021](0021-collections.md). `NumberLiteral` and `BooleanLiteral` are defined above.
- `NOTHING` is not a `Primary`, since it can only be written in a `return` ([ADR 0016](0016-handling-optional-values.md)).

## Deferred

- **Arithmetic errors.** Division and modulo by zero raise the built-in error `DivisionByZero`, and a fractional operand to `%` raises `FractionalModulo`, rather than giving `Infinity` or `NaN` as JavaScript does. The result of `/` or `%` must be handled like any result that may hold an error, unless the right-hand side is a non-zero constant expression ([ADR 0023](0023-error-handling.md)).

## Consequences

- Every operator, its meaning and its precedence are defined in one place, and one expression grammar serves action bodies, defaults, trigger arguments and `auth` rules.
- Developers who know JavaScript will find most of it familiar: the order of arithmetic, comparison and boolean operators, number and boolean literals, and how text is ordered.
- Some departures from JavaScript are deliberate and may surprise them: `orElse` binds much more tightly than `??`, comparisons cannot be chained, `%` is a mathematical modulo, `-2 ** 2` is `4` rather than an error, and `+` does not join text.
- Types are strict. Operands must be of the same type, boolean operators need `BOOLEAN`s and there are no "truthy" values, so more mistakes are caught at compile time, at the cost of some explicit conversion and interpolation.
- Cant leaves out several JavaScript operators: the conditional operator, `++` and `--`, and the bitwise operators. Programs use `if`, assignment and arithmetic instead.
- There is no arithmetic on `DATE_TIME`s until [ADR 0026](0026-dates-and-times.md) covers working with dates and times.
- `auth` rules can use every operator, and the `can` and `is` predicates can be used in actions too. Because predicates now name groups with `within`, the `auth` examples in [ADR 0009](0009-triggers.md) and [ADR 0010](0010-security.md), which use `in`, are out of date.
- The tokenizer now recognises `/`, `%` and `**`, no longer recognises `\`, and skips comments. The parser still has to be brought up to this grammar: it has no number or boolean literals, `isEmpty`, `orElse`, arithmetic or comparison yet, and it reads call arguments by position.
