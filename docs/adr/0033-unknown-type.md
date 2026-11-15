# 0033. The `UNKNOWN` type

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Sometimes the compiler cannot know the type of a value. Reading a field of a model with a name that is not a literal, as in `customer[key]` ([ADR 0027](0027-object-shapes.md)), could give any of the model's fields, and they can have different types, such as `TEXT` and `NUMBER`. Cant needs a type for a value whose type is only known at runtime.

## Decision

Cant has an `UNKNOWN` type. A value of type `UNKNOWN` can be a value of any type.

`UNKNOWN` describes what a scope knows about a value, not the value itself. The value always has its own actual type, such as `TEXT` or `NUMBER`, and carries that type with it at runtime. Only in the scope where it is typed `UNKNOWN` does the compiler not know what that type is.

- Any value can be used where an `UNKNOWN` is expected.
- A value of type `UNKNOWN` cannot be used where a more specific type is expected, or as an operand of an operator, since the compiler cannot check that it has the right type. Doing so is a compile-time error. The exceptions are `instanceOf` and equality (below).
- **Equality.** An `UNKNOWN` can be compared with `==` and `!=`, against a value of any type. The comparison uses the value's actual type and the rules for that type ([ADR 0019](0019-operators.md)). Values whose actual types differ are not equal, so this is never the compile-time error that comparing two different types otherwise is.
- **Text.** An `UNKNOWN` cannot be interpolated into a string. Doing so is a compile-time error. A program first narrows it with `instanceOf` to a type that can be converted to text ([ADR 0011](0011-converting-values-to-text.md)).
- `UNKNOWN` is written in upper case, like the base types ([ADR 0012](0012-base-types.md)), and like them is a keyword reserved everywhere.
- A program can write `UNKNOWN` wherever a type is written: as the type of a parameter, a field or a collection's elements, or as a return type. An action that accepts any value takes an `UNKNOWN` parameter, and checks it with `instanceOf`:

```cant
action Describe(value: UNKNOWN): TEXT
    body
        if value instanceOf NUMBER
            return "a number: ${value}"   // valid: value is narrowed to NUMBER
        if value instanceOf TEXT
            return "some text: ${value}"
        return "something else"           // "${value}" here would be a compile-time error
```

### `instanceOf`

`a instanceOf T` is a `BOOLEAN` that is `true` when the value `a` is of the type `T`. It checks the value's actual type at runtime, so it is how a program finds out what type an `UNKNOWN` value has. It works for every type: base types, enums, models, entities, collections and `UNKNOWN` itself.

`instanceOf` narrows the value it tests, in the same way that `isEmpty` narrows an optional ([ADR 0016](0016-handling-optional-values.md)). Where `value instanceOf TEXT` is `true`, `value` has the type `TEXT`, and can be used as one:

```cant
field := customer[key]           // UNKNOWN?
if !isEmpty field and field instanceOf TEXT
    Greet(name := field)         // valid: field is narrowed to TEXT
```

The same rules apply as for `isEmpty`: narrowing follows the logic of the whole condition, holds after an early return, and only narrows an identifier, not an expression such as a call ([ADR 0016](0016-handling-optional-values.md)).

Its right-hand side is a type, not an expression ([ADR 0007](0007-actions.md)), optionally followed by `?`, and it binds at the same level as the comparison operators ([ADR 0019](0019-operators.md)). `instanceOf` is a keyword.

How `instanceOf` treats particular types:

- **Enums.** At runtime, an enum value is its member's value ([ADR 0013](0013-enums.md)), so `a instanceOf E` is `true` when `a` is one of the enum's values, and an enum value is an instance of its value type. `"paid" instanceOf InvoiceStatus` and `InvoiceStatus.paid instanceOf TEXT` are both `true`.
- **Models.** An anonymous model is never `instanceOf` a named model, even when its members match the model's fields ([ADR 0027](0027-object-shapes.md)). Only an object of the named model is.
- **Empty collections.** An empty collection's element type is `NOTHING` ([ADR 0021](0021-collections.md)), so it is not an instance of a collection type with any other element type: `[] instanceOf [TEXT]` is `false`.
- **Optionals.** A value is checked against an optional type with `T?`. A `T` is an instance of `T?`, but a `T?` is not an instance of `T`, whether or not it holds a value. So `"Ada" instanceOf TEXT?` is `true`, and an optional `TEXT?` is `instanceOf TEXT?` but not `instanceOf TEXT`. To use the value inside an optional as a `T`, a program checks it with `isEmpty` first ([ADR 0016](0016-handling-optional-values.md)).

### `UNKNOWN` and other types

- **`NOTHING`.** An `UNKNOWN` cannot hold `NOTHING`, since only an optional can ([ADR 0014](0014-optionals.md)). An `UNKNOWN`'s actual type can itself be an optional type, though, so it can hold an optional, including an empty one. `value instanceOf TEXT?` tells whether it does.
- **`UNKNOWN?`.** An `UNKNOWN` always holds a value, while an `UNKNOWN?` may hold `NOTHING`, like any other optional. `isEmpty` and `orElse` work on an `UNKNOWN?`, but not on an `UNKNOWN` ([ADR 0016](0016-handling-optional-values.md)).
- **Collections.** `UNKNOWN` can be the element type of a collection, as in `[UNKNOWN]`, `{UNKNOWN}` or `SET(UNKNOWN)`. An element of such a collection can be an `UNKNOWN` whose actual type is an optional, including an empty one. The element's type is `UNKNOWN`, not an optional, so this does not break the rule that a collection's elements cannot be optional ([ADR 0021](0021-collections.md)), but it is the one way an optional value, or an empty one, can be stored in a collection.

Reading a field of a model by an expression that is not a literal gives an `UNKNOWN?` when the model's fields have different types ([ADR 0027](0027-object-shapes.md)).

## Consequences

- Cant can express a value whose type is only known at runtime, such as a model's field read by a computed name, and an action can accept a value of any type.
- Because the compiler cannot check an `UNKNOWN`, a program must test it with `instanceOf` before using it as a specific type. Narrowing makes that test enough, so a checked value can be used directly.
- `instanceOf` works on every type, so it also lets a program check enum values, optionals and objects at runtime. Its rules follow the rest of the type system: enums by value, named models by name, optionals only against `T?`, and empty collections only against `NOTHING`.
- Equality works on an `UNKNOWN` without a check, using its actual type, so comparing values of different types gives `false` rather than a compile-time error. Interpolation does not, so an `UNKNOWN` never turns up in text unchecked, and the empty-optional case cannot arise at runtime.
- A collection of `UNKNOWN`s can hold optional values, including empty ones, which no other collection can.
- `UNKNOWN` and `instanceOf` become keywords, and the parser needs `instanceOf` with a type on its right-hand side.
