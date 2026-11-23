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
- **Clashes.** The namespace named after the module is an ordinary namespace. If the module also declares a namespace with that name, or another import places symbols there, the imported symbols are added to it, and clashing names there follow the rules below, as anywhere else.
- **Exports.** Re-exporting a symbol through this namespace, as in `export IO::write`, names the same symbol as `export write`, and exports it under its own name ([ADR 0006](0006-imports.md)).

### Names that imports share

Every plain import places its symbols in the current namespace, so two modules that each export a symbol with the same name, such as `cant::Text` and `cant::Collections`, which both export `length`, place two different symbols with one name there.

That isn't an error at the imports. The name is **ambiguous** in that namespace, and it is a compile-time error to use it there, which includes naming it in a type, calling it, using it as a value, or re-exporting it. The program names the one it means by the namespace named after its module instead, where it isn't ambiguous:

```cant
import Text
import Collections

words := Text::split(line)
letters := Text::length(line)             // not `length(line)`, which is ambiguous
count := Collections::length(words)
```

- **Which names clash.** Two imported symbols clash where two declarations in one module would ([ADR 0006](0006-imports.md), [ADR 0034](0034-top-level-constants.md)): two types, or two actions, with one name, or a constant and anything else with that name. The same symbol, reached through two imports, doesn't clash with itself.
- **Every namespace.** The rule is the same in every namespace that imports place symbols in: the current one, one named after a module, and one that `into` names. So `import acme::Payments` and `import billing::Payments` can both be imported plainly, and a name they share is ambiguous in both the current namespace and `Payments`, where only `into` tells them apart.
- **The module's own declarations.** A symbol that an import places in a namespace where the module declares a symbol with the same name, which it would clash with, is still a compile-time error at the import. The module has to import into a namespace of its own with `into`.
- **Unused names.** An ambiguous name that the module never uses there is no problem, so a module isn't broken when a module it imports adds an export that another import already has.

## Consequences

- A program can import a module plainly and still name its symbols by the module they came from, so `import IO` followed by `IO::write(…)` is valid, as [ADR 0012](0012-base-types.md)'s example writes it.
- Importing without `into` still brings every symbol into the current namespace, so it can still collide there with the module's own declarations, and `into` is still the way to avoid that.
- Two imports can share names without either needing `into`. A shared name is ambiguous where both place it, so the program writes it with its module, as `Text::length`, and keeps using the names the imports don't share without one.
- A module that adds an export can only break an importer that uses that name without a module, or declares it itself, not one that merely imports both modules.
- Two modules with the same name from different scopes, such as `import acme::Payments` and `import billing::Payments`, both place their symbols in a namespace called `Payments`, so a name they share is ambiguous there too. Using `into` for at least one of them gives it a namespace of its own.
- Every plain symbolic import adds a namespace to the module, whose name a later `namespace` line can't reuse without sharing it with the import.
