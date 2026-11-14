# 0005. Module Namespaces

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

Any non-trivial language needs a way to define namespaces (in some form or another) as a way to isolate symbols.
This lets multiple modules use the same symbols within their own namespace(s) so that they don't collide with other modules' symbols.

This also factors into how importing and exporting of symbols works.

## Decision

First, let's define a **module**.

A module is a container of source code. For the vast majority of systems, this is a file. It _could_ be a string, or a character stream, or any other source of text.

A **namespace** is a labelled container of symbols; symbols, here, are identifiers that correspond to a construct in the Cant language.

Every module has a default `__main__` namespace. All constructs defined in the module belong to that namespace by default.

Within a module, a new namespace can be created using the **`namespace`** keyword, followed by a valid identifier.

The `namespace` keyword _starts_ the namespace and all constructs that follow will be placed into it. To switch back to the default namespace, one simply uses

```cant
namespace __main__
```

When referencing a symbol in Cant, one can include a namespace. For example:

```cant
nameSpace::symbolName
```

This refers to the symbol `symbolName` in the namespace `nameSpace`

If no namespace is provided, then the _current_ namespace is used. "Current" here means the namespace in which the symbol is defined.



## Consequences

Imports and exports become easier, because a module can choose to export only certain namespaces and a module can import a module into a certain namespace.