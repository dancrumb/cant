# 0006. Imports

- **Status:** Proposed
- **Date:** 2026-11-14

## Context

A Cant module needs to use constructs defined in other modules: the standard library, third-party code and other files in the same project.

We need a single syntax for naming the module to import, saying where its symbols go, and saying what kind of module it is. That syntax builds on the namespaces from [ADR 0005](0005-module-namespaces.md).

## Decision

An import has this form:

```cant
import <module-identifier> [into <identifier>] [as <string>]
```

### Module identifiers

A module identifier is either **symbolic** or a **URL**.

A **symbolic identifier** is written bare, in the form `[<scope>::]<identifier>`. The scope is optional and defaults to `cant`, so these two imports are the same:

```cant
import IO
import cant::IO
```

A symbolic identifier is resolved to a module by a resolution algorithm that is not yet defined. That algorithm will get its own ADR.

A **URL identifier** is written as a string. The string is resolved as a URL, with the location of the importing module as the base, and the resulting URL is resolved in the usual way:

```cant
import "./greetings.cant"
import "https://example.com/cant/http.cant"
```

### `into`

`into <identifier>` names the namespace that the imported module's symbols are placed into:

```cant
import IO into io

io::write("Hello")
```

Without `into`, the symbols are placed into the current namespace: the one in effect where the `import` appears.

### `as`

`as <string>` declares the type of the imported module, so that it is interpreted correctly:

```cant
import "./config.json" as "json"
```

Without `as`, the module is treated as Cant source.

## Consequences

- Standard library modules have short names (`IO`), and third-party code can live under its own scope without clashing with them.
- Files can be imported by relative path without any extra configuration.
- `into` lets a module avoid symbol collisions between imports, using the namespaces from ADR 0005.
- Importing without `into` can bring many symbols into the current namespace at once, and two such imports can collide.
- `into` and `as` become reserved words in the `import` statement, and the tokenizer and grammar need to support them.
- Symbolic imports cannot be resolved until the resolution algorithm is defined.
- The set of module types that `as` accepts, and how each is interpreted, still needs to be defined.
