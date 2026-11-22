# 0043. Generics in the standard library

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

The actions of `cant::Collections` work on any collection, with any element type ([ADR 0021](0021-collections.md)). Their parameters are of the internal type `Collection<T>`, which an array, a map and a set all are. `concat` takes two collections of the same type and returns one of that type too, and `values` returns a `[T]` for a `{T}`.

[ADR 0021](0021-collections.md) keeps generics internal: a program can't write a generic type, or declare a generic type or action. Until now that didn't matter, since the compiler knew the standard library only by the names it exports. But a standard library module is declared in Cant, with `native` lines ([ADR 0036](0036-native-modules.md)), and the compiler checks calls against those declarations ([ADR 0042](0042-io.md)). So `cant::Collections`' declarations need a way to say "for any element type `T`" and "the same kind of collection, wherever `C` appears", which Cant's grammar couldn't express.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Type parameters and generic types

An action can declare **type parameters** after its name, each optionally with a **bound**, and a type can be a **generic type** with **type arguments**:

```ebnf
ActionSignature   = Identifier, ["<", TypeParameter, {",", TypeParameter}, ">"],
                    "(", [ParameterList], ")", ":", ReturnType, ["?"], [ErrorClauses] ;
TypeParameter     = Identifier, [":", TypeRef] ;
TypeRef           = … | GenericType ;
GenericType       = Name, "<", TypeRef, {",", TypeRef}, ">" ;
```

```cant
export action values<T>(map: {T}): [T]
    native "./Collections.js"

export action concat<C: Collection>(src: C, tgt: C): C
    native "./Collections.js"

export action length<T>(coll: Collection<T>): NUMBER
    native "./Collections.js"
```

- **Only the standard library.** Type parameters and generic types can be written only in standard library modules, the modules of the `cant` scope ([ADR 0031](0031-module-resolution.md)). In any other module, declaring type parameters, or writing a generic type, is a compile-time error, so a program still can't declare a generic action or type of its own ([ADR 0021](0021-collections.md)).
- **Scope.** A type parameter can be used anywhere in its action's signature: its parameters' types and its return type. Two type parameters of one action can't have the same name.
- **Bounds.** A type given for a type parameter must fit its bound. `<C: Collection>` means `C` stands for an array, a map or a set.
- **Generic types.** The only generic type is `Collection<T>`: an array, a map or a set of `T` ([ADR 0021](0021-collections.md)). A `[T]`, a `{T}` and a `SET(T)` can each be given where a `Collection<T>` is expected. Written without a type argument, as a bound, `Collection` is any collection of anything.
- **Not in expressions.** `<` and `>` are still comparisons in an expression. A type parameter list only follows an action's name in its declaration, and a generic type is only written where a type is.

### Calls

A call to a generic action is written like any other ([ADR 0020](0020-action-parameters.md)). A program never names the types a call's type parameters stand for: the compiler works them out from the arguments.

1. **Working out the types.** The arguments are taken in the order the action declares its parameters. Each type parameter stands for the type the first argument that mentions it gives it. A later argument gives a type parameter a wider type if its type is wider, as `[NUMBER]` is than the `[NOTHING]` of an empty array ([ADR 0021](0021-collections.md)).
2. **Checking the arguments.** Each argument is then checked against its parameter's type, with each type parameter replaced by the type it stands for, by the usual rules ([ADR 0020](0020-action-parameters.md)). So `Collections::concat(src := names, tgt := scores)`, with `names` a `[TEXT]` and `scores` a `[NUMBER]`, is a compile-time error, reported on `tgt`. A type parameter that no argument gave a type stands for anything its bound allows, so `Collections::length(5)` is an error because `5` isn't a collection.
3. **The result.** The call's result has the action's return type, with each type parameter replaced by the type it stands for. `Collections::concat(src := [1, 2], tgt := scores)` gives a `[NUMBER]`. A type parameter that no argument gave a type stands for `NOTHING`, so `values` of an empty map gives `[NOTHING]`, an empty array's type.

### `cant::Collections`

`cant::Collections` is declared in Cant, in `stdlib/Collections.cant` in `@dancrumb/cant-compiler`, as `cant::IO` is ([ADR 0042](0042-io.md)). Its actions are those of [ADR 0021](0021-collections.md), with its parameter names. `length` and `size` take `coll`, as `join` does:

| Action | Signature |
| --- | --- |
| `length` | `length<T>(coll: Collection<T>): NUMBER` |
| `size` | `size<T>(coll: Collection<T>): NUMBER` |
| `concat` | `concat<C: Collection>(src: C, tgt: C): C` |
| `join` | `join<T>(coll: Collection<T>, delim: TEXT): TEXT` |
| `keys` | `keys<T>(map: {T}): [TEXT]` |
| `values` | `values<T>(map: {T}): [T]` |
| `add` | `add<T>(set: SET(T), value: T): VOID` |
| `remove` | `remove<T>(set: SET(T), value: T): VOID` |
| `intersect` | `intersect<T>(first: SET(T), second: SET(T)): SET(T)` |
| `difference` | `difference<T>(base: SET(T), exclude: SET(T)): SET(T)` |
| `isSubset` | `isSubset<T>(subset: SET(T), superset: SET(T)): BOOLEAN` |

`add` and `remove` on a to-many navigation field are still statements that change a relationship and can raise `CardinalityViolation` from the calling action ([ADR 0035](0035-entity-relationships.md)).

### Compiled programs

A compiled program writes a type parameter as `{ "kind": "typeParameter", "name": … }` and `Collection<T>` as `{ "kind": "collection", "element": … }`, in the signatures of the standard library actions it records ([ADR 0039](0039-compiled-programs.md)). The interpreter implements those actions itself.

## Deferred

- **Generics in programs.** Letting a program declare generic actions or types, which needs this syntax and much more, such as generic models.
- **Naming type arguments.** A way for a call to give its type arguments, as in `concat<[NUMBER]>(…)`, for when they can't be worked out.
- **Other bounds and generic types.** `Collection` is the only bound and the only generic type for now. More can be added as the standard library needs them.

## Consequences

- `cant::Collections` is declared in Cant, so the compiler checks every call to it: a collection of the wrong kind or element type, or two collections that don't match, is caught at compile time, and a call's result has a precise type, so `concat` of two `[NUMBER]`s gives a `[NUMBER]`, not a value whose type isn't checked.
- A hover in the editor shows each action's generic declaration.
- The grammar is bigger, and every tool that handles declarations, such as the formatter, has to handle type parameters and generic types, though only the standard library uses them.
- Each call works out its types from its arguments alone, so a call's type parameters never depend on what the call's result is given to.
- `Collections.cant` uses type parameters and generic types, so, like `IO.cant`, it is valid only as a standard library module. The tools check it as one where it is, in `@dancrumb/cant-compiler`'s `stdlib` folder ([ADR 0042](0042-io.md)), so editing it shows no errors for them.
