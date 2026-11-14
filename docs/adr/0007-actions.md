# 0007. Actions

- **Status:** Accepted
- **Amended by:** [0012](0012-base-types.md) (built-in types and `VOID` return types), [0013](0013-enums.md) (inline enum values), [0014](0014-optionals.md) (optional parameters, defaults and `ReturnType`)
- **Date:** 2026-11-14

## Context

An **action** is Cant's unit of behaviour: a named, typed piece of work that a trigger can invoke. The current grammar only supports a minimal form, `action Name():TYPE { ... }`, with no parameters and only expression statements.

We need to define the full shape of an action: its signature, how its body is written, and which statements a body can contain.

Expressions, and the values they are built from, are out of scope here and will be covered in a later ADR. This ADR refers to `Expression` and `Value` without defining them.

## Decision

The grammar below uses ISO/IEC 14977 EBNF: rules are written `name = definition ;`, `,` joins items in sequence, `|` separates alternatives, `[ … ]` is optional, `{ … }` repeats zero or more times, terminals are quoted, and `? … ?` marks a special sequence described in prose, such as `?indent?`. Rule names match [`cant.peggy`](../../packages/shared/src/cant.peggy) wherever that file already has the rule (`Action`, `Block`, `Statement`, `Identifier`, `StringLiteral` and so on). New rules follow the same conventions: declarations have no `Statement` suffix, keywords are `<Name>Keyword` rules, and punctuation is written inline.

### Actions

An action is declared with the `action` keyword, a signature, and an indented block that holds the action's `body`:

```ebnf
Action    = ActionKeyword, ActionSignature, ?indent?, {?comment?}, BodyKeyword, Block, ?dedent? ;
```

```cant
action Greet(name: TEXT, greeting?: TEXT := "Hello, "): TEXT
    body
        return greeting + name
```

Blocks are delimited by indentation, not braces. This replaces the earlier `{ ... }` form, which is no longer valid.

- A block starts on the line after the one that introduces it, such as an action's signature, `body`, `if` or `for`, and is indented further than that line.
- Every statement in a block has the same indentation. A line indented less ends the block; a line indented more, other than the start of a nested block, is an error.
- Spaces and tabs each count as one column of indentation.
- The parser tracks indentation itself, so the tokenizer does not emit indent and dedent tokens.

### Signatures

```ebnf
ActionSignature    = Identifier, "(", [ParameterList], ")", ":", TypeRef, ["?"] ;
ParameterList      = Parameter, {",", Parameter} ;
Parameter          = Identifier, ["?"], ":", TypeRef, DefaultValue ;
DefaultValue       = [":=", Value] ;
```

- The signature is the action's name, a parenthesised parameter list (which may be empty) and a return type.
- A `?` after the return type means the action may return `NOTHING` ([ADR 0012](0012-base-types.md), [ADR 0014](0014-optionals.md)).
- Each parameter has a name, an optional `?` marking it as optional, a type, and an optional default value.
- A default value must be a `Value`, not an arbitrary expression.
- A default value follows `:=`, the assignment operator. The source EBNF calls it `?assign?`. `:=` gives a name its value, as it also does in a trigger's `arguments` ([ADR 0009](0009-triggers.md)), and the tokenizer classes it as an operator.

### Types

```ebnf
TypeRef    = ?builtin? | Enum | Identifier | QualifiedIdentifier ;
Enum       = EnumKeyword, "(", ConstantStringLiteral, {",", ConstantStringLiteral}, ")" ;
```

A type is one of:

| Form | Example | Meaning |
| --- | --- | --- |
| Built-in | `TEXT`, `VOID` | A base type, defined in [ADR 0012](0012-base-types.md) |
| Named | `User` | A type declared elsewhere, such as an entity, a schema or an enum ([ADR 0013](0013-enums.md)) |
| Namespaced | `accounts::User` | A named type in another namespace (see [ADR 0005](0005-module-namespaces.md)) |
| Inline enum | `enum("draft", "published")` | One of a fixed set of strings, without declaring a named enum |

### Blocks and statements

```ebnf
Block        = ?indent?, {Statement | ?comment?}, ?dedent? ;
Statement    = ExpressionStatement | ReturnStatement | BreakStatement | ContinueStatement
             | ForStatement | WhileStatement | IfStatement | EnqueueStatement ;
```

| Statement | Form |
| --- | --- |
| Expression | An `Expression` on its own |
| Return | `return <expression>` |
| Break / continue | `break`, `continue` |
| For | `for <identifier> in <expression>` followed by a block |
| While | `while <expression>` followed by a block |
| If | `if <expression>` followed by a block, then optionally `else` and either a block or another `if` |
| Enqueue | `enqueue <queue> with <message>` |

### Comments

```ebnf
Comment  = "//", ? any characters up to the end of the line ? ;
```

A comment starts with `//` and runs to the end of the line. There are no block comments. A `//` inside a string is part of the string, not a comment. Wherever this grammar and later ones write `?comment?`, they mean a `Comment`.

## Consequences

- Actions can take typed parameters with defaults, and return optional values.
- Bodies get structured control flow (`if`, `for`, `while`).
- Indentation-delimited blocks make the parser track indentation, which is more complex than brace matching. Editors need to fold and indent by indentation too.
- The existing `action Name():TYPE { ... }` syntax becomes invalid.
