# 0031. Module resolution

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

An import's module identifier can be symbolic, such as `IO` or `cant::IO`, or a URL string ([ADR 0006](0006-imports.md)). URL identifiers are resolved relative to the importing module, but [ADR 0006](0006-imports.md) leaves the algorithm that resolves symbolic identifiers to its own ADR.

Earlier ADRs already constrain it:

- A symbolic identifier is written `[<scope>::]<identifier>`, and its scope defaults to `cant`, so `import IO` and `import cant::IO` are the same ([ADR 0006](0006-imports.md)).
- `into` names the namespace that a module's symbols go into, and `as` declares the module's type, such as `"json"` ([ADR 0006](0006-imports.md)).
- A native module is ordinary Cant source, so it needs no module type of its own, and the string after `native` is resolved as a URL import is ([ADR 0036](0036-native-modules.md)).
- The standard library modules, such as `cant::Collections`, are native modules provided by the interpreter ([ADR 0036](0036-native-modules.md)).

## Decision

### The `cant` scope

The `cant` scope is built into the interpreter. Its modules, such as `cant::IO`, `cant::Collections` and `cant::Errors` ([ADR 0015](0015-files.md), [ADR 0021](0021-collections.md), [ADR 0023](0023-error-handling.md)), ship with the interpreter, and their versions are the interpreter's version. A program can't change where `cant` resolves to.

Since a symbolic identifier with no scope is in the `cant` scope ([ADR 0006](0006-imports.md)), `import Payments` means `import cant::Payments`, and is a compile-time error unless the interpreter has a `cant::Payments` module.

### Other scopes

Every other scope is mapped to a location by the program's **manifest**, a file called `cant.json`, which works like a browser's import map:

```json
{
  "scopes": {
    "acme": "./node_modules/@acme/cant/",
    "app": "./src/"
  }
}
```

```cant
import acme::Payments into payments   // ./node_modules/@acme/cant/Payments.cant
import app::Invoices                  // ./src/Invoices.cant
```

- **Finding the manifest.** The interpreter, compiler and language server look for `cant.json` in the directory of the program's entry module, and then in each directory above it, and use the first one they find. A program has at most one manifest. A program with no manifest can only use the `cant` scope and URL imports.
- **Scopes.** `scopes` maps each scope name to a base URL. A scope name is an identifier ([ADR 0006](0006-imports.md)). `cant` can't be mapped, and mapping it is an error in the manifest.
- **Base URLs.** A base URL is resolved with the manifest's own location as the base, so `"./src/"` is the `src` directory next to `cant.json`. It must end in `/`, and it must be a file URL (see [Only files](#only-files)).
- **Resolving.** A symbolic identifier `<scope>::<identifier>` resolves to the identifier, followed by `.cant`, resolved against the scope's base URL. So `acme::Payments` is `Payments.cant` in the `acme` scope's directory. The identifier is used exactly as it is written, so file names are case-sensitive.
- **Errors.** Importing from a scope the manifest doesn't map, or a module whose file doesn't exist, is a compile-time error.

### Local modules

A program can refer to its own modules symbolically, by mapping a scope to one of its own directories, as `app` is mapped to `./src/` above. It can also go on importing them by relative URL, as [ADR 0006](0006-imports.md) allows.

### Versions

The language has no versions and no lock file. A scope's base URL names a directory of Cant source, and whatever put the source there decides its version. A library is typically installed with a package manager such as npm or pnpm, and its scope mapped into `node_modules`, so versions are chosen, and locked, by that package manager. This also fits native modules, whose TypeScript has npm dependencies of its own ([ADR 0036](0036-native-modules.md)).

### Only files

For now, every module is read from a file. A URL import ([ADR 0006](0006-imports.md)), a scope's base URL, and the module named by a `native` line ([ADR 0036](0036-native-modules.md)) must all resolve to `file:` URLs, as relative URLs resolved against a local module do. A remote URL, such as one starting with `https:`, is a compile-time error.

So the interpreter never fetches code, and nothing needs caching or checking for integrity. Code from elsewhere reaches a program through a package manager, which already does both.

### Module types

For now, `as` accepts no module types. Every module is Cant source, and any `as` in an import is a compile-time error ([ADR 0006](0006-imports.md)). A later ADR can define module types, such as JSON.

## Deferred

- **Remote modules.** Importing modules from remote URLs, with caching and integrity checks, may be allowed later.
- **Module types.** Which values `as` accepts, and how each is turned into Cant symbols. JSON, for example, needs a rule for arrays, which can't be constant expressions ([ADR 0023](0023-error-handling.md)).
- **Nested module paths.** A symbolic identifier names one module in its scope's directory. Reaching modules in its subdirectories, such as with `acme::billing::Invoices`, would need a change to the grammar of [ADR 0006](0006-imports.md).
- **Other manifest settings.** `cant.json` only holds `scopes` for now. Other settings, such as the program's entry module or its test modules ([ADR 0037](0037-test-case-trigger-source.md)), may be added later.

## Consequences

- The standard library is always the one that comes with the interpreter, so `cant::` modules can't be replaced or drift from the interpreter that runs them.
- Every other scope is mapped in one file, so a program's dependencies are listed in one place, and a program can name its own directories as scopes too.
- Cant needs no package manager, registry or lock file of its own: libraries are installed by an existing one, such as npm or pnpm, which also provides the dependencies of native modules. The cost is that a Cant program depends on that ecosystem for versions, and two libraries can't each bring in different versions of a third under the same scope.
- Every module is read from a local file, so compiling and running a program never touches the network, and there is nothing to cache or to check for integrity. The cost is that the remote URL imports [ADR 0006](0006-imports.md) shows are not allowed yet.
- Resolving `<scope>::<identifier>` to `<identifier>.cant` is simple and predictable, but a scope's modules must all sit in one directory until nested paths are allowed.
- `as` is reserved but accepts nothing, so module types can be added later without changing the syntax of imports.
