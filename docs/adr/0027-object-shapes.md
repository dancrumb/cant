# 0027. Object shapes

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

[ADR 0021](0021-collections.md) gives objects one kind of type, the map `{T}`, whose members all have values of type `T`. An object whose members have values of different types, such as `{ name := "Ada", age := 36 }`, has no type, so writing one is a compile-time error. Programs need types for records with a fixed set of members, each with its own type.

The source EBNF that Cant's grammar started from has a `schema` declaration with `fields`, like an entity that is not stored, and uses object values with `create` and `update` to give an entity's fields.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Models

An object shape is declared with the `model` keyword. A model gives the shape a name and lists its fields in an indented block, one per line:

```ebnf
ModelDeclaration  = ModelKeyword, Identifier, ?indent?, {Field | ?comment?}, ?dedent? ;
Field             = Identifier, "?", ":", TypeRef, [DefaultValue]
                  | Identifier, ":", TypeRef ;
```

```cant
model Address
    street: TEXT
    city: TEXT
    postcode: TEXT

model Customer
    name: TEXT
    age: NUMBER
    address: Address
    tags: SET(TEXT)
    nickname?: TEXT
    country?: TEXT := "GB"
```

- A `model` declaration is a top-level construct, like an action, an enum or an entity. A model's name is a type name, so it must be unique among the type names in its namespace ([ADR 0005](0005-module-namespaces.md)). Two models, or a model and an enum ([ADR 0013](0013-enums.md)), an entity or an error ([ADR 0023](0023-error-handling.md)), with the same name in the same namespace are a compile-time error.
- Each field has a name and a type, written `name: T`, as a parameter is ([ADR 0007](0007-actions.md)). A model cannot declare two fields with the same name; doing so is a compile-time error. A field's type is a `TypeRef`, so it can be a base type, an enum, a collection, another model or an entity, but never `VOID`. A model whose fields hold entities can't be one of an entity's models, since stored entities are linked only by relations ([ADR 0035](0035-entity-relationships.md)).
- A field marked `?`, such as `nickname?: TEXT`, is **optional**: an object of the model does not have to give it a value. Reading an optional field gives a `T?` ([ADR 0014](0014-optionals.md)), which must be checked before its value is used ([ADR 0016](0016-handling-optional-values.md)). Any other field is **required**: every object of the model has a value for it. As with parameters, the `?` goes after the name, so `nickname: TEXT?` is a syntax error.
- An optional field can have a default value, written after `:=`, as in `country?: TEXT := "GB"`. `DefaultValue` is the rule from [ADR 0007](0007-actions.md), so a default can be any expression whose type is compatible with the field's. As with parameters ([ADR 0014](0014-optionals.md), [ADR 0020](0020-action-parameters.md)), only an optional field can have a default, and a field with a default always has a value: an object that leaves it out gets the default, so reading the field gives a `T`, not a `T?`.
- A default that is an expression is evaluated once, when the object is created, and its value is kept. That value is used whenever the field is left out or cleared, so clearing the field later does not evaluate the default again.
- A default can use the values of the object's other fields, by naming them, as in `displayName?: TEXT := name`. Defaults that depend on each other in a cycle the compiler can see, as in `a?: NUMBER := b` and `b?: NUMBER := a`, are a compile-time error. Otherwise, if a default's value cannot be worked out when the object is created, that raises the built-in error `DefaultUnavailable` ([ADR 0023](0023-error-handling.md)).
- The model's name is a type. It can be used wherever a `TypeRef` can, by name (`Customer`) or, from another namespace, by qualified name (`crm::Customer`, see [ADR 0005](0005-module-namespaces.md)).
- A model's fields are the members of objects of that type, so its fields can have different types, unlike a map's members ([ADR 0021](0021-collections.md)).
- `model` starts a top-level declaration, so it is a keyword reserved everywhere.

### Matching models

Models are matched by name, like enums and entities ([ADR 0013](0013-enums.md), [ADR 0017](0017-faceted-types.md)). An object of one model can be used only where that same model is expected. Two models declared separately are different types, even if they have the same fields:

```cant
model Person
    name: TEXT
    age: NUMBER

model Member
    name: TEXT
    age: NUMBER

action Greet(person: Person): VOID
    body
        // ...

action Welcome(member: Member): VOID
    body
        Greet(person := member)  // compile-time error: a Member is not a Person
```

A model can be named from another namespace by its qualified name, and it is the same model there ([ADR 0005](0005-module-namespaces.md)).

### Anonymous models

An object value, `{ name := value, … }` ([ADR 0021](0021-collections.md)), is an **anonymous model**: an object with no declared model, whose shape is given by its own members' names and types.

Named models are matched by name, but anonymous models are matched by structure. An anonymous model can be used where a named model is expected when its members match the model's fields:

- It has a member for every required field of the model.
- It may leave out optional fields. A field it leaves out is empty, or gets its default.
- Each member's value is of the type of the field it gives.
- It has no members that the model does not have. For now, an extra member is a compile-time error, rather than being ignored.

This is checked at compile time.

```cant
model Customer
    name: TEXT
    age: NUMBER
    nickname?: TEXT

action Register(customer: Customer): VOID
    body
        // ...

Register(customer := { name := "Ada", age := 36 })            // valid: nickname is optional
Register(customer := { name := "Ada" })                        // compile-time error: age is missing
Register(customer := { name := "Ada", age := "thirty-six" })   // compile-time error: age must be a NUMBER
Register(customer := { name := "Ada", age := 36, shoeSize := 9 })  // compile-time error: Customer has no shoeSize
```

An anonymous model can also be used where a map `{T}` is expected, when all its members have values of type `T` ([ADR 0021](0021-collections.md)). Any value can be used where an `UNKNOWN` is expected ([ADR 0033](0033-unknown-type.md)), so an anonymous model whose members have values of different types, such as `{ name := "Ada", age := 36 }`, can be used where a `{UNKNOWN}` is expected.

An object of a named model can be used where a `{UNKNOWN}` is expected too, but not where a map of any other type is, since a model's fields are typed by its declaration rather than by the values the object holds. It is given as a **copy**: a new map whose members are the object's fields that have values, each with its value. A field that is optional and empty isn't a member of the map. The copy is shallow, so a field that holds a collection or another object gives the map that same collection or object.

It is a copy because a map can be changed in ways a model can't: a member can be given a value of any type, deleted or added ([ADR 0021](0021-collections.md)). If the map were the object itself, changing it could leave the object without a required field, with a field of the wrong type, or with a field its model doesn't have. So changing the map never changes the object, and changing the object after the copy is made never changes the map:

```cant
action Describe(data: {UNKNOWN}): VOID
    body
        data.age := "unknown"   // changes Describe's copy only

action Register(customer: Customer): VOID
    body
        Describe(data := customer)
        customer.age            // still a NUMBER
```

An anonymous model assigned to an identifier stays anonymous in the scope where it is made. Its type is fixed by the members it was written with, and it is checked against a named model, by its structure, each time it is used where that model is expected. Inside the action it is passed to, it has the named model's type, so the action can give a value to an optional field that the anonymous model left out. Objects are passed by reference ([ADR 0021](0021-collections.md)), so the object itself now has that field, but the field is not part of the anonymous model's type, so it cannot be read through the anonymous model in its own scope:

```cant
action SetNickname(customer: Customer): VOID
    body
        customer.nickname := "Addy"

ada := { name := "Ada", age := 36 }
SetNickname(customer := ada)  // valid: ada matches Customer
ada.nickname                  // compile-time error: ada has no nickname member
```

### Reading fields

- **By name.** `value.name` gives the field's own type: a `T` for a required field, which can be used without a check, and a `T?` for an optional one. Since the compiler knows a model's fields, reading a field the model does not have with `.` is a compile-time error. This differs from a map, where `value.name` always gives a `T?` ([ADR 0021](0021-collections.md)).
- **By a literal name.** When the expression is a literal, such as `customer["name"]`, the compiler knows which field it names, so it behaves exactly like `customer.name`: it gives the field's own type, and naming a field the model does not have is a compile-time error.
- **By any other expression.** `value[expression]` gives an optional, which is empty if the model has no field with that name, as on a map ([ADR 0021](0021-collections.md)). When every field of the model has the same type `T`, it is a `T?`. When the fields have different types, the compiler cannot tell which type it will be, so it is an `UNKNOWN?` ([ADR 0033](0033-unknown-type.md)).

### Models and entities

An entity ([ADR 0022](0022-entities.md)) is essentially an aggregation of models. How an entity is built from models, and how objects of a model are used to create or update an entity, is decided in [ADR 0022](0022-entities.md).

### Fixed fields

A model's fields are mutable: an existing field can be given a new value by assignment ([ADR 0007](0007-actions.md)), as a collection's members can ([ADR 0021](0021-collections.md)). The value must be of the field's type, so an unchecked optional cannot be assigned to a required field.

```cant
customer.name := "Ada"
customer["age"] := 37
```

Since objects are passed by reference, every name that holds the object sees the change.

An object of a model always has exactly the model's fields. Fields cannot be added to it or removed from it at runtime, as members can be added to and deleted from a map ([ADR 0021](0021-collections.md)):

- `delete` does not remove a field. Applied to an optional field, as in `delete customer.nickname`, it **clears** the field: the field stays, but has no value, so reading it gives an empty `T?`. This is the only way to empty an optional field, since `NOTHING` cannot be assigned ([ADR 0014](0014-optionals.md)).
- When a cleared optional field has a default, it is set back to its default instead, so it still has a value.
- Applying `delete` to a required field is a compile-time error, or, when the field is named by an expression and the compiler cannot tell which field it is, raises the built-in error `RequiredField` at runtime ([ADR 0023](0023-error-handling.md)).
- Assigning to a field the model does not have, such as `customer.shoeSize := 9`, is a compile-time error. When the field is named by an expression, as in `customer[name] := value`, and the compiler cannot tell which field it is, assigning to a field that does not exist raises the built-in error `UnknownField` at runtime ([ADR 0023](0023-error-handling.md)).

Earlier ADRs also apply to objects of a model's type:

- Object values are written `{ name := value, … }`, with comma-separated items, free layout and trailing commas ([ADR 0021](0021-collections.md)).
- Duplicate member names are a compile-time error ([ADR 0021](0021-collections.md)).
- Objects are passed by reference, and are equal only when they are the same object ([ADR 0019](0019-operators.md), [ADR 0021](0021-collections.md)).
- An object is converted to text as its fields, written `name: value` and joined with `", "`, one layer deep ([ADR 0011](0011-converting-values-to-text.md)).

## Deferred

- **Inheritance.** A way for one model to extend another, so that an object of the extending model can be used where the other is expected, will be added later.

## Consequences

- Programs can declare records whose fields have different types, with optional fields and defaults, and use them as parameter, return and field types. Objects with members of different types are no longer an error.
- Models are matched by name, like enums and entities, so two models with the same fields cannot be swapped for each other. Sharing a shape between models waits for inheritance.
- Object literals are anonymous models, matched by structure, so a program can pass `{ … }` where a model is expected without naming it, and the compiler still checks every field. Extra members are an error, so a misspelled field is caught.
- An anonymous model's type is fixed where it is made, so a field set on the object by an action it is passed to cannot be read through it by name in the caller's scope, even though the object has it.
- Fields are mutable and objects are passed by reference, as collections are, so an action can change an object its caller holds.
- An object of a named model can be given where a `{UNKNOWN}` is expected, such as to a logger, without listing its fields. It is the one place an object is copied rather than passed by reference, so a change made through the map isn't seen through the object, unlike every other way of passing an object.
- `delete` clears an optional field, or resets it to its default, which is worked out once when the object is created. A program has to know that a field with a default can never be empty.
- Reading a field by an expression that is not a literal gives an `UNKNOWN?` on a model whose fields have different types, which a program has to check with `instanceOf` before using it as a specific type ([ADR 0033](0033-unknown-type.md)).
- `model` becomes a keyword reserved everywhere, models, enums, entities and errors share one set of type names in each namespace ([ADR 0013](0013-enums.md), [ADR 0023](0023-error-handling.md)), and top-level constants share it too ([ADR 0034](0034-top-level-constants.md)), and the parser needs model declarations and field access by name and by expression.
