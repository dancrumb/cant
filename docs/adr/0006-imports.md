# 0006. Imports

- **Status:** Accepted
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

A symbolic identifier is resolved to a module by a resolution algorithm that is not yet defined. That algorithm is the subject of [ADR 0031](0031-module-resolution.md).

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

### Exports

`export` can precede a top-level declaration, to export it from its module:

```ebnf
Module       = {TopLevel | ?comment?} ;
TopLevel     = Import | Namespace | Trigger | Permissions | Relation
             | [ExportKeyword], Declaration | ReExport ;
Declaration  = Action | EnumDeclaration | ModelDeclaration | Entity
             | ErrorDeclaration | ConstDeclaration ;
ReExport     = ExportKeyword, (Identifier | QualifiedIdentifier), [AsKeyword, Identifier] ;
```

```cant
export const apiBase := "/api/v1"

export error UserNotFound

export action FindUser(email: TEXT): User raises UserNotFound
    body
        // ...
```

`Declaration` lists the top-level constructs that can be exported: actions ([ADR 0007](0007-actions.md)), enums ([ADR 0013](0013-enums.md)), models ([ADR 0027](0027-object-shapes.md)), entities ([ADR 0022](0022-entities.md)), errors ([ADR 0023](0023-error-handling.md)) and constants ([ADR 0034](0034-top-level-constants.md)). Triggers ([ADR 0009](0009-triggers.md)), `permissions` declarations ([ADR 0010](0010-security.md)) and relations ([ADR 0035](0035-entity-relationships.md)) are top-level too, but cannot be exported, since nothing refers to them by name. `Import` is an import as above, and `Namespace` is a `namespace` line ([ADR 0005](0005-module-namespaces.md)).

A construct that is not exported is private to its module: a module that imports it cannot see or use it. `export` starts a top-level construct, so it is a keyword reserved everywhere.

A module can also export a symbol it imports, by naming it after `export` on a line of its own. The symbol is named as the module sees it, so with its namespace if it was imported `into` one:

```cant
import "./users.cant" into accounts

export accounts::FindUser
```

- The symbol is exported under its own name, `FindUser`, as if the module had declared it. A module that imports this one places it with its own `into`, or in its current namespace, as it does the module's own declarations. The namespace the re-exporting module used is not part of the name.
- `as <identifier>` exports the symbol under a new name instead, as in `export accounts::FindUser as LookupUser`. Modules that import this one see only the new name. The symbol keeps its own name inside the re-exporting module, and in the module that declared it. Renaming is only for re-exports: a module's own declarations are exported under the names they are declared with.
- The name must be a symbol that the module imports, and that its own module exports. Naming anything else, including one of the module's own declarations, is a compile-time error: a module exports its own declarations by putting `export` before them.
- A module cannot export two symbols with the same name, whether it declared them or imported them, and whether the name is a symbol's own or one given with `as`. Doing so is a compile-time error. Renaming is a way around it, so a module can re-export two imported symbols that share a name, as long as it renames at least one of them.
- Only a single symbol can be re-exported this way. There is no way to re-export everything a module imports, so `export import IO` is a syntax error.

Triggers and `permissions` declarations are treated differently when their module is imported:

- **`permissions`.** A module's `permissions` declarations take effect in every program that imports it, as if they were declared there. Their grants add up with the program's own ([ADR 0010](0010-security.md)).
- **Triggers.** A module's triggers cannot be exported, and do not take effect in a program that imports the module. Importing a module never adds triggers to a program.

## Consequences

- Standard library modules have short names (`IO`), and third-party code can live under its own scope without clashing with them.
- Files can be imported by relative path without any extra configuration.
- `into` lets a module avoid symbol collisions between imports, using the namespaces from ADR 0005.
- Importing without `into` can bring many symbols into the current namespace at once, and two such imports can collide.
- `into` and `as` become reserved words in the `import` statement, and `as` in a re-export too, and the tokenizer and grammar need to support them. `as` gives a module's type in an import, but a new name in a re-export.
- Symbolic imports cannot be resolved until the resolution algorithm is defined.
- The set of module types that `as` accepts, and how each is interpreted, still needs to be defined.
- A module says what it exports with `export`, construct by construct, and `export` becomes a keyword reserved everywhere.
- A module can re-export what it imports, symbol by symbol, so a library can gather symbols from several modules into one, without callers knowing where each was declared.
