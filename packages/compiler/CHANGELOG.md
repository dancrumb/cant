# @dancrumb/cant-compiler

## 0.19.0

### Minor Changes

- Check `cant::` imports in the editor against the standard library of the Cant that runs the program (ADR 0031), rather than the copy bundled into the extension. The language server looks up from the entry module for the `stdlib` folder of a `@dancrumb/cant-compiler` package: the package itself or a `packages/compiler` beside it, as in Cant's own repository, where unsaved changes to its files are seen; then the one the installed `@dancrumb/cant` uses, in `node_modules`. It falls back to its own copy. So a new standard library action, such as `IO::readline`, can be used as soon as the installed Cant has it. A compiler `Host` can now give a `standardLibrary`, and `findStandardLibrary` and `standardLibraryIn` are exported.

- Add `IO::readline(stream?: ReadStream := @stdin): TEXT? raises StreamError` (ADR 0042). It reads the next line of a stream, decoded as UTF-8, without its `\n` or `\r\n`, and returns as soon as the line ends, so an interactive program can read answers as they are typed. It takes only the line from the stream, leaving the rest for later reads, and gives `NOTHING` once the stream has ended. A `FILE` gives its first line.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.19.0

## 0.18.0

### Minor Changes

- Add `cant::Console`, the standard library module for logging (ADR 0044). The compiler ships `stdlib/Console.cant`, which declares `LogLevel` (`Error`, `Warn`, `Info`, `Debug`, `Trace`), an action for each level, `error`, `warn`, `info`, `debug` and `trace`, each taking `message: TEXT` and `data?: {UNKNOWN}`, and `log`, which also takes `level?: LogLevel := LogLevel.Info`. The interpreter implements them: each call writes one line to the program's `@stderr`, the level padded to five characters, the message, and the data's members as text, two spaces after it, and never raises, dropping a line it can't write. The interpreter also evaluates map literals, gives maps to native code as a `Map`, and converts them to text, and gives standard library actions the program's streams in their context.

- Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.17.0

## 0.16.0

### Minor Changes

- Run programs (ADR 0039). The interpreter exports `run(program, { root, sourceMap })`, which runs a compiled program's `Start` triggers, with their arguments, and `Panic`. This first version runs actions with bodies and the standard library's actions, with arguments, defaults, locals, `return`, and strings with interpolations, and gives `@stdin`, `@stdout`, `@stderr` and `@now`; anything else panics, saying the interpreter can't run it yet. The `cant` command moves to a new package, `@dancrumb/cant`, which depends on the compiler and the interpreter, and gains `cant version`, which prints Cant's version, and `cant run`, which runs an entry `.cant` file, compiling it first, or a compiled program from `cant build`, and reports a panic with its source as a diagnostic is. The compiler no longer provides the `cant` binary: install `@dancrumb/cant` for it.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.16.0

## 0.15.0

### Patch Changes

- refactor: get rid of single-line blocks

- Updated dependencies:
  - @dancrumb/cant-shared@0.15.0

## 0.14.0

### Patch Changes

- The standard library's own source files, in `@dancrumb/cant-compiler`'s `stdlib` folder, are checked as the standard library modules they declare, so editing `IO.cant` or `Collections.cant` no longer reports `ReadStream`, `WriteStream`, type parameters or `Collection<T>` as errors, and `cant check` accepts them. A file with the same name anywhere else is still an ordinary module.

- Updated dependencies:
  - @dancrumb/cant-shared@0.14.0

## 0.13.0

### Minor Changes

- Declare `cant::Collections` in Cant, with generic signatures (ADR 0043). Standard library modules can declare type parameters on actions, as in `values<T>(map: {T}): [T]` or `concat<C: Collection>(src: C, tgt: C): C`, and write the generic type `Collection<T>`; a program that does either gets a compile-time error. The compiler ships `stdlib/Collections.cant`, and checks calls to its actions: it works out each call's type parameters from its arguments, reports collections of the wrong kind or element type, and gives the call's result its precise type, so `concat` of two `[NUMBER]`s is a `[NUMBER]`. The parser and formatter handle type parameters and generic types, and compiled programs write them as `typeParameter` and `collection` types. Hovering over a `cant::Collections` action shows its declaration.

- Declare `cant::Errors` in Cant (ADR 0023). The compiler ships `stdlib/Errors.cant`, which declares the eight built-in errors, with no `data`, so every standard library module is now declared in Cant and loaded from its source. A compiled program still records the built-in errors whether or not it imports `cant::Errors`. The compiler no longer exports `STANDARD_LIBRARY` and `StandardKind`; it exports `STANDARD_SOURCES`, the Cant source of each standard library module, by name.

- Declare `cant::IO` in Cant (ADR 0042). The compiler ships `stdlib/IO.cant` and loads it when a program imports `cant::IO`, so calls are checked against its declarations: `write(message: TEXT, stream?: WriteStream := @stdout): VOID` and `read(stream?: ReadStream := @stdin): [NUMBER]`, which both raise `StreamError`. `WriteStream` and `ReadStream` are internal types that only standard library modules can write: a `WriteStream` is `@stdout` or `@stderr`, and a `ReadStream` is `@stdin` or a `FILE`. A compiled program records `cant::IO`'s actions as standard actions, includes its source in the source map, and writes a `ReadStream` as a stream type with `file: true`. The language server shows `cant::IO`'s declarations on hover, and gives no location for them. The interpreter's implementation is still to come.

- Declare `cant::Time` in Cant (ADR 0026). The compiler ships `stdlib/Time.cant`, with `addDays`, `addMonths`, `addYears`, `format` and `parse`, and the errors `UnknownTimeZone`, `NotWholeNumber` and `InvalidDateTime`, and checks calls to them: arguments of the wrong type, a `style` that isn't `"date"`, `"time"` or `"dateTime"`, and results whose errors are never handled. Hovering over a `cant::Time` action shows its declaration.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.13.0

## 0.12.0

### Minor Changes

- Add a formatter (ADR 0041). `cant fmt <files...>` prints each file formatted, `--write` rewrites the files that change, and `--check` lists the files that aren't formatted and exits with 1. The formatter indents blocks by four spaces, spaces operators, `:=`, commas and type annotations, writes only the parentheses that are needed (and around `and` inside `or`, and a prefix operator in the base of `**`), and puts each item of a collection that spans lines on its own line with a trailing comma. It never wraps lines, keeps literals as written, keeps comments, lining up trailing comments on consecutive lines, and keeps single blank lines. It checks that its output means the same and has the same comments. The language server formats documents, so the VS Code extension supports **Format Document** and format on save. `@dancrumb/cant-shared` exports `format`, and `comments`, which finds the comments in Cant source.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.12.0

## 0.11.0

### Minor Changes

- Add the built-in values `@stdin`, `@stdout` and `@stderr`, the interpreter process's standard streams (ADR 0040). They can be used in any trigger or action, but not in a constant expression. `@stdin` has an input stream type and `@stdout` and `@stderr` an output stream type, which a program can't name. A stream can't be converted to text, given where an `UNKNOWN` is expected, or compared with a stream of the other direction. `@dancrumb/cant-shared`'s compiled types gain `{ kind: 'stream', direction }`. Error messages that start with a type's description now start with a capital letter.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.11.0

## 0.10.3

## 0.10.2

## 0.10.1

### Patch Changes

- initial publish of some packages

## 0.10.0

### Minor Changes

- The compiler can now compile a program for the interpreter (ADR 0039). `compile()` checks a program and gives its compiled program and source map, and `cant build` writes them to disk, as `<entry>.compiled.json` and `<entry>.compiled.json.map` in the program's root, or where `-o` says, with `--no-source-map` to leave the source map out. A build with problems writes nothing and removes the files an earlier build wrote. `@dancrumb/cant-shared` declares the compiled program's types. A constant can now declare an enum type and give one of its values, as in ADR 0034's `const defaultStatus: InvoiceStatus := "draft"`, which `cant check` wrongly rejected.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.10.0

## 0.9.0

### Minor Changes

- `@dancrumb/cant-shared` has an evaluator for constant expressions, `evaluate`, which the compiler and the interpreter share, with the values it gives (`Value`) and their conversion to text (`toText`). The compiler now uses it to find constant divisors and test case names, so names built from any constant value, such as a fractional number, an enum member or a date, are compared. `cant check` also reports a constant expression that can't be worked out, such as a `DATE_TIME` out of range, since it would fail when the program starts.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.9.0

## 0.8.0

### Minor Changes

- The language server, `cant-lsp`, checks each open `.cant` file as the entry of a program and reports every problem `cant check` finds, in that file and in the modules it imports, using the editor's unsaved text. It also offers go to definition, find references, hover, the document outline and completion of keywords, visible names and locals. The VS Code extension starts it for `.cant` files. The compiler now exports `symbolOf`, and the shared package exports `KEYWORDS`.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.8.0

## 0.7.0

### Minor Changes

- Add `cant check <files...>`, which parses each Cant file, reports a syntax error where it is, and reports names declared twice where the ADRs allow only one: types, actions and constants in a namespace, exported symbols, test case names, and parameters, fields, enum members and values, roles and entity lines inside a declaration. The package now exports `check`, `collectDeclarations` and `formatDiagnostic`, and a symbol table of each module's declarations by namespace.

- `cant check` now reports constants and trigger source parameters whose values aren't constant expressions (ADRs 0023, 0025, 0034), entity models that hold entities (ADRs 0027, 0035), and defaults that depend on each other in a cycle (ADRs 0020, 0027). Test case names are compared across the whole program, including names built from constants, and `DATE_TIME` and `DURATION` enum values that are equal but written differently count as duplicates.

- `cant check` now checks error handling (ADR 0023). Calls to actions with `raises` or `passes`, and `/` and `%` unless the divisor is a non-zero constant, give results that must be handled: checked with `instanceOf`, passed, ignored or used. It reports results that are never handled, unchecked results returned, errors raised or passed that the action doesn't declare, `raise` data that doesn't match the error's, duplicate and misplaced error clauses, division by a constant zero, fractional `%` operands, and statements that can raise `IndexBeforeStart`, `UnknownField`, `RequiredField`, `CardinalityViolation` or `InvalidEnumValue` without listing it. `instanceOf` narrows results and errors on both branches, and `@result`, `@error` and an error's `data` are typed.

- Place a symbolic import without `into` in a namespace named after the module too, as well as the current namespace (ADR 0038), so `import IO` followed by `IO::write(…)` checks.

- `cant check` now resolves names inside expressions and statements, with local scopes for parameters, assignments and loop variables. It reports names that are out of scope, identifiers assigned twice in one block, `break` and `continue` outside a loop, calls of anything but an action, actions and types used as values, unknown enum members, arguments that don't match an action's parameters in calls and triggers, unknown `TestCase` parameters, and built-in values that don't exist or are used where they can't be. It also checks entities and security declarations: the fields `expose`, `hide`, `identity` and `membership` name, navigation fields that clash, subjects without an `identity` or with identity fields claims can't carry, roles without a `group`, and the group kinds, roles and permissions that `permissions` declarations and predicates name.

- `cant check` now checks whole programs: it follows each entry file's imports, resolving them through the `cant` standard library, `cant.json` scopes and relative files, and rejecting remote URLs and `as`. It works out each module's exports and re-exports, places imported symbols by `into` or the current namespace, reports names that clash there, and resolves the types, errors, models, entities and actions that declarations refer to, reporting unknown names and namespaces and names of the wrong kind. The package exports `checkProgram`, `loadProgram` and `resolveNames`.

- `cant check` now checks types. It reports operators given operands they don't take, including on dates and durations; conditions that aren't `BOOLEAN` and messages that aren't `TEXT`; arguments, returns, assignments, defaults and constants whose values don't fit, with enum compatibility and object values matched against models; fields a value doesn't have; VOID results used as values; actions that can end without returning a value; and values that can't be interpolated. Optionals must be checked before they are used, with narrowing by `isEmpty`, `instanceOf` and `@subject is`, through `!`, `and`, `or`, early returns, `assert` and earlier assertions.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.4.0

## 0.3.2

## 0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.3.0

## 0.2.0

### Minor Changes

- Add support for an output file parameter for `weave` and make `weave` into a binary

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
