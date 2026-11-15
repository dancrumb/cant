# 0017. Faceted types

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The same thing can often be represented in several ways, and different code needs different ones. An entity stored in a database can be represented by its unique identifier or by its full contents. A file can be represented by a URL that points to it, by a stream that reads it, or by a blob that holds its contents.

Without a way to bundle these, a program has to choose one representation and convert it wherever another is needed, or pass several values around together. Code that only needs a file's URL might be handed the whole file, and code that needs the contents might be handed only an identifier and have to fetch them itself.

Cant's types so far are the base types ([ADR 0012](0012-base-types.md)), enums ([ADR 0013](0013-enums.md)), optionals ([ADR 0014](0014-optionals.md)), and types declared elsewhere, such as entities ([ADR 0010](0010-security.md)). None of them can hold more than one representation of a value.

## Decision

Cant has **faceted types**. A faceted type is a type whose values each have several representations, called **facets**. Each facet represents the same value in a different way.

A program passes a single value of a faceted type around. Code that consumes it asks for the facet that suits it best, and does not need to know how the other facets are provided.

For example:

| Faceted type | Facets |
| --- | --- |
| An entity ([ADR 0010](0010-security.md)) | Its unique identifier, `@id`; its contents |
| A file (`FILE`) | A URL that points to it; a stream that reads it; a blob that holds its contents |

An action that only needs to refer to an entity can ask for its identifier, and one that displays the entity can ask for its contents. Both are passed the same value.

### Defined by Cant

For now, only Cant defines faceted types. A program cannot declare a faceted type of its own. The faceted types are `FILE` and entities. A program declares its own entities ([ADR 0010](0010-security.md)), but what facets an entity has is defined by Cant, not by the program.

### Type compatibility

Faceted types are compatible only by their specific type:

- A value of one entity type can be used only where that same entity type is expected. A `User` cannot be used where an `Organization` is expected, even if the two have the same fields.
- A `FILE` can be used only where a `FILE` is expected.
- A `FILE` is never compatible with an entity, nor an entity with a `FILE`.

### Identifier facets

Every faceted type has one facet that is its **identifier**. The identifier decides two things:

- **Equality.** Two faceted values are equal if they have the same specific type and their identifiers match. Their other facets are not compared. A `User` and an `Organization` are never equal, even if their `@id`s match.
- **Converting to text.** A faceted value is converted to text by converting its identifier ([ADR 0011](0011-converting-values-to-text.md)).

### Creating values

Only one facet has to be provided to create a value of a faceted type. The interpreter provides the others. For example, a `FILE` created from a URL can still be read as a stream or a blob.

Facets are generally created inside the interpreter, not by the program. When code asks for a facet the value was not created with, the interpreter derives it from the facets the value already has. Deriving a facet can be expensive, such as loading an entity's contents, and can fail, such as when no entity with a given `@id` exists any more. How such failures are reported is left to a future ADR on error handling.

How a program asks for a facet, what it can do with one, and when a program can create a faceted value itself are left to a future ADR. So is whether a facet's value, such as an entity's `@id`, can be used where the faceted type is expected.

### Entities

Entities ([ADR 0010](0010-security.md)) are faceted types with exactly two facets: an identifier facet and a contents facet. An entity's identifier facet is its `@id`, a built-in value that every entity has. Built-in values such as `@id` will be defined by a future ADR.

Being faceted does not erase an entity's type. Each entity also carries its specific type, given by its name, such as `User` or `accounts::User` ([ADR 0005](0005-module-namespaces.md)). A `User` is a `User`, not just a faceted value with an identifier and contents.

An entity's `@id` is not the same as the fields it names in its `identity` ([ADR 0010](0010-security.md)). The identifier facet is always `@id`, whatever the entity's `identity` fields are, and whether or not it has any.

`@id` is provided by the Cant interpreter, not by the program, and it cannot be named in an entity's `identity`. `@id` and the `identity` fields are each unique within an entity type, so they cannot conflict: each picks out exactly one entity, and both pick out the same one.

### `FILE`

The `FILE` base type ([ADR 0012](0012-base-types.md)) is a faceted type. A `FILE` value can be used as a URL that points to the file, as a stream that reads it, or as a blob that holds its contents. Its identifier facet is its URL.

The URL, stream and blob facets follow JavaScript semantics. A URL behaves like JavaScript's `URL`, a stream like a web `ReadableStream`, and a blob like a `Blob`, so their behaviour, such as how a URL is parsed or how a stream is read once, is defined by those standards rather than by Cant.

These facet types are not available explicitly in Cant. A program cannot name a URL, stream or blob type, for example as a parameter's type or an action's return type. They exist inside the interpreter, behind the `FILE` that holds them.

The URL can be a `data:` URL, which holds the file's contents in the URL itself, where that is appropriate, such as for a `FILE` created from a blob or a stream that is not stored anywhere with a URL of its own. A `FILE` therefore always has an identifier, however it was created.

The other details of `FILE` are left to [ADR 0015](0015-files.md).

## Consequences

- Code can ask for the representation it needs without converting between them, and a value only has to be created from one representation.
- Because the interpreter derives facets, it decides how and when each one is fetched or computed, so programs cannot control that cost directly.
- Because equality and text conversion use only the identifier, two values with the same identifier are equal even if one of their other facets differs, such as an entity whose contents have changed since one of the values was loaded.
- A `FILE` with a `data:` URL is converted to text as that URL, contents and all, and is equal to another `FILE` only if their contents, and so their URLs, are the same. A large file can produce very long text.
- Because URLs, streams and blobs follow JavaScript semantics, they match what the interpreter's JavaScript runtime already provides, and their behaviour is defined by existing standards. The cost is that Cant inherits their quirks, such as a stream that can only be read once.
- Because each entity carries its specific type, an `@id` is only ever interpreted within its own entity type, so a `User` can never be passed as, or loaded as, an `Organization` by mistake.
- Only Cant can define faceted types for now, so the set is small and well understood. Programs that need several representations of their own data have to manage them some other way.
