# 0014. Optionals

- **Status:** Accepted
- **Amended by:** [0016](0016-handling-optional-values.md) (`NOTHING` cannot be compared against, so it can only be written in a `return`)
- **Date:** 2026-11-14

## Context

[ADR 0007](0007-actions.md) uses `?` in two places in an action's signature:

```cant
action FindUser(email: TEXT, includeDeleted?: BOOLEAN): User?
```

- After a parameter's name (`includeDeleted?`), it marks the parameter as optional.
- After the return type (`User?`), it means the action may return no value.

ADR 0007 defines the syntax but not what either form means in detail, or how the two relate. [ADR 0012](0012-base-types.md) adds `VOID`, which raises the question of how an action that returns nothing differs from one that may return nothing.

Cant has no `null`. A missing value is `NOTHING` ([ADR 0012](0012-base-types.md)). In languages where any value can be missing, forgetting to handle the missing case is a common source of runtime errors. Cant should make the missing case visible in the types, so the compiler can catch it.

## Decision

Optional values use the `Optional<T>` pattern. An `Optional<T>` holds either a value of type `T` or `NOTHING`.

### `Optional<T>`

`Optional<T>` is an internal type. The compiler uses it, but a program cannot write it: there is no `Optional` keyword or type name. A program gets an `Optional<T>` by marking a type as optional with `?`, and this ADR writes `T?` to mean `Optional<T>`.

An optional type can be declared in two places, with `?` in the positions [ADR 0007](0007-actions.md) gives it: after the name for a parameter (`includeDeleted?: BOOLEAN`), and after the type for a return type (`User?`). A parameter's type cannot itself be marked `?`, so `includeDeleted: BOOLEAN?` is a syntax error.

- **Parameters.** A parameter marked `?` with no default, such as `includeDeleted?: BOOLEAN`, has the type `Optional<BOOLEAN>` inside the action. If the caller passes no value for it, it is still an `Optional<BOOLEAN>`, holding `NOTHING`.

  A parameter marked `?` with a default, such as `greeting?: TEXT := "Hello, "` in [ADR 0007](0007-actions.md), is optional only for the caller. Inside the action it always has a value, either the caller's or the default, so its type there is the plain `TEXT`, not `TEXT?`, and it can be used without a check.

  Only a parameter marked `?` can have a default. A default on a parameter that is not marked `?`, such as `greeting: TEXT := "Hello, "`, is a syntax error, since a caller must always pass that parameter and the default could never be used. This narrows the `Parameter` rule in [ADR 0007](0007-actions.md), which allows a default on any parameter:

  ```ebnf
  Parameter  = Identifier, "?", ":", TypeRef, [DefaultValue]
             | Identifier, ":", TypeRef ;
  ```
- **Return types.** An action whose return type is marked `?`, such as `User?`, returns an `Optional<User>`: either a `User` or `NOTHING`.

Only an `Optional<T>` can hold `NOTHING`. A value whose type is a plain `T` always has a value of that type.

### Passing and returning optionals

A value of type `T` can be used where `T?` is expected. It stays a `T?`; it does not keep the more specific type `T`:

- A `T` can be passed to an optional parameter whose type is `T`.
- An action whose return type is `T?` can return a `T`, or `NOTHING`. Either way, the caller receives a `T?`.

An `Optional<T>` can be passed to a parameter only if that parameter is optional, with type `T`. It cannot be passed to a parameter whose type is a plain `T`, because the value might be `NOTHING`. When an `Optional<T>` that holds `NOTHING` is passed to an optional parameter:

- If the parameter has no default, it holds `NOTHING`, just as if the caller had passed no value.
- If the parameter has a default, the default is used, so the parameter still has a value inside the action.

`NOTHING` itself cannot be passed as an argument, to any parameter. A caller that wants an optional parameter to have no value leaves it out.

```cant
action Hello(greeting?: TEXT := "Hello"): VOID
    body
        // ...

Hello()           // valid: greeting is "Hello"
Hello(greeting := NOTHING)    // compile-time error: NOTHING cannot be passed as an argument
```

```cant
action FindUser(email: TEXT): User?
    body
        // ...
        return user     // valid: a User can be returned as a User?

action Greet(user: User): VOID
    body
        // ...

action Notify(user?: User): VOID
    body
        // ...

action Welcome(email: TEXT): VOID
    body
        found := FindUser(email)
        Notify(user := found)  // valid: found is a User? and Notify's parameter is optional
        Greet(found)   // compile-time error: found might be NOTHING
```

### Identifiers

An identifier cannot be declared optional explicitly. It has an optional type only when it is assigned a value that already has one, such as the result of an action that returns `T?`. In the example above, `found` has the type `User?` because `FindUser` returns a `User?`.

`NOTHING` itself cannot be assigned to an identifier, just as it cannot be passed as an argument:

```cant
found := FindUser(email)  // valid: found is a User?
missing := NOTHING        // compile-time error: NOTHING cannot be assigned
```

This narrows [ADR 0012](0012-base-types.md), which says `NOTHING` can be assigned like any other value. Within the rules here, `NOTHING` can be written only where an action returns it from a `T?` return type, or where a program compares against it.

### Using an optional's value

Using the value inside an `Optional<T>` as a `T` is a compile-time error unless the program has first checked whether it holds a `T` or `NOTHING`. This covers any use that needs a `T`, such as passing it to a parameter of type `T`, reading one of its fields, or interpolating it into a string ([ADR 0011](0011-converting-values-to-text.md)).

Once the program has checked, and the value is known to be a `T`, it can be used as a `T`. How a program checks is decided by [ADR 0016](0016-handling-optional-values.md).

Interpolating `NOTHING` itself is also a compile-time error, since `NOTHING` cannot be converted to text ([ADR 0011](0011-converting-values-to-text.md)).

### `VOID` cannot be optional

`VOID` already means there is no value, so it cannot also be optional. `VOID?` is a syntax error. The return type in an action's signature ([ADR 0007](0007-actions.md)) is either `VOID` on its own or another type with an optional `?`:

```ebnf
ActionSignature  = Identifier, "(", [ParameterList], ")", ":", ReturnType ;
ReturnType       = VoidKeyword | TypeRef, ["?"] ;
```

A `TypeRef` is never `VOID` ([ADR 0012](0012-base-types.md)), so `?` can only follow other types.

```cant
action SayHello(): VOID     // valid
action SayHello(): VOID?    // syntax error
```

## Consequences

- A value that might be missing always has an optional type, so the compiler can catch code that forgets to handle `NOTHING`. A plain `T` can never be `NOTHING`.
- Because using an unchecked optional is a compile-time error, missing values do not cause runtime errors. Programs have to check for `NOTHING` before they use a value, which is more code to write.
- Keeping `Optional<T>` internal means programs only ever write `?`, which keeps the syntax small. Making it explicit later, for example as a field type, would not break programs that use `?`.
- An optional parameter with a default needs no check inside the action, so giving a parameter a default is the simplest way to avoid handling `NOTHING`.
- Because an `Optional<T>` holding `NOTHING` behaves like a missing argument, a caller can pass an optional value straight through without checking it first. Because `NOTHING` itself cannot be passed, leaving an argument out is the only way to write "no value" in a call.
- `NOTHING` cannot be passed or assigned, so an optional only ever comes from an action's optional return or an optional parameter. Every `NOTHING` in a running program can be traced back to one of those.
- Returning a `T` from an action that returns `T?` does not narrow the result, so callers always have to check, even when an action never actually returns `NOTHING`.
- Until [ADR 0016](0016-handling-optional-values.md) decides how to check for a value, programs cannot use the value of an optional at all, only pass it on to other optional parameters.
