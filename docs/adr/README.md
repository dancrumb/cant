# Architecture Decision Records

This folder records the significant decisions made about how Cant is designed and built, and why.

Each record is a Markdown file named `NNNN-short-title.md`, numbered in the order the decisions were made. Start a new one by copying [`template.md`](template.md).

Until Cant's first major version is released, records can be edited directly: when a later decision changes an earlier one, the earlier record can be updated so that it states the current decision.

Once the major version is released, records are immutable. If a decision changes, write a new record and mark the old one as superseded by it. If a later record only narrows or extends part of an earlier one, add an **Amended by** line to the earlier record's header that links to the later record and names the part it changes. The rest of the earlier record stays as it was, so read it together with the records that amend it.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-share-language-code-in-cant-shared.md) | Share language code in `@dancrumb/cant-shared` | Accepted |
| [0003](0003-parse-with-peggy-into-a-unist-tree.md) | Parse with Peggy into a unist syntax tree | Accepted |
| [0004](0004-let-turbo-handle-build-caching.md) | Let Turborepo handle build caching | Accepted |
| [0005](0005-module-namespaces.md) | Module namespaces | Accepted |
| [0006](0006-imports.md) | Imports | Accepted |
| [0007](0007-actions.md) | Actions | Accepted |
| [0008](0008-strings.md) | Strings | Accepted |
| [0009](0009-triggers.md) | Triggers | Accepted |
| [0010](0010-security.md) | Security | Accepted |
| [0011](0011-converting-values-to-text.md) | Converting values to text | Accepted |
| [0012](0012-base-types.md) | Base types | Accepted |
| [0013](0013-enums.md) | Enums | Accepted |
| [0014](0014-optionals.md) | Optionals | Accepted |
| [0015](0015-files.md) | Files | Accepted |
| [0016](0016-handling-optional-values.md) | Handling optional values | Accepted |
| [0017](0017-faceted-types.md) | Faceted types | Accepted |
| [0018](0018-immutable-identifiers.md) | Immutable identifiers | Accepted |
| [0019](0019-operators.md) | Operators | Accepted |
| [0020](0020-action-parameters.md) | Action parameters | Accepted |
| [0021](0021-collections.md) | Collections | Accepted |
| [0022](0022-entities.md) | Entities | Accepted |
| [0023](0023-error-handling.md) | Error handling | Accepted |
| [0024](0024-built-in-values.md) | Built-in values | Accepted |
| [0025](0025-trigger-sources.md) | Trigger sources | Accepted |
| [0026](0026-dates-and-times.md) | Dates and times | Accepted |
| [0027](0027-object-shapes.md) | Object shapes | Accepted |
| [0028](0028-extending-base-types.md) | Extending base types | Accepted |
| [0029](0029-accessing-facets.md) | Accessing facets | Accepted |
| [0030](0030-mutability.md) | Mutability | Accepted |
| [0031](0031-module-resolution.md) | Module resolution | Accepted |
| [0032](0032-authentication.md) | Authentication | Accepted |
| [0033](0033-unknown-type.md) | The `UNKNOWN` type | Accepted |
| [0034](0034-top-level-constants.md) | Top-level constants | Accepted |
| [0035](0035-entity-relationships.md) | Entity relationships | Accepted |
| [0036](0036-native-modules.md) | Native modules | Accepted |
| [0037](0037-test-case-trigger-source.md) | The `TestCase` trigger source | Accepted |
| [0038](0038-namespaces-from-imports.md) | Namespaces from imports | Accepted |
| [0039](0039-compiled-programs.md) | Compiled programs | Accepted |
| [0040](0040-standard-streams.md) | Standard streams | Accepted |
| [0041](0041-formatting.md) | Formatting | Accepted |
