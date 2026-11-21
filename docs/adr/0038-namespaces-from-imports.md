# 0038. Namespaces from imports

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

[ADR 0006](0006-imports.md) says that an import without `into` places the imported module's symbols into the current namespace, so after `import IO`, IO's `write` action is called as `write(…)`. [ADR 0021](0021-collections.md) says the same of `import Collections`.

But programs naturally name a symbol by the module it came from, and [ADR 0012](0012-base-types.md)'s example, like the Hello World example, does just that:

```cant
import IO

action SayHello(): VOID
    body
        IO::write("Hello World!")
```

Under [ADR 0006](0006-imports.md), `IO` is not a namespace in this module, so `IO::write` can't be found. The compiler reports it.

## Decision

An import of a symbolic module identifier ([ADR 0006](0006-imports.md)) without `into` places the module's symbols in two namespaces:

- the current namespace, as [ADR 0006](0006-imports.md) says; and
- a namespace named after the module: the identifier after any scope, so `IO` for `import IO` and `import cant::IO`, and `Payments` for `import acme::Payments` ([ADR 0031](0031-module-resolution.md)).

So after `import IO`, both `write(…)` and `IO::write(…)` call the same action.

```cant
import Collections

count := length(scores)               // in the current namespace
same := Collections::length(scores)   // in the namespace named after the module
```

- **The same symbols.** Both namespaces hold the same symbols, so a symbol reached through either is the same one.
- **With `into`.** An import with `into` places the module's symbols only into the namespace `into` names, as before, so `import IO into io` gives `io::write` and nothing else.
- **URL imports.** An import of a URL identifier, such as `import "./greetings.cant"`, has no module name, so it only places its symbols into the current namespace, as before.
- **Clashes.** The namespace named after the module is an ordinary namespace. If the module also declares a namespace with that name, or another import places symbols there, the imported symbols are added to it, and a name that clashes there is a compile-time error, as anywhere else ([ADR 0006](0006-imports.md)).
- **Exports.** Re-exporting a symbol through this namespace, as in `export IO::write`, names the same symbol as `export write`, and exports it under its own name ([ADR 0006](0006-imports.md)).

## Consequences

- A program can import a module plainly and still name its symbols by the module they came from, so `import IO` followed by `IO::write(…)` is valid, as [ADR 0012](0012-base-types.md)'s example writes it.
- Importing without `into` still brings every symbol into the current namespace, so it can still collide there with other imports and with the module's own declarations. `into` is still the way to avoid that.
- Two modules with the same name from different scopes, such as `import acme::Payments` and `import billing::Payments`, both place their symbols in a namespace called `Payments`, where they can clash. Using `into` for at least one of them avoids that.
- Every plain symbolic import adds a namespace to the module, whose name a later `namespace` line can't reuse without sharing it with the import.
