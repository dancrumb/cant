# 0007. Actions

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

An **action** is Cant's unit of behaviour: a named, typed piece of work that a trigger can invoke. The current grammar only supports a minimal form, `action Name():TYPE { ... }`, with no parameters and only expression statements.

We need to define the full shape of an action: its signature, how its body is written, and which statements a body can contain.

Expressions, and the operators and literals they are built from, are defined in [ADR 0019](0019-operators.md). This ADR refers to `Expression` without defining it.

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
        return "${greeting}${name}"
```

Blocks are delimited by indentation, not braces. This replaces the earlier `{ ... }` form, which is no longer valid.

- A block starts on the line after the one that introduces it, such as an action's signature, `body`, `if` or `for`, and is indented further than that line.
- Every statement in a block has the same indentation. A line indented less ends the block; a line indented more, other than the start of a nested block, is an error.
- Spaces and tabs each count as one column of indentation.
- The parser tracks indentation itself, so the tokenizer does not emit indent and dedent tokens.

### Signatures

```ebnf
ActionSignature    = Identifier, "(", [ParameterList], ")", ":", ReturnType ;
ReturnType         = VoidKeyword | TypeRef, ["?"] ;
ParameterList      = Parameter, {",", Parameter} ;
Parameter          = Identifier, "?", ":", TypeRef, [DefaultValue]
                   | Identifier, ":", TypeRef ;
DefaultValue       = ":=", Expression ;
```

- The signature is the action's name, a parenthesised parameter list (which may be empty) and a return type.
- The return type is either `VOID`, meaning the action produces no value ([ADR 0012](0012-base-types.md)), or a `TypeRef`, optionally followed by `?`. A `?` after the return type means the action may return `NOTHING` ([ADR 0014](0014-optionals.md)). `VOID` already means there is no value, so `VOID?` is a syntax error.
- Each parameter has a name, an optional `?` marking it as optional, and a type. A parameter's type is a `TypeRef`, so it is never `VOID`.
- Only a parameter marked `?` can have a default value. A default on any other parameter is a syntax error, since a caller must always pass that parameter and the default could never be used ([ADR 0014](0014-optionals.md)).
- A default value can be any expression whose type is compatible with the parameter's ([ADR 0020](0020-action-parameters.md)).
- A default value follows `:=`, the assignment operator. The source EBNF calls it `?assign?`. `:=` gives a name its value, as it also does in a trigger's `arguments` ([ADR 0009](0009-triggers.md)), and the tokenizer classes it as an operator.
- How parameters behave inside an action, and how callers pass arguments to them, is described in [ADR 0020](0020-action-parameters.md).

### Types

```ebnf
TypeRef    = BaseType | UnknownKeyword | Enum | ArrayType | MapType | SetType | Identifier | QualifiedIdentifier ;
Enum       = EnumKeyword, "(", ConstantValue, {",", ConstantValue}, ")" ;
```

A type is one of:

| Form | Example | Meaning |
| --- | --- | --- |
| Base type | `TEXT`, `NUMBER` | A base type, defined in [ADR 0012](0012-base-types.md). `VOID` is not a `TypeRef`: it can only be a return type |
| Named | `User` | A type declared elsewhere, such as an entity, an enum ([ADR 0013](0013-enums.md)) or a model ([ADR 0027](0027-object-shapes.md)) |
| Namespaced | `accounts::User` | A named type in another namespace (see [ADR 0005](0005-module-namespaces.md)) |
| Inline enum | `enum("draft", "published")` | One of a fixed set of literal values of one base type, without declaring a named enum ([ADR 0013](0013-enums.md)) |
| Array | `[TEXT]` | An array of values of one type ([ADR 0021](0021-collections.md)) |
| Map | `{TEXT}` | A map whose members all have values of one type ([ADR 0021](0021-collections.md)) |
| Unknown | `UNKNOWN` | A value of any type, whose type is not known where it is used ([ADR 0033](0033-unknown-type.md)) |
| Set | `SET(TEXT)` | A set of distinct values of one type, with no order ([ADR 0021](0021-collections.md)) |

### Blocks and statements

```ebnf
Block        = ?indent?, {Statement | ?comment?}, ?dedent? ;
Statement    = AssignmentStatement | DeleteStatement | ExpressionStatement | ReturnStatement
             | BreakStatement | ContinueStatement | ForStatement | WhileStatement | IfStatement ;
AssignmentStatement = AssignmentTarget, ":=", Expression ;
AssignmentTarget    = Identifier | Postfix ;
DeleteStatement     = DeleteKeyword, Postfix ;
```

| Statement | Form |
| --- | --- |
| Assignment | `<identifier> := <expression>`, which gives a name its value. Every identifier is a constant, so a name can only be assigned once in a block ([ADR 0018](0018-immutable-identifiers.md)) |
| Assignment to a member | `<collection>[<index>] := <expression>` or `<collection>.<name> := <expression>`, which changes an element or member of a collection ([ADR 0021](0021-collections.md)) |
| Delete | `delete <collection>[<index>]` or `delete <collection>.<name>`, which removes an element or member of a collection ([ADR 0021](0021-collections.md)) |
| Expression | An `Expression` on its own |
| Return | `return <expression>` |
| Break / continue | `break`, `continue` |
| For | `for <identifier> in <expression>` followed by a block |
| While | `while <expression>` followed by a block |
| If | `if <expression>` followed by a block, then optionally `else` and either a block or another `if` |

In an assignment to a member and in a `delete`, the `Postfix` ([ADR 0019](0019-operators.md)) must end in a member, `.name`, or an index, `[ … ]`. `delete` only applies to collections.

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
