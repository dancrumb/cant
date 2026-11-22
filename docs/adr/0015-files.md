# 0015. Files

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

[ADR 0012](0012-base-types.md) makes `FILE` a base type, for uploaded or stored documents and other blobs, but does not say what a `FILE` value is or what a program can do with one.

Other ADRs depend on the answer:

- [ADR 0011](0011-converting-values-to-text.md) needs to know how a `FILE` is converted to text.
- [ADR 0013](0013-enums.md) allows enums of any base type, but an enum value has to be a literal known at compile time.
- [ADR 0010](0010-security.md) controls who can see and change data, which files need too.

[ADR 0017](0017-faceted-types.md) makes `FILE` a faceted type. A `FILE` value can be used as a URL that points to the file, as a stream that reads it, or as a blob that holds its contents. As a faceted type, a `FILE` is converted to text and compared by its identifier facet, which is its URL. That URL can be a `data:` URL that holds the file's contents.

Files come from outside a program, such as an upload, and their contents can be large, so a program should be able to pass a file around without handling its contents until it needs them.

## Decision

### Facets

A `FILE` has exactly three facets ([ADR 0017](0017-faceted-types.md)):

| Facet | Meaning |
| --- | --- |
| URL | A URL that points to the file. This is the identifier facet, and it can be a `data:` URL. |
| Stream | A stream that reads the file's contents |
| Blob | A blob that holds the file's contents |

All three follow JavaScript semantics, and none of their types can be named in a program (ADR 0017).

### Where files come from

A program cannot create a `FILE` from nothing. A `FILE` arises in two ways:

- **Built-in keywords.** Some built-in Cant keywords, to be defined later, return a `FILE`.
- **Triggers.** Some kinds of trigger ([ADR 0009](0009-triggers.md)), such as those that deal with uploads, provide a `FILE` to the action they invoke.

Once a program has a `FILE`, it can pass it to actions and return it from them like any other value.

### No literals

There is no `FILE` literal. A program cannot write a `FILE` value in its source.

Because an enum's values must be literals ([ADR 0013](0013-enums.md)), there are no enums whose value type is `FILE`.

### Storage

The interpreter stores files. Where a file is kept, how long it lasts and when it is deleted are up to the interpreter, not the program.

### Reading and writing

A program reads a `FILE`'s contents with `IO::read`, which gives its bytes ([ADR 0042](0042-io.md)). A `FILE` can't be written to. Turning its bytes into `TEXT`, and creating a new file, are left to later additions to `cant::IO`.

### Security

For now, access to files is controlled by triggers. A program can only receive a `FILE` through a trigger or a built-in keyword, so the trigger that starts an action decides whether that action has a file to work with ([ADR 0010](0010-security.md)).

## Consequences

- A `FILE` can be passed around cheaply, by its URL, and the interpreter only reads its contents when code asks for the stream or blob facet.
- Because programs cannot create files themselves or decide where they are stored, the interpreter can manage storage in one place. The cost is that programs have no control over where files live or how long they last.
- A `FILE` has no facet for its name. Its blob facet follows JavaScript's `Blob`, which has a size and a media type, but how a program reads those depends on how facets are accessed, which is left to [ADR 0029](0029-accessing-facets.md).
- With no `FILE` literal, files cannot appear in enums, and a default value for a `FILE` parameter or field can only be an expression that gives an existing `FILE`, such as another parameter.
- Relying on triggers for file security keeps the rules simple for now, but does not let a program restrict who can read a file once it has one. That may need revisiting alongside [ADR 0010](0010-security.md).
- Until the built-in keywords are defined, programs can only receive files from triggers, pass them on, and read their bytes with `cant::IO` ([ADR 0042](0042-io.md)).
