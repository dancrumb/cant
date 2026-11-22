# @dancrumb/cant-lsp

## 0.18.0

### Minor Changes

- Add `cant::Console`, the standard library module for logging (ADR 0044). The compiler ships `stdlib/Console.cant`, which declares `LogLevel` (`Error`, `Warn`, `Info`, `Debug`, `Trace`), an action for each level, `error`, `warn`, `info`, `debug` and `trace`, each taking `message: TEXT` and `data?: {UNKNOWN}`, and `log`, which also takes `level?: LogLevel := LogLevel.Info`. The interpreter implements them: each call writes one line to the program's `@stderr`, the level padded to five characters, the message, and the data's members as text, two spaces after it, and never raises, dropping a line it can't write. The interpreter also evaluates map literals, gives maps to native code as a `Map`, and converts them to text, and gives standard library actions the program's streams in their context.

- Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.18.0
  - @dancrumb/cant-shared@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.17.0
  - @dancrumb/cant-shared@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.16.0
  - @dancrumb/cant-shared@0.16.0

## 0.15.0

### Patch Changes

- refactor: get rid of single-line blocks

- Updated dependencies:
  - @dancrumb/cant-compiler@0.15.0
  - @dancrumb/cant-shared@0.15.0

## 0.14.0

### Minor Changes

- The language server colours `.cant` files with semantic tokens that say what each name is: actions as functions, models and errors as types, enums, entities, type parameters, parameters, locals, constants (read-only), fields as properties, enum members, namespaces, and built-in values and types. Comments are coloured as comments, in `.cant` files and in Markdown's `cant` code blocks, which the extension still colours from the tokenizer. **Toggle Line Comment** now works in `.cant` files.

### Patch Changes

- The standard library's own source files, in `@dancrumb/cant-compiler`'s `stdlib` folder, are checked as the standard library modules they declare, so editing `IO.cant` or `Collections.cant` no longer reports `ReadStream`, `WriteStream`, type parameters or `Collection<T>` as errors, and `cant check` accepts them. A file with the same name anywhere else is still an ordinary module.

- Updated dependencies:
  - @dancrumb/cant-compiler@0.14.0
  - @dancrumb/cant-shared@0.14.0

## 0.13.0

### Minor Changes

- Declare `cant::Collections` in Cant, with generic signatures (ADR 0043). Standard library modules can declare type parameters on actions, as in `values<T>(map: {T}): [T]` or `concat<C: Collection>(src: C, tgt: C): C`, and write the generic type `Collection<T>`; a program that does either gets a compile-time error. The compiler ships `stdlib/Collections.cant`, and checks calls to its actions: it works out each call's type parameters from its arguments, reports collections of the wrong kind or element type, and gives the call's result its precise type, so `concat` of two `[NUMBER]`s is a `[NUMBER]`. The parser and formatter handle type parameters and generic types, and compiled programs write them as `typeParameter` and `collection` types. Hovering over a `cant::Collections` action shows its declaration.

- Declare `cant::Errors` in Cant (ADR 0023). The compiler ships `stdlib/Errors.cant`, which declares the eight built-in errors, with no `data`, so every standard library module is now declared in Cant and loaded from its source. A compiled program still records the built-in errors whether or not it imports `cant::Errors`. The compiler no longer exports `STANDARD_LIBRARY` and `StandardKind`; it exports `STANDARD_SOURCES`, the Cant source of each standard library module, by name.

- Declare `cant::IO` in Cant (ADR 0042). The compiler ships `stdlib/IO.cant` and loads it when a program imports `cant::IO`, so calls are checked against its declarations: `write(message: TEXT, stream?: WriteStream := @stdout): VOID` and `read(stream?: ReadStream := @stdin): [NUMBER]`, which both raise `StreamError`. `WriteStream` and `ReadStream` are internal types that only standard library modules can write: a `WriteStream` is `@stdout` or `@stderr`, and a `ReadStream` is `@stdin` or a `FILE`. A compiled program records `cant::IO`'s actions as standard actions, includes its source in the source map, and writes a `ReadStream` as a stream type with `file: true`. The language server shows `cant::IO`'s declarations on hover, and gives no location for them. The interpreter's implementation is still to come.

- Declare `cant::Time` in Cant (ADR 0026). The compiler ships `stdlib/Time.cant`, with `addDays`, `addMonths`, `addYears`, `format` and `parse`, and the errors `UnknownTimeZone`, `NotWholeNumber` and `InvalidDateTime`, and checks calls to them: arguments of the wrong type, a `style` that isn't `"date"`, `"time"` or `"dateTime"`, and results whose errors are never handled. Hovering over a `cant::Time` action shows its declaration.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.13.0
  - @dancrumb/cant-shared@0.13.0

## 0.12.0

### Minor Changes

- Add a formatter (ADR 0041). `cant fmt <files...>` prints each file formatted, `--write` rewrites the files that change, and `--check` lists the files that aren't formatted and exits with 1. The formatter indents blocks by four spaces, spaces operators, `:=`, commas and type annotations, writes only the parentheses that are needed (and around `and` inside `or`, and a prefix operator in the base of `**`), and puts each item of a collection that spans lines on its own line with a trailing comma. It never wraps lines, keeps literals as written, keeps comments, lining up trailing comments on consecutive lines, and keeps single blank lines. It checks that its output means the same and has the same comments. The language server formats documents, so the VS Code extension supports **Format Document** and format on save. `@dancrumb/cant-shared` exports `format`, and `comments`, which finds the comments in Cant source.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.12.0
  - @dancrumb/cant-shared@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.11.0
  - @dancrumb/cant-shared@0.11.0

## 0.10.3

## 0.10.2

## 0.10.1

### Patch Changes

- initial publish of some packages

## 0.10.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.10.0
  - @dancrumb/cant-shared@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.9.0
  - @dancrumb/cant-shared@0.9.0

## 0.8.0

### Minor Changes

- The language server, `cant-lsp`, checks each open `.cant` file as the entry of a program and reports every problem `cant check` finds, in that file and in the modules it imports, using the editor's unsaved text. It also offers go to definition, find references, hover, the document outline and completion of keywords, visible names and locals. The VS Code extension starts it for `.cant` files. The compiler now exports `symbolOf`, and the shared package exports `KEYWORDS`.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.8.0
  - @dancrumb/cant-shared@0.8.0

## 0.7.0

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

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
