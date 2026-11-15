# 0013. Enums

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Many values can only be one of a fixed set of strings, such as the status of an invoice or the role of a member. [ADR 0007](0007-actions.md) lets a type be an inline enum, `enum("draft", "published")`, but an inline enum has no name. Each use has to repeat the full list, and a change to the list has to be made everywhere it appears.

## Decision

Cant has two ways to write an enum: an `enum` declaration, which gives it a name, and an inline enum in a type.

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md): rule names match [`cant.peggy`](../../packages/shared/src/cant.peggy) where the rule already exists, keywords are `<Name>Keyword` rules, and punctuation is written inline.

### Enum declarations

An `enum` declaration is a top-level construct, like an action or a trigger. It names the enum and lists its members in an indented block, one per line:

```ebnf
EnumDeclaration  = EnumKeyword, Identifier, ?indent?, {EnumMember | Comment}, ?dedent? ;
EnumMember       = Identifier, [":=", ConstantValue] ;
```

```cant
enum Status
    Idle
    InProgress := "In Progress"
    Complete
```

Each member has a name and a value:

- The name is an identifier. A program uses it to refer to the member, as in `Status.InProgress` (see [Enum values](#enum-values)).
- The value is given after `:=`, the assignment operator ([ADR 0007](0007-actions.md)), or, if there is no `:=`, it is the member's name as `TEXT`. In `Status`, the values are `"Idle"`, `"In Progress"` and `"Complete"`.
- An assigned value must be known at compile time, so it is a literal, and a string cannot contain interpolations ([ADR 0008](0008-strings.md)). This lets a value be text that is not a valid identifier, such as `"In Progress"`.

#### Value types

An enum's values can be of any base type ([ADR 0012](0012-base-types.md)) that has literals, since every value must be a literal. That rules out `VOID`, which has no values, and `FILE`, which has no literal ([ADR 0015](0015-files.md)). An enum is homogeneous: all of its values have the same base type, which is the enum's *value type*.

```cant
enum Priority
    Low := 1
    Medium := 2
    High := 3

enum Mixed
    A := 1
    B := "two"  // error: Mixed has NUMBER and TEXT values
```

A member with no `:=` has a `TEXT` value, so in an enum whose value type is not `TEXT`, every member must use `:=`.

`ConstantValue` is a literal of a base type: a string literal with no interpolations ([ADR 0008](0008-strings.md)), or a number or boolean literal ([ADR 0019](0019-operators.md)). There are no `DATE_TIME` literals yet, so enums whose value type is `DATE_TIME` cannot be written until there are.

An enum has at least one member. Its members' names must be distinct, and so must their values, so `enum E` with members `A` and `B := "A"` is an error.

The enum's name is a type. It can be used wherever a `TypeRef` can, by name (`InvoiceStatus`) or, from another namespace, by qualified name (`billing::InvoiceStatus`, see [ADR 0005](0005-module-namespaces.md)).

Because an enum's name is a type name, it must be unique among the type names in its namespace: two enums, or an enum and a model ([ADR 0027](0027-object-shapes.md)) or an entity, with the same name in the same namespace are a compile-time error.

```cant
action SetStatus(invoiceId: TEXT, status: InvoiceStatus): VOID
    body
        // ...
```

### Type compatibility

An enum `A` is type-compatible with another enum `B` if every value in `A` is also a value in `B`. A value of `A` can then be used wherever `B` is expected. Compatibility depends on the members' values, not their names. Enums with different value types share no values, so they are never compatible. The names of the enums and the order of their members do not matter, and the rule applies to named and inline enums alike.

```cant
enum InvoiceStatus
    draft
    sent
    paid

enum QuoteStatus
    draft
    sent

enum PaymentStatus
    paid
    refunded

action SetStatus(invoiceId: TEXT, status: InvoiceStatus): VOID
    body
        // ...

action CopyQuote(quoteId: TEXT, status: QuoteStatus): VOID
    body
        SetStatus(invoiceId := quoteId, status)  // valid: every QuoteStatus value is an InvoiceStatus value

action CopyPayment(paymentId: TEXT, status: PaymentStatus): VOID
    body
        SetStatus(invoiceId := paymentId, status)  // error: "refunded" is not an InvoiceStatus value
```

Compatibility goes in one direction only. `QuoteStatus` is compatible with `InvoiceStatus`, but `InvoiceStatus` is not compatible with `QuoteStatus`, because `"paid"` is not a `QuoteStatus` value. Two enums with the same values are compatible with each other in both directions.

Where an enum is expected, a value is valid as long as it is type-compatible with that enum: an enum value whose enum is compatible, or a value of the enum's value type that is one of its values ([Converting values to enums](#converting-values-to-enums)). An enum value is always checked as an enum, by this rule. It is not treated as a value of its value type to get around it, so passing a `PaymentStatus` value where `InvoiceStatus` is expected is a compile-time error, even if the particular value is `"paid"`.

This is checked at compile time. At runtime, an enum value is just its member's value, as described under [Enum values](#enum-values).

### Enum values

A program refers to one value of a named enum by writing the enum's name, a `.`, and the member's name: `InvoiceStatus.paid` or `Status.InProgress`. From another namespace, the enum's name is qualified as usual: `billing::InvoiceStatus.paid`.

```cant
SetStatus(invoiceId, status := InvoiceStatus.paid)
```

When types are checked at runtime, a member is equivalent to its value. `InvoiceStatus.paid` is equivalent to `"paid"`, `Status.InProgress` is equivalent to `"In Progress"`, and `Priority.High` is equivalent to `3`. The runtime does not record which enum a value came from, so `InvoiceStatus.draft` and `QuoteStatus.draft` are the same value at runtime.

An enum value can be used wherever its value type is expected, and only there. A `Status` value can be used where `TEXT` is expected, and a `Priority` value where a `NUMBER` is, but a `Priority` value cannot be used where `TEXT` is expected. Interpolating an enum value into a string still works, because interpolation converts any value to text ([ADR 0011](0011-converting-values-to-text.md)).

```cant
action Describe(label: TEXT): VOID
    body
        // ...

Describe(InvoiceStatus.paid)  // valid
```

### Converting values to enums

A value of an enum's value type can be used in two places where the enum is expected, as long as it is one of the enum's values. For most of the examples here the value type is `TEXT`, but the same applies to a `NUMBER` enum such as `Priority`. Values are matched against the members' values, not their names, so `"In Progress"` is a `Status`, but `"InProgress"` is not:

- **Parameters.** A value can be passed to a parameter whose type is an enum. Inside the action, the parameter has the enum's type.
- **Return values.** An action whose return type is an enum can return a value of its value type. The returned value has the enum's type.

In both places the parameter or return type names the enum, so the value takes that enum's type. This applies to named and inline enums.

The check is made by the compiler where it can be, such as for a string literal, and at runtime as well:

```cant
SetStatus(invoiceId, status := "paid")      // valid: "paid" is a value of InvoiceStatus
SetStatus(invoiceId, status := "refunded")  // compile-time error: "refunded" is not a value of InvoiceStatus
SetTone("warm")                             // valid: "warm" is a value of enum("warm", "dry")
SetPriority(taskId, priority := 3)          // valid: 3 is a value of Priority

action DefaultStatus(): InvoiceStatus
    body
        return "draft"  // valid: "draft" is a value of InvoiceStatus

action ParseStatus(code: TEXT): InvoiceStatus
    body
        return code     // checked at runtime: an error if code is not a value of InvoiceStatus
```

If the check fails at runtime, the call fails with an error rather than passing or returning a value that is not in the enum. What kind of error that is, and how a caller can handle it, is left to [ADR 0023](0023-error-handling.md).

### Inline enums

An inline enum is still a valid `TypeRef`, as [ADR 0007](0007-actions.md) defines it:

```ebnf
Enum  = EnumKeyword, "(", ConstantValue, {",", ConstantValue}, ")" ;
```

```cant
action SetTone(tone: enum("warm", "dry")): VOID
    body
        // ...
```

An inline enum lists values only. Its values follow the same rules as a named enum's: they can be of any base type that has literals, and they must all have the same type, so `enum(1, "two")` is an error. Its members have no names, so `:=` is not used, and a program passes one of its values directly ([Converting values to enums](#converting-values-to-enums)).

Like a named enum, an inline enum cannot have duplicate values, so `enum("a", "a")` is an error.

An inline enum suits a set of values used in only one place. A set used in more than one place should be declared once and referred to by name.

### Keywords

`enum` starts a top-level declaration, so it is reserved everywhere. The tokenizer already treats it as a keyword. After `enum`, a name means a declaration and `(` means an inline enum, so the two cannot be confused.

## Consequences

- A set of values can be declared once, named, and reused, so changing it means changing one place.
- Because compatibility depends on values rather than names, an enum that is a subset of another, such as a narrower set of statuses, can be used wherever the wider one is expected without any conversion. The cost is that two unrelated enums that happen to share values, such as invoice and quote statuses, can be mixed up without an error.
- Adding a value to an enum can make it stop being compatible with enums it used to fit into, so the change can break code far from the declaration.
- At runtime, enum values are plain values of their value type, such as strings or numbers, so they need no special representation and can be stored, compared and sent like any other value.
- Enums can hold numbers, booleans and dates as well as text, so codes and levels such as priorities can be enums. Because each enum is homogeneous, an enum value always has one known value type.
- Because a value of an enum's value type can be passed or returned where the enum is expected, callers can write `"paid"` instead of `InvoiceStatus.paid`, and outside data, such as user input, can be turned into an enum without a separate conversion step. A literal does not show which enum it belongs to, but a misspelled one is still caught at compile time.
- Values that cannot be checked at compile time are checked at runtime, so the runtime has to know each enum's values, and a call can fail at runtime because of a bad value.
- Inline enums stay available for one-off sets, so simple cases don't need a separate declaration.
- Two ways to write the same thing means the language has to define how they relate, and style guidance on when to use each.
- Members have names for code and values for data, so a value can be any text, such as a label shown to people or a code from another system, while code still refers to it by a valid identifier. Renaming a member changes code but not stored data, as long as its value is assigned with `:=`.
- The parser has to accept `enum` at the top level as well as in a type, and the syntax tree needs a node for enum declarations.
