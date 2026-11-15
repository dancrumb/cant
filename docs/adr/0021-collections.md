# 0021. Collections

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

So far, every value in Cant holds one thing: a base value ([ADR 0012](0012-base-types.md)), an enum value ([ADR 0013](0013-enums.md)), an optional ([ADR 0014](0014-optionals.md)) or a faceted value ([ADR 0017](0017-faceted-types.md)). Real programs need values that hold several things: a list of invoices, or a set of named fields to send in a response.

Several ADRs are waiting on this:

- [ADR 0007](0007-actions.md) has a `for <identifier> in <expression>` statement, but nothing to loop over.
- [ADR 0011](0011-converting-values-to-text.md) leaves converting lists and objects to text for later.
- [ADR 0019](0019-operators.md) defines `.` as reaching a member of a value, but no values had members.

The source EBNF that Cant's grammar started from already describes two kinds of collection:

- **Arrays.** An array type is written `[T]`, an array value is written `[a, b, c]`, and an element is reached with `a[i]`.
- **Objects.** An object value is written `{ name := value … }`, and a member is reached with `.name` or `[expression]`.

It also has an `in` comparison operator, and `LiteralArrayValue` and `LiteralObjectValue` forms that hold only literals, for constants.

This ADR adopts that representation and sets out what still has to be decided.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Arrays

An array holds any number of values of one type, in order.

```ebnf
TypeRef     = BaseType | Enum | ArrayType | MapType | Identifier | QualifiedIdentifier ;
ArrayType   = "[", TypeRef, "]" ;
ArrayValue  = "[", [Expression, {",", Expression}, [","]], "]" ;
Index       = Expression, "[", Expression, "]" ;
```

`ArrayType`, and `MapType` from the next section, are forms of `TypeRef` ([ADR 0007](0007-actions.md)).

```cant
action Total(amounts: [NUMBER]): NUMBER
    body
        // ...

Total(amounts := [10, 20, 30])
```

- `[T]` is the type of an array whose elements are all of type `T`.
- `[a, b, c]` is an array value. Its elements are expressions, separated by commas, and the last can be followed by a comma. As in an object, layout inside the brackets is free: an array can be written on one line or across several, and the line breaks and indentation inside the brackets do not open or close blocks ([ADR 0007](0007-actions.md)). Comments can appear between elements.
- `a[i]` is the element of `a` at index `i`. Indexes start at 0, so `a[0]` is the first element.
- A negative index counts from the end of the array: `a[-1]` is the last element and `a[-2]` the one before it.
- A fractional index is truncated to an integer, towards zero, before it is used: `a[1.7]` is `a[1]`, and `a[-1.7]` is `a[-1]`.
- `a[i]` is optional: on a `[T]` it has the type `T?`, and must be checked before its value is used ([ADR 0016](0016-handling-optional-values.md)). An index past either end of the array, such as `a[3]` or `a[-4]` on a three-element array, gives an empty value, not an error. This matches reaching an object's member by expression, below.
- The empty array, `[]`, has the type `[NOTHING]`: it has no elements, so it has no element type. It can be used wherever any array type `[T]` is expected, so `Total(amounts := [])` is allowed. `[NOTHING]` is only the type of the empty array. A program cannot write it as a type, such as a parameter or return type.
- An array's elements cannot be optional. There is no `[T?]` type, and an unchecked optional, such as a `User?` that has not been narrowed, cannot be an element of an array value, just as it cannot be used anywhere else a `T` is expected ([ADR 0014](0014-optionals.md)). Narrow it first, or give a fallback with `orElse` ([ADR 0016](0016-handling-optional-values.md)), as in `[found orElse guest, admin]`. An array can have slots with no element, left by assigning past its end (see Changing collections), but those slots are empty, not elements that hold an empty optional.
- An array can itself be optional, like any other type: a parameter `items?: [TEXT]`, or a return type `[TEXT]?` ([ADR 0014](0014-optionals.md)).
- Arrays can be nested. `[[NUMBER]]` is an array of arrays of numbers, and `grid[1][2]` is the third element of `grid`'s second array.
- `for item in a` runs its block once for each element of `a`, in order ([ADR 0007](0007-actions.md)). It skips the slots of a sparse array that hold no element (see Changing collections), so `item` is always a `T`, never a `T?`.

### Objects and maps

An object holds values by name.

```ebnf
MapType      = "{", TypeRef, "}" ;
ObjectValue  = "{", [ObjectItem, {",", ObjectItem}, [","]], "}" ;
ObjectItem   = (Identifier | ?keyword? | StringLiteral), ":=", Expression ;
Member       = Expression, ".", (Identifier | ?keyword?) ;
```

```cant
{ name := "Ada", email := address }

{
    "Content-Type" := "text/plain",
    "Cache-Control" := "no-store",
}
```

- Items are separated by commas, and the last item can be followed by a comma. Because of this, layout inside the braces is free: an object can be written on one line or across several, and the line breaks and indentation inside the braces do not open or close blocks ([ADR 0007](0007-actions.md)). Comments can appear between items.
- Each item gives a member a value with `:=`, as a trigger argument does ([ADR 0009](0009-triggers.md)). `:=` is not an expression operator ([ADR 0019](0019-operators.md)).
- A member's name can be an identifier, a keyword such as `body`, or a string, for names that are not identifiers, such as `"Content-Type"`.
- An object cannot give the same member two values. Since every member's name is written in the source, this is a compile-time error. A name written as an identifier and the same name written as a string, such as `name` and `"name"`, are the same member.
- `value.name` reaches a member by name ([ADR 0019](0019-operators.md)). `value[expression]` reaches a member whose name is the expression's value.

The only type an object can have for now is a **map**:

- `{T}` is the type of a map: an object whose members all have values of type `T`. Which members a map has is not part of its type, so a map can have any members.
- An object value whose members all have values of type `T` is a `{T}`. Both objects in the example above are `{TEXT}`, if `address` is a `TEXT`. An object value whose members have values of different types, such as `{ name := "Ada", age := 36 }`, is a compile-time error, since it has no type until object shapes are designed (see below).
- A map's members cannot be optional. There is no `{T?}` type, and an unchecked optional cannot be a member's value, as with arrays. A map can itself be optional, as in `headers?: {TEXT}`.
- Reaching a member of a map, with `value.name` or `value[expression]`, gives a `T?` ([ADR 0014](0014-optionals.md)). A map's type does not say which members it has, so the compiler cannot know whether the member exists. The result is empty if the map has no such member, and must be checked before its value is used ([ADR 0016](0016-handling-optional-values.md)).
- In `value[expression]`, the expression can be of any type that can be converted to text ([ADR 0011](0011-converting-values-to-text.md)), and the member's name is that text. So `scores[2]` reaches the member named `"2"`, and `labels[InvoiceStatus.paid]` the member named `"paid"`. An expression that cannot be converted to text, such as one of type `VOID`, is a compile-time error.
- The empty object, `{}`, has the type `{NOTHING}`. It can be used wherever any map type `{T}` is expected. As with `[NOTHING]`, a program cannot write `{NOTHING}` as a type.
- Maps and arrays can be nested in each other: `{[TEXT]}` is a map of arrays, and `[{TEXT}]` is an array of maps.

```cant
action Respond(body: TEXT, headers?: {TEXT}): VOID
    body
        // ...

Respond(body := page, headers := { "Content-Type" := "text/html" })
```

Types for objects with a fixed set of members, of different types, are deferred (see below).

### Changing collections

A collection's contents can be changed after it is made: elements can be added to, removed from or replaced in an array, and members can be added to, removed from or replaced in a map.

Assigning to a member of a collection with `:=` changes the collection. The `AssignmentStatement` of [ADR 0007](0007-actions.md) allows a member or index as its target:

```cant
scores[0] := 10
headers.name := "x"
headers["Content-Type"] := "text/plain"
```

- The value assigned must be of the collection's element or member type: a `T` for a `[T]` or a `{T}`. Since elements and members cannot be optional, an unchecked optional cannot be assigned.
- Assigning to a member a map does not have yet adds that member.
- Arrays are sparse. Assigning to an index past the end of an array extends it, leaving a gap of slots that hold no element. They do not hold an empty optional, or anything else. On a three-element array, `a[5] := 1` makes an array that runs to index 5, with no elements at indexes 3 and 4. Reading a slot with no element, with `a[i]`, gives an empty `T?`, just as reading past the end does.
- Assigning to a negative index past the start of an array, such as `a[-5] := 1` on a three-element array, is a runtime error. An array only grows at its end. What a runtime error does is left to the future ADR on error handling.

This does not conflict with [ADR 0018](0018-immutable-identifiers.md). An identifier that holds a collection is still a constant: it always refers to the same collection, and cannot be given a different one. Only what is inside the collection changes.

### Removing members

The `delete` statement ([ADR 0007](0007-actions.md)) removes an element from an array or a member from a map:

```cant
delete scores[2]
delete headers.name
delete headers["Content-Type"]
```

`delete` is a keyword.

- Deleting an element of an array leaves a slot with no element, like the gaps in a sparse array. Later elements keep their indexes, and the array keeps its length. Reading the slot gives an empty `T?`, and `for` skips it.
- `delete` is only for collections. It cannot be applied to an identifier or used to delete a stored entity, as the source EBNF's `delete invoice` did.
- Deleting is idempotent. Deleting a member a map does not have, an empty slot, or an index outside an array does nothing, and is not an error.

### Sharing

Collections are passed by reference. Passing a collection to an action, returning one, assigning one to another identifier, or putting one in another collection does not copy it: every name that holds it refers to the same collection, so a change made through one is seen through all of them.

```cant
action Reset(scores: [NUMBER]): VOID
    body
        scores[0] := 0

totals := [5, 6, 7]
Reset(scores := totals)
// totals[0] is now 0
```

So an action can change a collection its caller holds, even though it cannot give its parameter a different collection ([ADR 0018](0018-immutable-identifiers.md)).

### Equality

Two collections are equal only if they are the same collection. `a == b` is `true` when `a` and `b` refer to one collection, and `false` when they are two collections, even if their contents are the same:

```cant
a := [1, 2, 3]
b := [1, 2, 3]
a == b  // false: two collections with the same contents
a == a  // true
```

### Operators

Collections add two operators to [ADR 0019](0019-operators.md):

| Operator | Form | Meaning |
| --- | --- | --- |
| `[ … ]` | `a[i]` | An element of an array, or a member of an object. Binds as tightly as `.` and calls. |
| `in` | `a in b` | Whether `a` is in the collection `b`. Binds at the same level as the other comparisons. |

## Open questions

These need answers before this ADR is accepted:

- **Working with collections.** How does a program get an array's length, add to it, filter it or join two arrays? With operators such as `+`, with members such as `.length`, or with actions in a built-in namespace?
- **`in`.** Does `in` on an object ask whether it has a member with that name? Can `for` loop over an object, and if so, over what? Does `in` compare elements with `==`?
- **Text conversion.** How is a collection converted to text ([ADR 0011](0011-converting-values-to-text.md))? Or is interpolating one an error?
- **Literal-only forms.** The source EBNF has `LiteralArrayValue` and `LiteralObjectValue`, for constants. Does anything still need them, now that defaults can be any expression ([ADR 0020](0020-action-parameters.md))?
- **Other collections.** Is there a need for sets, or for the generic types that the source EBNF allows in `TypeRef`, as in `Identifier<TypeRef>`?

## Deferred

- **Object shapes.** Types for objects with a fixed set of members, each with its own type, such as a user with a `TEXT` name and a `NUMBER` age, are left to a later ADR. That ADR will need to decide whether such types are declared, perhaps alongside entities, or are given by the members an object has.

## Consequences

TODO

- The tokenizer ends an interpolation at the first `}` ([ADR 0008](0008-strings.md)), so an object written inside `${ … }` would end it early. The tokenizer has to track nested braces before objects can be used in interpolations.
