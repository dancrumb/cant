# 0020. Action parameters

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

An action's parameters are described piecemeal across several ADRs:

- [ADR 0007](0007-actions.md) gives the syntax of a parameter list: each parameter has a name, an optional `?`, a type and an optional default.
- [ADR 0009](0009-triggers.md) passes arguments to an action from a trigger by name, in any order.
- [ADR 0013](0013-enums.md) lets a value of an enum's value type be passed to an enum parameter, checked at compile time where possible and at runtime otherwise.
- [ADR 0014](0014-optionals.md) defines optional parameters, defaults and how `NOTHING` is passed.
- [ADR 0018](0018-immutable-identifiers.md) makes parameters constants.

Calls in earlier examples, such as `SetStatus(invoiceId, InvoiceStatus.paid)`, pass arguments by position, but no ADR says so, or says how a positional call relates to a trigger's named arguments. This ADR gathers the rules for parameters and arguments in one place and settles what is left.

## Decision

### Declaring parameters

```ebnf
ParameterList  = Parameter, {",", Parameter} ;
Parameter      = Identifier, "?", ":", TypeRef, [DefaultValue]
               | Identifier, ":", TypeRef ;
DefaultValue   = ":=", Expression ;
```

This is the `Parameter` rule from [ADR 0007](0007-actions.md).

- Each parameter has a name and a type. A parameter's type is a `TypeRef`, so it can never be `VOID` ([ADR 0012](0012-base-types.md)).
- A parameter marked `?` is **optional**: a caller can leave it out. Any other parameter is **required**.
- No two parameters in a list can have the same name. A parameter list that repeats a name is invalid.
- Only an optional parameter can have a default ([ADR 0014](0014-optionals.md)).
- A default can be any expression whose type is compatible with the parameter's: it must be a value that could be passed to that parameter. This is checked at compile time.
- A default is evaluated every time a caller leaves its parameter out, not once. A default that calls an action calls it afresh for each call that leaves the parameter out.
- A default can refer to any of the action's other parameters, as in `end?: DATE_TIME := start`.
- Parameters are not positional, so the order of a parameter list has no meaning. A default can refer to a parameter before or after it in the list.
- Defaults are evaluated in the order their references require: a default that refers to another parameter is evaluated after that parameter has its value, whether it came from the caller or from its own default.
- Defaults that refer to each other, directly or through other defaults, as in `a?: NUMBER := b, b?: NUMBER := a`, are a compile-time error.

### Inside the action

| Parameter | Type inside the action | When the caller leaves it out |
| --- | --- | --- |
| Required, `name: T` | `T` | Not allowed |
| Optional with no default, `name?: T` | `T?` | It holds `NOTHING` |
| Optional with a default, `name?: T := v` | `T` | It holds `v` |

These rules come from [ADR 0014](0014-optionals.md). Parameters are constants: an action cannot assign a new value to one ([ADR 0018](0018-immutable-identifiers.md)).

Parameters are in a block that encloses the action's body, so the body can shadow a parameter by declaring a name of its own with the same name ([ADR 0018](0018-immutable-identifiers.md)). Inside the body, the name then refers to the new value, not the parameter, even if the parameter had been narrowed.

### Passing arguments

These rules apply to every argument, whether it comes from a call or from a trigger:

- A value of type `T` can be passed to a parameter of type `T` or `T?` ([ADR 0014](0014-optionals.md)).
- An optional value `T?` can only be passed to an optional parameter of type `T`. If it holds `NOTHING`, the parameter is treated as left out, so it holds `NOTHING` or its default ([ADR 0014](0014-optionals.md)).
- `NOTHING` itself cannot be passed ([ADR 0014](0014-optionals.md)).
- A value of an enum's value type can be passed to a parameter of that enum if it is one of the enum's values ([ADR 0013](0013-enums.md)).
- A value of a faceted type can only be passed to a parameter of the same specific type ([ADR 0017](0017-faceted-types.md)), except that a `FILE` can be passed to a `ReadStream` parameter of `cant::IO` ([ADR 0042](0042-io.md)).

### Named arguments

All parameters are named. A call passes each argument as `<name> := <value>`, the same form a trigger uses in its `arguments` ([ADR 0009](0009-triggers.md)), so arguments can be given in any order:

```ebnf
Call          = Expression, "(", [ArgumentList], ")" ;
ArgumentList  = Argument, {",", Argument} ;
Argument      = Identifier, ":=", Expression
              | Identifier
              | Expression ;
```

```cant
action SetStatus(invoiceId: TEXT, status: InvoiceStatus): VOID
    body
        // ...

SetStatus(invoiceId := id, status := InvoiceStatus.paid)
SetStatus(status := InvoiceStatus.paid, invoiceId := id)  // the same call
```

An optional parameter is left out by not naming it.

There are two shorter forms:

- **Matching identifier.** If the value is an identifier with the same name as the parameter, the identifier on its own is enough. `SetStatus(invoiceId, status)` means `SetStatus(invoiceId := invoiceId, status := status)`.
- **One required parameter.** If an action has exactly one required parameter, and a call passes only that one argument, its name can be left out. `Greet(FindUser(email) orElse guest)` passes the result to `Greet`'s one required parameter, whatever it is called. A call that passes any other argument must name every argument, using `<name> := <value>` or the matching-identifier form.

```cant
action Greet(user: User, greeting?: TEXT := "Hello"): VOID
    body
        // ...

Greet(user := found)                       // named
Greet(found)                               // the one required parameter, unnamed
Greet(user := found, greeting := "Welcome") // more than one argument, so both are named
Greet(found, greeting := "Welcome")        // error: an unnamed argument must be the only one
```

If an unnamed identifier has the same name as one of the action's parameters, it is always the matching-identifier form and goes to that parameter. It is never treated as the value for the one required parameter instead:

```cant
action Act(name: TEXT, user?: User): VOID
    body
        // ...

Act(user)          // error: `user` goes to `user`, so the required `name` is missing
Act(name := user)  // passes `user` to `name`
```

### No variable numbers of arguments

An action cannot take a variable number of arguments. Every argument is passed by name, and there are no positional parameters, so there is nothing for extra arguments to fill. An action that needs any number of values takes an array parameter ([ADR 0021](0021-collections.md)), as in `Total(amounts := [10, 20, 30])`.

### Arguments in triggers

The shorter forms are only for calls. A trigger's `arguments` always name every argument in full, as `<name> := <value>` ([ADR 0009](0009-triggers.md)).

### Checking arguments

These are compile-time errors, in a call or in a trigger's `arguments`:

- Leaving out a required parameter.
- Naming a parameter the action does not have.

### Trigger arguments that may be missing

A trigger argument can draw on request or event data that may be missing, as in `user := @message.user`. An expression whose value may be missing is optional, so, like any optional value, it can only be passed to an optional parameter. If it is missing, the parameter is treated as left out.

## Consequences

- Every argument in a call says which parameter it is for, so a call reads the same as a trigger's `arguments`, and adding, removing or reordering parameters never silently changes what an existing call means.
- The shorter forms keep common calls brief: passing variables that share the parameters' names, or passing the one value an action needs. Restricting the unnamed form to calls with a single argument keeps it from being mistaken for positional passing.
- Calls are longer than in languages with positional arguments, especially when the values are expressions rather than identifiers with matching names.
- Mistakes in arguments, such as a missing required parameter or an unknown name, are caught at compile time, in calls and in triggers alike.
- Defaults that are expressions, are evaluated on each call and can refer to other parameters make defaults more useful, but the compiler has to work out the order to evaluate them in and reject cycles, and a default that calls an action can have a cost on every call that leaves its parameter out.
- Letting the body shadow a parameter is consistent with [ADR 0018](0018-immutable-identifiers.md), but it means a name in the body may not be the parameter it looks like.
- The parser currently reads call arguments by position. It has to be changed to parse named arguments and the shorter forms.
