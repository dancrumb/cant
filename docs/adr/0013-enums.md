# 0013. Enums

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

Many values can only be one of a fixed set of strings, such as the status of an invoice or the role of a member. [ADR 0007](0007-actions.md) lets a type be an inline enum, `enum("draft", "published")`, but an inline enum has no name. Each use has to repeat the full list, and a change to the list has to be made everywhere it appears.

## Decision

Cant has two ways to write an enum: an `enum` declaration, which gives it a name, and an inline enum in a type.

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md): rule names match [`cant.peggy`](../../packages/shared/src/cant.peggy) where the rule already exists, keywords are `<Name>Keyword` rules, and punctuation is written inline.

### Enum declarations

An `enum` declaration is a top-level construct, like an action or a trigger. It names the enum and lists its values in an indented block, one per line:

```ebnf
EnumDeclaration  = EnumKeyword, Identifier, ?indent?, {ConstantStringLiteral | Comment}, ?dedent? ;
```

```cant
enum InvoiceStatus
    "draft"
    "sent"
    "paid"
```

- Each value is a string with no interpolations ([ADR 0008](0008-strings.md)), because its value must be known at compile time.
- An enum has at least one value, and its values are distinct.
- The name is a type. It can be used wherever a `TypeRef` can, by name (`InvoiceStatus`) or, from another namespace, by qualified name (`billing::InvoiceStatus`, see [ADR 0005](0005-module-namespaces.md)).

```cant
action SetStatus(invoiceId: TEXT, status: InvoiceStatus): VOID
    body
        // ...
```

### Inline enums

An inline enum is still a valid `TypeRef`, as [ADR 0007](0007-actions.md) defines it:

```ebnf
Enum  = EnumKeyword, "(", ConstantStringLiteral, {",", ConstantStringLiteral}, ")" ;
```

```cant
action SetTone(tone: enum("warm", "dry")): VOID
    body
        // ...
```

An inline enum suits a set of values used in only one place. A set used in more than one place should be declared once and referred to by name.

### Keywords

`enum` starts a top-level declaration, so it is reserved everywhere. The tokenizer already treats it as a keyword. After `enum`, a name means a declaration and `(` means an inline enum, so the two cannot be confused.

## Open questions

These need answers before this ADR is accepted:

- **Compatibility.** Are two enums with the same values the same type? For example, can a value of `InvoiceStatus` be passed where `enum("draft", "sent", "paid")` is expected, or can a value of one named enum be passed where another named enum with the same values is expected?
- **Duplicate values in inline enums.** Does the rule that values are distinct also apply to inline enums, such as `enum("a", "a")`?
- **Using values.** How does a program refer to one value of an enum? Is it written as a plain string (`"paid"`), or qualified by the enum's name?
- **Values other than strings.** Is a string the only kind of enum value?

## Consequences

- A set of values can be declared once, named, and reused, so changing it means changing one place.
- Inline enums stay available for one-off sets, so simple cases don't need a separate declaration.
- Two ways to write the same thing means the language has to define how they relate, and style guidance on when to use each.
- The parser has to accept `enum` at the top level as well as in a type, and the syntax tree needs a node for enum declarations.
