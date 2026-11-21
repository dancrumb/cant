# 0039. Compiled programs

- **Status:** Proposed
- **Date:** 2026-11-21

## Context

The compiler checks a whole program: it parses every module the entry module uses, resolves imports and namespaces ([ADR 0005](0005-module-namespaces.md), [ADR 0006](0006-imports.md), [ADR 0031](0031-module-resolution.md), [ADR 0038](0038-namespaces-from-imports.md)), resolves every name to the declaration or local it means, and checks types, error handling and constant expressions. The interpreter, which runs programs, doesn't exist yet.

The interpreter needs most of what the compiler works out. If it read Cant source itself, it would have to repeat name resolution, and in places type checking, since some of what a program does at runtime depends on types the compiler infers:

- An object value given where a model is expected becomes an object of that model, with its fields' defaults filled in, and carries that model as its type at runtime ([ADR 0027](0027-object-shapes.md), [ADR 0033](0033-unknown-type.md)). The source only shows `{ … }`; the model comes from the type checker.
- A text value given where an enum is expected is checked against the enum's values, and may raise `InvalidEnumValue` ([ADR 0013](0013-enums.md)).
- Using the value of a result that holds an error panics ([ADR 0023](0023-error-handling.md)). Whether an expression is such a result is known only from the types.
- Arguments are named, and may be left out for a default that can depend on other parameters ([ADR 0020](0020-action-parameters.md)). Which parameter each argument fills, and the order defaults are worked out in, are found by the compiler.

Earlier ADRs also settle parts of what the interpreter is given:

- Code that understands the language lives in `@dancrumb/cant-shared`, and the compiler and interpreter depend on it, not on each other ([ADR 0002](0002-share-language-code-in-cant-shared.md)).
- A constant's value is a constant expression, known at compile time, so nothing has to run, or can fail, when the program starts ([ADR 0034](0034-top-level-constants.md)). Each use of a constant object gives a new object.
- Triggers in an imported module never take effect ([ADR 0006](0006-imports.md)). Test cases only fire when the interpreter runs a program's tests ([ADR 0037](0037-test-case-trigger-source.md)).
- The interpreter loads every native action's module before any trigger runs, and checks values that cross the boundary against their declarations ([ADR 0036](0036-native-modules.md)), so it needs each native action's module and its types.

This ADR decides the structure the compiler gives the interpreter.

## Decision

### A compiled program

When a program has no compile-time errors, the compiler produces a **compiled program**: one structure for the whole program, holding everything the interpreter needs to run it, already resolved and checked. The interpreter runs a compiled program, and never reads Cant source.

The compiler doesn't produce a compiled program for a program with compile-time errors, so the interpreter never runs a program that didn't check.

A compiled program is plain data: objects, arrays, strings, finite numbers, booleans and `null`, with no cycles, class instances, `Map`s or `undefined`. So it can be written to and read from JSON unchanged.

Its TypeScript types are declared in `@dancrumb/cant-shared` ([ADR 0002](0002-share-language-code-in-cant-shared.md)), so the compiler, which produces it, and the interpreter, which runs it, share them without depending on each other.

### Its shape

```ts
interface CompiledProgram {
  /** The version of this structure. */
  format: 1;
  /** Identifies this build, so that its source map can be matched with it. */
  build: string;
  /** The entry module. */
  entry: ModuleId;
  /** Every declaration in every module the program uses, by its symbol. */
  types: Record<SymbolId, TypeDeclaration>;      // enums, models, entities and errors
  actions: Record<SymbolId, ActionDeclaration>;
  constants: Record<SymbolId, Value>;
  relations: Relation[];
  permissions: Permissions[];
  /** The triggers that take effect: the entry module's. */
  triggers: Trigger[];
}

/** Where something is in the program's source: its module, and where it starts and ends in it, 1-based. */
interface SourcePosition {
  module: ModuleId;
  start: { line: number; column: number };
  end: { line: number; column: number };
}
```

A compiled program doesn't hold the program's source. Positions only name a module, a line and a column, and the source that shows what is there is kept in a separate [source map](#source-maps).

#### Modules and symbols

Namespaces, imports and exports only decide what a name refers to, so the compiler resolves them, and they aren't part of a compiled program. Every reference to a declaration names it by its **symbol**:

- A **module ID** names a module. For a module in a file, it is the file's path relative to the program's root, the directory that holds its `cant.json` ([ADR 0031](0031-module-resolution.md)), or the entry module's directory if it has none, with `/` between directories, such as `lib/payments.cant`. For a standard library module, it is its symbolic identifier, such as `cant::Collections`.
- A **symbol ID** names a declaration: its module ID, then `#`, then its name, such as `lib/payments.cant#ChargeCard` or `cant::Errors#DivisionByZero`.

Module IDs don't depend on where the program is on disk, so the same program compiles to the same structure wherever it is.

A compiled program holds every declaration of every module the program uses, whether or not it is reached from a trigger.

#### Types

A type is written as a structure, with every name resolved to its symbol:

```ts
type TypeRef =
  | { kind: "base"; name: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE_TIME" | "DURATION" | "FILE" }
  | { kind: "unknown" }
  | { kind: "named"; symbol: SymbolId }          // an enum, model, entity or error
  | { kind: "enum"; values: Value[] }            // an inline enum
  | { kind: "array" | "set"; element: TypeRef }
  | { kind: "map"; value: TypeRef }
  | { kind: "optional"; inner: TypeRef }
  | { kind: "internal"; name: string; arguments: TypeRef[] }; // a standard library type, such as Collection<T>
```

Declarations keep what the interpreter needs to make and check values ([ADR 0027](0027-object-shapes.md), [ADR 0036](0036-native-modules.md)):

- an enum's values, each with its name;
- a model's fields, each with its type, whether it is optional, and its default, if it has one;
- an error's `data` model;
- an entity's models, identity, exposed fields, subject and group markings, roles and memberships, and its navigation fields, from the relations that name it ([ADR 0010](0010-security.md), [ADR 0022](0022-entities.md), [ADR 0035](0035-entity-relationships.md)).

#### Constants

The compiler works out each constant's value, since it is a constant expression ([ADR 0034](0034-top-level-constants.md)), and the compiled program holds the value itself, not the expression. Values are plain data too:

```ts
type Value =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "dateTime"; value: number }   // milliseconds since 1970-01-01T00:00:00Z
  | { kind: "duration"; value: number }   // a whole number of milliseconds
  | { kind: "enum"; enum: SymbolId; value: Value }          // the member's value, a base value
  | { kind: "object"; model?: SymbolId; members: [string, Value][] };  // in order
```

A use of a constant in an action refers to its symbol, and the interpreter makes a new object from an object constant each time it is used.

Trigger source parameters are constant expressions too ([ADR 0025](0025-trigger-sources.md)), so they are also held as their values.

#### One evaluator

Expressions are evaluated by one **evaluator**, in `@dancrumb/cant-shared` ([ADR 0002](0002-share-language-code-in-cant-shared.md)), which both the compiler and the interpreter use. So a constant expression has the same value whether the compiler works it out or the interpreter does, and the rules for operators ([ADR 0019](0019-operators.md), [ADR 0026](0026-dates-and-times.md)) and for converting values to text ([ADR 0011](0011-converting-values-to-text.md)) are written once.

- **Names.** The evaluator doesn't resolve names. Whoever calls it gives it a scope, which says what a name's value is and what an enum member is: the compiler's scope uses its symbol tables, and the interpreter's uses the compiled program.
- **What it gives.** Evaluating an expression gives a value, a built-in error that it raises, such as `DivisionByZero`, a panic ([ADR 0023](0023-error-handling.md)), or the part of the expression that isn't constant.
- **Constant expressions first.** For now, the evaluator handles constant expressions: literals, strings, enum members, constants, objects and the operators on them. It grows to cover the rest of the language as the interpreter is built.
- **At compile time.** A constant expression whose evaluation panics, such as a `DATE_TIME` outside the range it can hold, or a number too large to hold, is a compile-time error, since nothing can fail when the program starts ([ADR 0034](0034-top-level-constants.md)).

#### Actions

```ts
interface ActionDeclaration {
  parameters: Parameter[];
  returns: TypeRef | { kind: "void" };
  raises: SymbolId[];
  passes: SymbolId[] | "all";
  /** The order to work out defaults in, as indexes into `parameters`. */
  defaultOrder: number[];
  implementation:
    | { kind: "body"; locals: number; body: Statement[] }
    | { kind: "native"; module: string }   // the native module, relative to the program's root
    | { kind: "standard" };                // provided by the interpreter
  position: SourcePosition;
}
```

- **Native actions.** The string after `native` is relative to the module that declares the action ([ADR 0036](0036-native-modules.md)). The compiler resolves it to a path relative to the program's root, so the interpreter can load every native module from the root without knowing where each Cant module was.
- **Standard library actions** are provided by the interpreter ([ADR 0036](0036-native-modules.md)). The compiled program holds their signatures, so the interpreter checks their values at the boundary like any other native action's.

#### Code

An action's body, defaults, trigger arguments, `auth` rules and assertions are held as a tree of statements and expressions, like the syntax tree the parser makes ([ADR 0003](0003-parse-with-peggy-into-a-unist-tree.md)), with these differences:

- **Names are resolved.** A name refers to a declaration by its symbol ID, or to a local by its **slot**: a number for each parameter and local of the action, unique within it, so that shadowing is already resolved ([ADR 0018](0018-immutable-identifiers.md)). The action's `locals` is how many slots it has.
- **Calls are resolved.** A call names the action's symbol, and gives one entry for each of its parameters, in order: the argument's expression, or a marker that the argument was left out, so the interpreter uses the default, or leaves the parameter empty ([ADR 0020](0020-action-parameters.md)).
- **What the types decide is explicit.** The compiler adds nodes for what happens at runtime because of a type, rather than leaving the interpreter to work it out:
  - `construct`, which makes an object value into an object of a model, filling in defaults ([ADR 0027](0027-object-shapes.md));
  - `toEnum`, which checks a value against an enum's values, where a value of its value type is given for an enum ([ADR 0013](0013-enums.md));
  - `unwrap`, where the value of a result that may hold an error is used without being checked, which panics if it holds one ([ADR 0023](0023-error-handling.md));
  - the element type of each array, map and set value, so an empty collection has the type it was given ([ADR 0021](0021-collections.md), [ADR 0033](0033-unknown-type.md)).
- **Positions are kept.** Every statement and expression keeps its `SourcePosition`, so the interpreter can say where a panic, a failed assertion or a boundary failure happened.

The compiler doesn't otherwise change the code: it doesn't optimise it, or reorder it.

#### Triggers

`triggers` holds only the entry module's triggers, since triggers in imported modules never take effect ([ADR 0006](0006-imports.md)). Each names its action's symbol, its source, its parameters as constant values, and its arguments, `auth` rule and assertions as code. `TestCase` triggers are included like any other. The interpreter decides which sources fire, so it skips them unless it is running the program's tests ([ADR 0037](0037-test-case-trigger-source.md)).

### Source maps

Alongside a compiled program, the compiler produces a **source map**, which holds the source of each of the program's modules:

```ts
interface SourceMap {
  format: 1;
  /** The build of the compiled program this source map belongs to. */
  build: string;
  /** Each module's source, by its module ID. */
  sources: Record<ModuleId, string>;
}
```

The interpreter uses a source map, when it is given one, to report where something happened in the program. Without one, it still reports the position, as its module, line and column:

```text
lib/payments.cant:12:9: panic: The result of ChargeCard held PaymentDeclined, which was used without being checked.
```

With one, it also shows the line of source the position points to, with the part it is about underlined, as the compiler shows its diagnostics:

```text
lib/payments.cant:12:9: panic: The result of ChargeCard held PaymentDeclined, which was used without being checked.
   |
12 |         total := ChargeCard(card := card).total
   |                  ^^^^^^^^^^^^^^^^^^^^^^^^
```

- **Matching builds.** A compiled program's `build` identifies it, such as by a hash of its contents. The interpreter only uses a source map whose `build` is the compiled program's, and ignores any other, as if it had none, so it never shows source from a different version of the program.
- **Standard library modules** have no Cant source, so they have no entry in `sources`. Positions in them are reported without source.
- **Not JavaScript source maps.** JavaScript's source maps relate positions in generated text to positions in its source. A compiled program isn't text whose positions mean anything: its nodes already hold their positions in the source. So a Cant source map only needs to hold the source itself.

Keeping the source out of the compiled program keeps it small, and lets a program be deployed without its source, when its errors only need positions.

### Passing it to the interpreter

The compiler's API gives a compiled program, or the diagnostics that stopped it:

```ts
compile(entry: string, host?: Host): { program: CompiledProgram; sourceMap: SourceMap } | { diagnostics: Diagnostic[] };
```

The interpreter's API takes a compiled program, the program's root, which it loads native modules from, and its source map, if there is one:

```ts
run(program: CompiledProgram, options: { root: string; sourceMap?: SourceMap; … }): …;
```

#### On the command line

`cant build` compiles a program and writes the compiled program and its source map to disk, as JSON, for running later or elsewhere:

```sh
cant build main.cant                    # writes main.compiled.json and main.compiled.json.map in the program's root
cant build main.cant -o out/app.json    # writes out/app.json and out/app.json.map
cant build main.cant --no-source-map    # writes main.compiled.json only
```

- **Where it writes.** Without `-o`, it writes `<entry>.compiled.json`, named after the entry module without its `.cant`, in the program's root: the directory that holds its `cant.json`, or the entry module's directory if it has none ([ADR 0031](0031-module-resolution.md)). The source map is written beside it, with `.map` added to its name.
- **Without a source map.** `--no-source-map` writes only the compiled program, and removes a source map left beside it by an earlier build.
- **Problems.** If the program has compile-time errors, `cant build` reports them, as `cant check` does, and writes nothing. It doesn't leave an earlier build in place either: it removes the files it would have written, so a compiled program on disk always matches the source it was last built from.

`cant run` and `cant test` take either an entry module or a compiled program:

- Given an entry module, such as `cant run main.cant`, they compile it and pass the compiled program and its source map straight to the interpreter, with nothing written to disk.
- Given a compiled program, such as `cant run main.compiled.json`, they run it without compiling. The program's root is then the directory the compiled program is in, which is where native modules are loaded from, so a compiled program has to sit in its program's root, as `cant build` puts it by default, with its native modules beside it. `--root` names another directory. If the compiled program's source map is beside it, with `.map` added to its name, they give that to the interpreter too.

### Versions

A compiled program is made by one version of the compiler for the same version of the interpreter. `format` is its version: the interpreter refuses a compiled program whose `format` it doesn't support, rather than run it wrongly. Until Cant's first major version, the structure can change in any release, and `format` changes with it.

## Deferred

- **Smaller programs.** A compiled program holds every declaration of every module it uses. Leaving out what no trigger can reach can come later.
- **Bytecode.** The interpreter walks the tree. A lower-level form, such as bytecode, can come later if the tree is too slow.
- **Separate compilation.** The compiler compiles the whole program at once. Compiling modules separately, and linking them, can come later.

## Consequences

- The interpreter is simpler: it never parses, resolves names or checks types, and it gets the runtime behaviour that depends on types already made explicit.
- The compiler and the interpreter agree on one structure, declared once in `@dancrumb/cant-shared`. A change to it is a change to that package, needing a changeset ([ADR 0002](0002-share-language-code-in-cant-shared.md)).
- The compiler and the interpreter share one evaluator, so they can't disagree about what an expression's value is. A change to how values behave is made once, in `@dancrumb/cant-shared`.
- Programs can be compiled once and run many times, or compiled on one machine and run on another, since the structure is JSON and doesn't depend on where the program was on disk.
- A compiled program is tied to one version of the interpreter, so it has to be compiled again after an upgrade.
- The program's source is only in its source map, so a program can run without it, with errors that give only positions. Keeping a source map with the compiled program it was built with is up to whoever deploys them; one from another build is ignored rather than shown.
- Language servers and other tools can keep using the compiler's own structures, such as its symbol tables and references; the compiled program is only what the interpreter needs.
