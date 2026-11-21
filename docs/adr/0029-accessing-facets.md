# 0029. Accessing facets

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

[ADR 0017](0017-faceted-types.md) defines faceted types, whose values each have several facets, but leaves how a program uses them to a later ADR. A `FILE` has URL, stream and blob facets ([ADR 0015](0015-files.md)), and an entity has an `@id` and its contents.

Earlier ADRs already constrain how facets are used:

- Only Cant defines faceted types, and a value can be created from any one of its facets, with the interpreter providing the others ([ADR 0017](0017-faceted-types.md)).
- The URL, stream and blob facets follow JavaScript semantics, and their types cannot be named in a program ([ADR 0017](0017-faceted-types.md)).
- Deriving a facet can be expensive and can fail ([ADR 0017](0017-faceted-types.md)), and a failure panics ([ADR 0023](0023-error-handling.md)).
- Reading a navigation field loads the entities at its far end, so it derives a facet ([ADR 0035](0035-entity-relationships.md)).
- A faceted value's identifier decides its equality and its text ([ADR 0017](0017-faceted-types.md)).
- An entity's `@id` and `@entity` cannot be read in Cant code ([ADR 0022](0022-entities.md), [ADR 0024](0024-built-in-values.md)).
- Native code reaches a `FILE`'s facets through the `CantFile` methods `url()`, `stream()` and `blob()`, and can create a `FILE` from any one of them ([ADR 0036](0036-native-modules.md)).

## Decision

For now, Cant code cannot explicitly ask for a facet. There is no syntax for it: a program never names a facet, and never holds a facet's value. A program works with a faceted value as a whole, and the interpreter decides which facet each operation needs, and derives it when the value doesn't have it yet.

### What a program can do with a faceted value

A program can pass a faceted value to actions, return it, hold it in an identifier, a collection or a model field, and use it in these operations. Each one uses the facet shown, which the interpreter provides:

| Operation | Facet used |
| --- | --- |
| `==` and `!=`, and `in`, and deciding whether two values are the same element of a set | The identifier: a `FILE`'s URL, an entity's `@id` ([ADR 0017](0017-faceted-types.md), [ADR 0021](0021-collections.md)) |
| Converting to text, such as in an interpolation | The identifier ([ADR 0011](0011-converting-values-to-text.md)) |
| `instanceOf`, and `@subject is <type>` | None. The value's type is held in `@entity` for an entity ([ADR 0022](0022-entities.md)), and a `FILE` is always a `FILE` |
| Reading or assigning an entity's field, or `delete` on one ([ADR 0022](0022-entities.md)) | The entity's contents |
| Reading a navigation field ([ADR 0035](0035-entity-relationships.md)) | The contents of the entity, and of the entities at the far end |
| Passing a `FILE` to a native action, such as one in `cant::IO` | Whichever facets the native code asks for, with `url()`, `stream()` and `blob()` ([ADR 0036](0036-native-modules.md)) |

A `FILE`'s identifier is its URL, which it always has, even if it is a `data:` URL ([ADR 0017](0017-faceted-types.md)). So comparing a `FILE` or converting one to text never derives a facet, and never fails. Likewise, an entity always has its `@id`.

### Reading a `FILE`'s contents

Cant code can't read a `FILE`'s contents, or its URL, size or media type, itself. It does so by calling native actions that take a `FILE` ([ADR 0036](0036-native-modules.md)), such as the actions that `cant::IO` will provide to read a `FILE` as `TEXT` ([ADR 0015](0015-files.md)). So which properties of a file a program can find out, such as its size or media type, is decided by the actions those modules provide, not by the language.

### Creating faceted values

Cant code can't create a faceted value from a facet. In particular:

- A `TEXT` holding a URL can't be used where a `FILE` is expected. A program that has a URL and needs a `FILE` calls a native action that makes one ([ADR 0036](0036-native-modules.md)).
- A program can never hold an entity's `@id` ([ADR 0024](0024-built-in-values.md)), so it can never make an entity from one.

Faceted values still come only from where earlier ADRs say: triggers and built-in keywords for `FILE`s ([ADR 0015](0015-files.md)), native code ([ADR 0036](0036-native-modules.md)), and, for entities, the keywords for creating and querying them, which are still to come ([ADR 0022](0022-entities.md)).

### When facets are derived

The interpreter derives a facet only when an operation needs it, and a value keeps a facet once it has it.

An entity's contents are loaded just before the first expression that needs them is evaluated: the first expression that reads, assigns or deletes one of its fields, or reads one of its navigation fields ([ADR 0035](0035-entity-relationships.md)). Holding an entity, passing it to an action, returning it, comparing it or converting it to text never loads its contents. Once they are loaded, the entity value keeps them, so later expressions don't load them again, even if they have since changed in storage ([ADR 0017](0017-faceted-types.md)). Reading a navigation field loads the contents of each entity at its far end in the same way, just before the read is evaluated.

If an entity's contents can't be loaded, such as when no entity with its `@id` exists any more, the program panics ([ADR 0023](0023-error-handling.md)). The load is not part of any expression's result, so reading an entity's field never gives a result that has to be checked, and `return customer.name` is valid ([ADR 0023](0023-error-handling.md)). Deriving any other facet that can't be derived panics in the same way. Native code is the one place a failure can be handled: when it asks for a `FILE`'s stream or blob, it can catch the failure before it escapes ([ADR 0036](0036-native-modules.md)).

## Deferred

- **Asking for a facet.** A later ADR may let Cant code ask for a facet explicitly, such as a `FILE`'s URL as `TEXT`, or a way to read an entity's contents again after they have changed.

## Consequences

- Programs never handle URLs, streams or blobs, so the language needs no types for them, and has no syntax for facets to learn.
- The interpreter chooses which facet each operation uses, and derives it only when it is first needed, so passing a faceted value around is cheap. The cost is that a program can't see, from its syntax, which operations load data.
- An entity's contents are loaded just before the first expression that needs them, so obtaining, passing and comparing entities stays cheap, and an entity whose fields are never read is never loaded.
- A value keeps the facets it has derived, so reading several fields of an entity loads its contents once. The cost is that a program may read contents that have changed in storage since they were loaded.
- A failure to load an entity's contents panics, so reading an entity's fields never needs checking, and a program reads them as it reads a model's. The cost is that a program can't recover from an entity that has gone missing between being obtained and being read, and a panic stops the action without undoing anything ([ADR 0023](0023-error-handling.md)).
- Comparing faceted values and converting them to text only use the identifier, which every faceted value always has, so they never fail.
- Everything a program does with a `FILE`'s contents goes through native actions, such as those of `cant::IO`, so what a program can find out about a file depends on what those modules provide.
- A program can't turn a URL into a `FILE`, or an `@id` into an entity, itself, so faceted values only enter a program through triggers, built-in keywords, native code and, later, entity queries.
