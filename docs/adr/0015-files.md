# 0015. Files

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

[ADR 0012](0012-base-types.md) makes `FILE` a base type, for uploaded or stored documents and other blobs, but does not say what a `FILE` value is or what a program can do with one.

Other ADRs depend on the answer:

- [ADR 0011](0011-converting-values-to-text.md) needs to know how a `FILE` is converted to text.
- [ADR 0013](0013-enums.md) allows enums of any base type, but an enum value has to be a literal known at compile time, and there is no way yet to write a `FILE` literal.
- [ADR 0010](0010-security.md) controls who can see and change data, which files will need too.

[ADR 0017](0017-faceted-types.md) makes `FILE` a faceted type. A `FILE` value can be used as a URL that points to the file, as a stream that reads it, or as a blob that holds its contents. As a faceted type, a `FILE` is converted to text and compared by its identifier facet, which is its URL. That URL can be a `data:` URL that holds the file's contents.

TODO: Describe the forces at play, such as how programs receive files, where files are stored, and how large they can be.

## Decision

TODO

## Open questions

These need answers before this ADR is accepted:

- **Facets.** `FILE` has URL, stream and blob facets ([ADR 0017](0017-faceted-types.md)). Does it have others, such as a name, a media type or a size, or are those carried some other way?
- **Creating files.** How does a program get a `FILE`? For example, from an upload, from an action's parameter, or by creating one from `TEXT` or other data.
- **Reading files.** A program reads a `FILE` through its stream or blob facet. Can either be read as `TEXT`, and how is the text's encoding decided?
- **Storage.** Where are files stored, how long do they last, and how are they deleted?
- **Literals and enums.** Is there a way to write a `FILE` literal? If not, enums whose value type is `FILE` ([ADR 0013](0013-enums.md)) cannot be written and should be ruled out.
- **Security.** How do the rules in [ADR 0010](0010-security.md) apply to files, such as who can upload, read or delete one?

## Consequences

TODO
