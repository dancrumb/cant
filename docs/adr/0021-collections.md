# 0021. Collections

- **Status:** Accepted
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
TypeRef     = BaseType | UnknownKeyword | Enum | ArrayType | MapType | SetType | Identifier | QualifiedIdentifier ;
ArrayType   = "[", TypeRef, "]" ;
ArrayValue  = "[", [Expression, {",", Expression}, [","]], "]" ;
Index       = Expression, "[", Expression, "]" ;
```

`ArrayType`, and `MapType` and `SetType` from later sections, are forms of `TypeRef` ([ADR 0007](0007-actions.md)).

```cant
action Total(amounts: [NUMBER]): NUMBER
    body
        // ...

Total(amounts := [10, 20, 30])
```

- `[T]` is the type of an array whose elements are all of type `T`.
- `[a, b, c]` is an array value. Its elements are expressions, separated by commas, and the last can be followed by a comma. As in an object, layout inside the brackets is free: an array can be written on one line or across several, and the line breaks and indentation inside the brackets do not open or close blocks ([ADR 0007](0007-actions.md)). Comments can appear between elements.
- An array is always written with `[` and `]`, whether its elements are literals or other expressions. Unlike the source EBNF, which has a separate `LiteralArrayValue` for constants, Cant has one form. The same goes for objects, which are always written `{ key := value, … }` (see below).
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
ObjectItem   = (Identifier | ?keyword? | StringLiteral | BuiltIn), ":=", Expression ;
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
- A member's name can be an identifier, a keyword such as `body`, or a string, for names that are not identifiers, such as `"Content-Type"`. It can also be a built-in name, but only `@entity`, and only in a test case's `subject` ([ADR 0037](0037-test-case-trigger-source.md)). Any other built-in name, or `@entity` in any other object value, is a compile-time error.
- An object cannot give the same member two values. Since every member's name is written in the source, this is a compile-time error. A name written as an identifier and the same name written as a string, such as `name` and `"name"`, are the same member.
- `value.name` reaches a member by name ([ADR 0019](0019-operators.md)). `value[expression]` reaches a member whose name is the expression's value.

The only type an object can have for now is a **map**:

- `{T}` is the type of a map: an object whose members all have values of type `T`. Which members a map has is not part of its type, so a map can have any members.
- An object value is an **anonymous model** ([ADR 0027](0027-object-shapes.md)). It can be used where a map `{T}` is expected when all its members have values of type `T`. Both objects in the example above can be `{TEXT}`s, if `address` is a `TEXT`. An object value whose members have values of different types, such as `{ name := "Ada", age := 36 }`, cannot be a map, but can be used where a model with matching fields is expected ([ADR 0027](0027-object-shapes.md)).
- A map's members cannot be optional. There is no `{T?}` type, and an unchecked optional cannot be a member's value, as with arrays. A map can itself be optional, as in `headers?: {TEXT}`.
- Reaching a member of a map, with `value.name` or `value[expression]`, gives a `T?` ([ADR 0014](0014-optionals.md)). A map's type does not say which members it has, so the compiler cannot know whether the member exists. The result is empty if the map has no such member, and must be checked before its value is used ([ADR 0016](0016-handling-optional-values.md)).
- In `value[expression]`, the expression can be of any type that can be converted to text ([ADR 0011](0011-converting-values-to-text.md)), and the member's name is that text. So `scores[2]` reaches the member named `"2"`, and `labels[InvoiceStatus.paid]` the member named `"paid"`. An expression that cannot be converted to text, such as one of type `VOID`, is a compile-time error.
- The empty object, `{}`, has the type `{NOTHING}`. It can be used wherever any map type `{T}` is expected. As with `[NOTHING]`, a program cannot write `{NOTHING}` as a type.
- Maps and arrays can be nested in each other: `{[TEXT]}` is a map of arrays, and `[{TEXT}]` is an array of maps.

```cant
action Respond(content: TEXT, headers?: {TEXT}): VOID
    body
        // ...

Respond(content := page, headers := { "Content-Type" := "text/html" })
```

Types for objects with a fixed set of members, of different types, are deferred (see below).

### Sets

A set holds any number of distinct values of one type. Unlike an array, a set has no order and no indexes: a value is either in the set or not. The type of a set whose elements are of type `T` is written `SET(T)`:

```ebnf
SetType  = SetKeyword, "(", TypeRef, ")" ;
```

```cant
action Tag(tags: SET(TEXT)): VOID
    body
        // ...
```

A set type can be used wherever a `TypeRef` can, so a set can be optional, as in `tags?: SET(TEXT)`, or nested, as in `[SET(NUMBER)]`.

A set value is written `SET(v1, v2, …)`, listing its elements, with the same layout rules as an array value: commas between elements, a trailing comma allowed, and free layout inside the parentheses. `SET()` is the empty set.

```ebnf
SetValue  = SetKeyword, "(", [Expression, {",", Expression}, [","]], ")" ;
```

```cant
Tag(tags := SET("urgent", "billing"))
```

A type and a value are never written in the same place, so `SET(TEXT)` as a type and `SET("a")` as a value cannot be confused.

`SET` is written in upper case, like the base types ([ADR 0012](0012-base-types.md)), and like them it is a keyword reserved everywhere, so it cannot be used as a name.

- **Distinct values.** Two values are the same element when they are equal by `==` ([ADR 0019](0019-operators.md)). So values are compared by value, except collections, which are compared by identity: two separate arrays with the same contents are two different elements.
- **No order or indexes.** A set's elements cannot be reached by index, so `s[i]`, assigning to `s[i]` and `delete s[i]` are compile-time errors on a set.
- **No optional elements.** As with arrays and maps, a set's elements cannot be optional.
- **Empty sets.** An empty set has the type `SET(NOTHING)`. It can be used wherever any set type `SET(T)` is expected. As with `[NOTHING]` and `{NOTHING}`, a program cannot write `SET(NOTHING)` as a type.
- **Adding a duplicate.** Adding a value that is already in a set does not change the set, and is not an error. For the same reason, a value repeated in a set value, as in `SET(1, 1, 2)`, appears in the set once.
- **Looping.** `for item in s` loops over a set's elements in an undefined but stable order: a program cannot predict the order, but as long as the set is not changed, looping over it again gives the same order. Adding or removing an element may change it. A set is converted to text like an array, with its elements joined with `", "`, and `join` works the same way; both list its elements in this order.
- **`in`.** `a in s` is `true` when `a` is an element of the set `s`.
- **Sharing and equality.** Like arrays and maps, sets are passed by reference, and two sets are equal only if they are the same set ([Sharing](#sharing), [Equality](#equality)).
- **`Collection<T>`.** A `SET(T)` is a `Collection<T>`, so `length`, `concat` and `join` work on sets. `length` gives the number of elements, and `concat` returns a new set holding the elements of both sets, their union. `keys` and `values` only take maps.

### `Collection<T>`

Arrays, maps and sets are all subtypes of an internal type, `Collection<T>`: a `[T]` is a `Collection<T>`, and so are a `{T}` and a `SET(T)`. Like `Optional<T>` ([ADR 0014](0014-optionals.md)), `Collection<T>` is used by the compiler but cannot be written in a program, so a program cannot declare a parameter, return type or identifier of that type.

An array, a map or a set can be used wherever a `Collection<T>` is expected. This is how the actions of `cant::Collections` (below) accept any kind of collection, with any element type: their parameters are `Collection<T>`s. Since a program cannot write `Collection<T>`, only actions that Cant provides can take one.

This is true of every generic type for now. `Optional<T>` and `Collection<T>` are internal, and a program cannot write a generic type, so the source EBNF's `Identifier<TypeRef>` form of `TypeRef` is not part of Cant. A program cannot declare a generic type or a generic action of its own.

### Converting collections to text

An array is converted to text by converting each element to text ([ADR 0011](0011-converting-values-to-text.md)) and joining the results, in order, with `", "` between them. There are no brackets around the result.

```cant
"Scores: ${[10, 20, 30]}"   // "Scores: 10, 20, 30"
"Tags: ${["a", "b"]}"       // "Tags: a, b"
```

- The empty array becomes the empty string, `""`.
- A nested array is converted by the same rule, so `[[1, 2], [3]]` becomes `"1, 2, 3"`.
- A slot of a sparse array that holds no element is skipped, so after `delete a[1]`, `[1, 2, 3]` becomes `"1, 3"`.
- An array's elements are never optional, so every element can be converted.

A map is converted to text by writing each member as its name, `": "` and its value converted to text, and joining the members with `", "`. Member names are written as they are, without quotes.

```cant
"Headers: ${{ "Content-Type" := "text/plain", "Cache-Control" := "no-store" }}"
// "Headers: Content-Type: text/plain, Cache-Control: no-store"
```

- The empty map becomes the empty string, `""`.
- A value that is itself a collection is converted by these rules, so `{ a := [1, 2] }` becomes `"a: 1, 2"`.

The order of a map's members is undefined, but stable:

- **Undefined.** A program cannot choose the order or predict it. It is not the order the members were added or sorted by name, and two maps with the same members can have them in different orders.
- **Stable.** As long as a map is not changed, its members always come in the same order: converting it to text twice gives the same text, and `keys` and `values` list its members in the same order as each other, so `keys(map)[i]` names the member whose value is `values(map)[i]`.
- **Changing a map can reorder it.** Adding a member to a map or deleting one ([Changing collections](#changing-collections)) may change the order of all its members.

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
- Assigning to a negative index past the start of an array, such as `a[-5] := 1` on a three-element array, is a runtime error. An array only grows at its end. It raises the built-in error `IndexBeforeStart`, which the action must declare or ignore ([ADR 0023](0023-error-handling.md)).

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
- `delete` is for collections and for the fields of models and entities, where it clears an optional field ([ADR 0027](0027-object-shapes.md), [ADR 0022](0022-entities.md)). It cannot be applied to an identifier or used to delete a stored entity, as the source EBNF's `delete invoice` did.
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

### The `cant::Collections` module

Operations on collections, whether arrays, maps or sets, are actions in a module, `cant::Collections`, rather than operators or members. A program imports it like any other module ([ADR 0006](0006-imports.md)):

```cant
import Collections into Collections

count := Collections::length(scores)
```

Without `into`, its actions are placed in the current namespace, so `import Collections` lets a program write `length(scores)`.

For now, the module has these actions:

- **`length`** gives the length of an array, or the number of members in a map, as a `NUMBER`. An array's length counts its slots, including slots with no element, so it is one more than its highest index. On a three-element array, `a[5] := 1` makes the length `6`, and deleting an element does not change it.
- **`size`** works like `length`, but skips empty slots: it gives the number of elements an array actually holds. On a three-element array, after `a[5] := 1`, `length` is `6` and `size` is `4`. For a map or a set, which have no empty slots, `size` and `length` are the same.
- **`concat(src, tgt)`** returns a new collection that holds the contents of `tgt` followed by the contents of `src`. Neither `src` nor `tgt` is changed:
  - For arrays, the new array has `tgt`'s elements, then `src`'s elements, in order. With `src` as `[3, 4]` and `tgt` as `[1, 2]`, `concat` returns `[1, 2, 3, 4]`. Slots with no element are kept: `src` starts at `tgt`'s full length, and the new array's length is the sum of the two lengths.
  - For maps, the new map has the members of both. Where both have a member with the same name, the new map has `src`'s value. With `src` as `{ b := 3, c := 4 }` and `tgt` as `{ a := 1, b := 2 }`, `concat` returns `{ a := 1, b := 3, c := 4 }`.
  - Both parameters are required, so a call names both, as in `all := Collections::concat(src := extra, tgt := scores)` ([ADR 0020](0020-action-parameters.md)).
  - Both collections must be of the same type: two arrays, or two maps, of the same element type. Anything else is a compile-time error. The new collection has that type too.
- **`join(coll, delim)`** creates a `TEXT` from the members of the collection `coll`, with the `TEXT` `delim` between them. Both parameters are required, as in `Collections::join(coll := tags, delim := " | ")`. It works like converting the collection to text ([Converting collections to text](#converting-collections-to-text)), but puts the delimiter between the members instead of `", "`. For an array, each element is converted to text, and slots with no element are skipped. For a map, each member is written as `name: value`, in the map's stable order.
- **`keys(map)`** returns a map's member names, as a `[TEXT]`.
- **`values(map)`** returns a map's member values, as a `[T]` for a `{T}`.
- `keys` and `values` only take maps. Passing an array to either is a compile-time error. They list the map's members in its stable order (see [Converting collections to text](#converting-collections-to-text)).

For sets ([Sets](#sets)), which have no indexes, so cannot be changed with `:=` or `delete`:

- **`add(set, value)`** adds `value` to `set`, changing it in place. If `value` is already in the set, the set does not change.
- **`remove(set, value)`** removes `value` from `set`, changing it in place. If `value` is not in the set, the set does not change, as `delete` does nothing for a member that is not there.
- **`intersect(first, second)`** returns a new set holding the elements that are in both `first` and `second`.
- **`difference(base, exclude)`** returns a new set holding the elements of `base` that are not in `exclude`: `base` minus `exclude`.
- **`isSubset(subset, superset)`** returns `true` when every element of `subset` is also in `superset`.

Like `concat`, which gives the union of two sets, `intersect` and `difference` change neither set. These actions only take sets, and both sets must have the same element type; anything else is a compile-time error.

More actions can be added to the module later. Actions that transform a collection, such as `map` and `filter`, need a way to pass behaviour to an action, such as lambdas or functions, which Cant does not have yet, so they are deferred (see below).

### Operators

Collections add two operators to [ADR 0019](0019-operators.md):

| Operator | Form | Meaning |
| --- | --- | --- |
| `[ … ]` | `a[i]` | An element of an array, or a member of an object. Binds as tightly as `.` and calls. |
| `in` | `a in b` | Whether `a` is in the collection `b`. Binds at the same level as the other comparisons. |

`in` means different things for arrays, maps and sets:

- **Arrays.** `a in b` is `true` when some element of `b` is equal to `a`, using `==` ([ADR 0019](0019-operators.md)). So elements are compared by value, except elements that are themselves collections, which are compared by identity. Slots with no element are skipped.
- **Maps.** `a in b` is `true` when `b` has a member whose name is `a`. It checks names, not values. As with `b[a]`, `a` can be any value that can be converted to text, and the member's name is that text.
- **Sets.** `a in b` is `true` when `a` is an element of `b`, using the same equality that decides whether two values are the same element ([Sets](#sets)).

```cant
"b" in ["a", "b"]                 // true
"Content-Type" in headers         // true when headers has a "Content-Type" member
"text/plain" in headers           // false, unless a member is named "text/plain"
```

### Looping

`for item in a` loops over the elements of an array ([Arrays](#arrays)) or a set ([Sets](#sets)). A `for` loop cannot loop over a map, and doing so is a compile-time error. To go through a map's members, loop over its names with `keys` ([The `cant::Collections` module](#the-cantcollections-module)):

```cant
for name in Collections::keys(headers)
    // headers[name] is a TEXT? here
```

## Deferred

- **Transforming collections.** Actions such as `map`, `filter` and `reduce` are deferred until Cant has lambdas or functions that can be passed to an action.

## Consequences

- Programs can hold any number of values in arrays, maps and sets, so actions can take and return lists, lookup tables and sets, and an action that needs any number of values takes an array instead of a variable number of arguments ([ADR 0020](0020-action-parameters.md)).
- Reading an element or member always gives an optional, so a missing index or name is caught by the compiler's checks on optionals rather than causing a runtime error. The cost is a check, or an `orElse`, on every read, even when the program knows the value is there.
- Collections can be changed in place and are passed by reference, so an action can change a collection its caller holds, and every name holding it sees the change. That is convenient, but a change can affect code far from where it is made.
- Collections are equal only when they are the same collection, so comparing two arrays with the same contents gives `false`, and a set can hold two arrays with the same contents.
- Sparse arrays keep indexes stable when elements are deleted, but a program has to choose between `length`, which counts empty slots, and `size`, which, like `for`, `in` and text conversion, skips them.
- Maps and sets have an undefined but stable order, so a program cannot rely on the order of `keys`, `values`, loops over sets, or their text, and two runs can produce text in different orders.
- Every map's members have one type. Objects with members of different types are anonymous models, which fit named models rather than maps ([ADR 0027](0027-object-shapes.md)).
- Operations on collections live in `cant::Collections`, typed with the internal `Collection<T>`, so a program cannot write actions of its own that work on any collection, and `map`, `filter` and `reduce` wait for lambdas or functions.
- `SET` and `delete` become keywords, and the parser has to handle array, object and set values, indexing, member assignment and `delete`. The tokenizer ends an interpolation at the first `}` ([ADR 0008](0008-strings.md)), so an object written inside `${ … }` would end it early; the tokenizer has to track nested braces before objects can be used in interpolations.
