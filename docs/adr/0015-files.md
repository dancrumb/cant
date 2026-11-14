# 0015. Files

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

[ADR 0012](0012-base-types.md) makes `FILE` a base type, for uploaded or stored documents and other blobs, but does not say what a `FILE` value is or what a program can do with one.

Other ADRs depend on the answer:

- [ADR 0011](0011-converting-values-to-text.md) needs to know how a `FILE` is converted to text.
- [ADR 0013](0013-enums.md) allows enums of any base type, but an enum value has to be a literal known at compile time, and there is no way yet to write a `FILE` literal.
- [ADR 0010](0010-security.md) controls who can see and change data, which files will need too.

TODO: Describe the forces at play, such as how programs receive files, where files are stored, and how large they can be.

## Decision

TODO

## Open questions

These need answers before this ADR is accepted:

- **What a `FILE` holds.** Is a `FILE` its contents, a reference to stored contents, or both? What else does it carry, such as a name, a media type and a size?
- **Creating files.** How does a program get a `FILE`? For example, from an upload, from an action's parameter, or by creating one from `TEXT` or other data.
- **Reading files.** How does a program read a `FILE`'s contents, and in what form, such as `TEXT` or bytes?
- **Storage.** Where are files stored, how long do they last, and how are they deleted?
- **Converting to text.** What does a `FILE` become when it is converted to text ([ADR 0011](0011-converting-values-to-text.md))? For example, its name, a link to it, its contents, or an error?
- **Literals and enums.** Is there a way to write a `FILE` literal? If not, enums whose value type is `FILE` ([ADR 0013](0013-enums.md)) cannot be written and should be ruled out.
- **Comparing files.** When are two `FILE` values equal? For example, when they are the same stored file, or when their contents are the same.
- **Security.** How do the rules in [ADR 0010](0010-security.md) apply to files, such as who can upload, read or delete one?

## Consequences

TODO
