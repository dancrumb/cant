# 0007. Actions

- **Status:** Accepted
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
action Greet(name: String, greeting?: String := "Hello, "): String
    body
        return greeting + name
```

Blocks are delimited by indentation, not braces. This replaces the `{ ... }` form that the parser accepts today.

### Signatures

```ebnf
ActionSignature    = Identifier, "(", [ParameterList], ")", ":", TypeRef, ["?"] ;
ParameterList      = Parameter, {",", Parameter} ;
Parameter          = Identifier, ["?"], ":", TypeRef, DefaultValue ;
DefaultValue       = [":=", Value] ;
```

- The signature is the action's name, a parenthesised parameter list (which may be empty) and a return type.
- A `?` after the return type means the action may return `null`.
- Each parameter has a name, an optional `?` marking it as optional, a type, and an optional default value.
- A default value must be a `Value`, not an arbitrary expression.

### Types

```ebnf
TypeRef    = ?builtin? | Enum | Identifier | QualifiedIdentifier ;
Enum       = EnumKeyword, StringLiteral, {",", StringLiteral}, ")" ;
```

A type is one of:

| Form | Example | Meaning |
| --- | --- | --- |
| Built-in | `String`, `VOID` | A built-in type |
| Named | `User` | A type declared elsewhere (entity, schema or enum) |
| Namespaced | `accounts::User` | A named type in another namespace (see [ADR 0005](0005-module-namespaces.md)) |
| Inline enum | `enum("draft", "published")` | One of a fixed set of strings |

### Blocks and statements

```ebnf
Block        = ?indent?, {Statement | ?comment?}, ?dedent? ;
Statement    = ExpressionStatement | ReturnStatement | BreakStatement | ContinueStatement
             | ForStatement | WhileStatement | IfStatement | EnqueueStatement | Queue ;
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
| Queue | `queue <name> with <identifier>` |

## Open questions

These need answers before this ADR is accepted:

- **Assignment operator.** This draft uses `:=` for default values, since the tokenizer already treats it as an operator. The source EBNF only says `?assign?`.
- **`Enum` has no opening parenthesis.** The rule ends in `")"` but never opens one. This draft assumes `EnumKeyword` matches `enum(`.
- **Built-in types.** The set of built-in types is not defined. The hello world example uses `VOID`.
- **Comments.** The syntax for `?comment?` is not defined.
- **`queue` as a statement.** `Queue` appears both at the top level and inside blocks. Is declaring a queue inside an action body intended?
- **Brace blocks.** Moving to indentation-delimited blocks means changing the existing parser, the hello world example and the tokenizer, which will need to emit indent and dedent tokens.

## Consequences

- Actions can take typed parameters with defaults, and return nullable values.
- Bodies get structured control flow (`if`, `for`, `while`).
- Indentation-delimited blocks make the tokenizer indentation-aware, which is more complex than brace matching.
- The existing `action Name():TYPE { ... }` syntax becomes invalid.
