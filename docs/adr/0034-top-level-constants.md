# 0034. Top-level constants

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Identifiers so far only exist inside action bodies, where every identifier is a constant ([ADR 0018](0018-immutable-identifiers.md), [ADR 0030](0030-mutability.md)). Triggers are top-level, and a trigger source's parameter values must be constant expressions ([ADR 0025](0025-trigger-sources.md), [ADR 0023](0023-error-handling.md)), so without top-level constants they can only use literals, enum values and operators. Programs need a way to share a value, such as an API's base path, between several triggers.

## Decision

Top-level constants are a Cant construct: a program can declare a constant at the top level, alongside actions, models, enums and errors. A constant is declared with the `const` keyword, like the other top-level declarations, which each start with a keyword:

```ebnf
ConstDeclaration = ConstKeyword, Identifier, [":", TypeRef], ":=", Expression ;
```

```cant
const apiBase := "/api/v1"
const defaultStatus: InvoiceStatus := "draft"

trigger GetInvoice on HttpRequest
    parameters
        path := "${apiBase}/invoices/{id}"
```

A constant can declare its type, after a `:`, as a parameter does ([ADR 0007](0007-actions.md)). Its value must then have a type compatible with the declared type, as an argument must with its parameter's ([ADR 0020](0020-action-parameters.md)), so `defaultStatus` above holds the `InvoiceStatus` value `"draft"` ([ADR 0013](0013-enums.md)). A constant that does not declare its type has the type of its value.

Like other top-level declarations, a constant can be exported from its module and imported into another ([ADR 0005](0005-module-namespaces.md), [ADR 0006](0006-imports.md)), and used there with its namespace, as in `config::apiBase`.

A string that only interpolates constant expressions, such as `"${apiBase}/invoices/{id}"`, is itself a constant expression ([ADR 0023](0023-error-handling.md)), so it can be used in a trigger's parameters.

A constant's value must be a constant expression ([ADR 0023](0023-error-handling.md)), so the compiler knows it, and nothing has to run, or can fail, when the program starts. A value that is not a constant expression, such as a call to an action, is a compile-time error. Array, map and set values ([ADR 0021](0021-collections.md)) are not constant expressions, so a constant cannot hold a collection. An object value whose members' values are all constant expressions is one ([ADR 0023](0023-error-handling.md)), so a constant can hold an object, whether it is used as an anonymous model or as a model with matching fields ([ADR 0027](0027-object-shapes.md)):

```cant
const retryPolicy: RetryPolicy := { attempts := 3, backoffSeconds := 2 }
```

Each use of such a constant gives a new object, with the constant's members, so an action that changes one of its fields changes only its own object, never the constant or another action's ([ADR 0023](0023-error-handling.md)).

Action bodies can use top-level constants. A parameter, or an identifier in an action's body, can shadow a top-level constant with the same name, as a nested block can shadow a name from an enclosing one ([ADR 0018](0018-immutable-identifiers.md)).

A constant's name must be unique among the top-level names in its namespace: a constant with the same name as an action, a type or another constant in the same namespace is a compile-time error.

`const` starts a top-level declaration, so, like `model` and `error`, it is a keyword reserved everywhere.

Earlier ADRs already constrain top-level constants:

- Identifiers are immutable, so a top-level constant can never be given another value ([ADR 0030](0030-mutability.md)).
- A constant expression can use identifiers whose values the compiler knows ([ADR 0023](0023-error-handling.md)), so a top-level constant given a constant expression can be used in another constant expression, such as a trigger's parameters.
- Type names are unique within a namespace ([ADR 0013](0013-enums.md), [ADR 0027](0027-object-shapes.md)). Constants are values, not types, but their names share the same namespace (above).

## Consequences

- Triggers can share values such as base paths and schedules, and a value used in several places is written once.
- Constants are always constant expressions, so they are known at compile time, can be used wherever a constant expression is needed, such as a trigger's parameters or a divisor ([ADR 0023](0023-error-handling.md)), and cannot fail when the program starts.
- A constant can hold an object, but each use gives a new one, so no mutable state is shared between triggers through constants. The cost is that two uses of the same constant object are not equal, since objects are compared by identity.
- A constant cannot hold a collection. A program that needs a fixed list has to build it inside an action.
- Because constants can be exported and imported, a module can hold a program's configuration, such as `config::apiBase`.
- `const` becomes a keyword reserved everywhere, and the parser needs constant declarations at the top level.
