# 0012. Base types

- **Status:** Accepted
- **Amended by:** [0014](0014-optionals.md) (`NOTHING` cannot be assigned or passed), [0016](0016-handling-optional-values.md) (`NOTHING` cannot be compared against)
- **Date:** 2026-11-14

## Context

Actions ([ADR 0007](0007-actions.md)) refer to types in their parameters and return values, and entities ([ADR 0010](0010-security.md)) refer to types in their fields. A `TypeRef` can be a built-in type, but nothing yet says which built-in types exist. Earlier examples used `String` and `VOID`.

## Decision

Cant has six base types. Their names are written in upper case, with words separated by underscores:

| Type | Values |
| --- | --- |
| `TEXT` | General strings, such as those written as string literals ([ADR 0008](0008-strings.md)) |
| `NUMBER` | Integer or decimal numbers |
| `BOOLEAN` | `true` or `false` |
| `DATE_TIME` | Timestamps |
| `FILE` | Uploaded or stored documents and other blobs |
| `VOID` | No value at all |

A base type is written as its name wherever a `TypeRef` is allowed:

```cant
action Greet(name: TEXT, greeting?: TEXT := "Hello, "): TEXT
    body
        return greeting + name

action SayHello(): VOID
    body
        IO::stdout.write("Hello World!")
```

There is a single `NUMBER` type, rather than separate integer and decimal types. A `NUMBER` with a fractional part is a 64-bit IEEE 754 double, as in JavaScript, so fractional arithmetic can lose precision: `0.1 + 0.2` is `0.30000000000000004`.

`VOID` means that there is no value. When an action's return type is `VOID`, a call to it produces nothing that can be assigned to an identifier. Assigning the result of such a call, for example with `:=`, is an error:

```cant
SayHello()              // valid
greeting := SayHello()  // error: SayHello returns VOID
```

`VOID` can only be used as an action's return type. It cannot be the type of a parameter, a field or anything else, since nothing could ever be given to or stored in it.

Other types, such as entities, enums ([ADR 0013](0013-enums.md)) and inline enums, are built from these or declared separately.

### `NOTHING`

Cant has no `null`. Instead, the absence of a value is written `NOTHING`.

- `NOTHING` is a keyword, reserved everywhere, like the base type names.
- It is a value: a program can write it, assign it and compare against it.
- An action whose return type is marked `?` ([ADR 0014](0014-optionals.md)), such as `User?`, returns either a `User` or `NOTHING`.

`NOTHING` is different from `VOID`. `VOID` is a return type that means an action produces no value at all, so its result cannot be assigned. `NOTHING` is a value that stands for a missing one, so it can be assigned like any other value.

### Keywords

The base type names and `NOTHING` are keywords, reserved everywhere. A program cannot use them as names for its own declarations, parameters or anything else, so a base type name always means the base type and `NOTHING` always means the missing value.

```ebnf
BaseType    = TextKeyword | NumberKeyword | BooleanKeyword | DateTimeKeyword | FileKeyword ;
TypeRef     = BaseType | Enum | Identifier | QualifiedIdentifier ;
ReturnType  = VoidKeyword | TypeRef, ["?"] ;
```

`BaseType` is the built-in form of `TypeRef` in [ADR 0007](0007-actions.md), which that ADR writes as `?builtin?`. `VOID` is not a `BaseType`, so a `TypeRef` can never be `VOID`. Only `ReturnType`, which [ADR 0014](0014-optionals.md) uses in an action's signature, allows it. Using `VOID` anywhere else is a syntax error.

## Consequences

- A small, fixed set of base types keeps the language easy to learn, and upper-case names make them easy to tell apart from declared types such as `User`.
- With one `NUMBER` type, programs do not have to choose between integers and decimals. Because fractional numbers are doubles, they match JavaScript and are fast, but they are not suitable for values that need exact decimals, such as money.
- Because the names are reserved, a program cannot shadow a base type, but adding a base type later reserves another name and can break programs that already use it.
- `FILE` and `DATE_TIME` are built in, so programs that store documents or timestamps do not need to define their own types for them.
- Examples in other ADRs that use `String` have to use `TEXT` instead.
