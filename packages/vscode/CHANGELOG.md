# cant-vscode

## 0.19.0

### Minor Changes

- Check `cant::` imports in the editor against the standard library of the Cant that runs the program (ADR 0031), rather than the copy bundled into the extension. The language server looks up from the entry module for the `stdlib` folder of a `@dancrumb/cant-compiler` package: the package itself or a `packages/compiler` beside it, as in Cant's own repository, where unsaved changes to its files are seen; then the one the installed `@dancrumb/cant` uses, in `node_modules`. It falls back to its own copy. So a new standard library action, such as `IO::readline`, can be used as soon as the installed Cant has it. A compiler `Host` can now give a `standardLibrary`, and `findStandardLibrary` and `standardLibraryIn` are exported.

## 0.18.0

### Minor Changes

- Add `cant::Console`, the standard library module for logging (ADR 0044). The compiler ships `stdlib/Console.cant`, which declares `LogLevel` (`Error`, `Warn`, `Info`, `Debug`, `Trace`), an action for each level, `error`, `warn`, `info`, `debug` and `trace`, each taking `message: TEXT` and `data?: {UNKNOWN}`, and `log`, which also takes `level?: LogLevel := LogLevel.Info`. The interpreter implements them: each call writes one line to the program's `@stderr`, the level padded to five characters, the message, and the data's members as text, two spaces after it, and never raises, dropping a line it can't write. The interpreter also evaluates map literals, gives maps to native code as a `Map`, and converts them to text, and gives standard library actions the program's streams in their context.

- Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.

## 0.17.0

## 0.16.0

## 0.15.0

### Patch Changes

- refactor: get rid of single-line blocks

## 0.14.0

### Minor Changes

- The language server colours `.cant` files with semantic tokens that say what each name is: actions as functions, models and errors as types, enums, entities, type parameters, parameters, locals, constants (read-only), fields as properties, enum members, namespaces, and built-in values and types. Comments are coloured as comments, in `.cant` files and in Markdown's `cant` code blocks, which the extension still colours from the tokenizer. **Toggle Line Comment** now works in `.cant` files.

### Patch Changes

- The standard library's own source files, in `@dancrumb/cant-compiler`'s `stdlib` folder, are checked as the standard library modules they declare, so editing `IO.cant` or `Collections.cant` no longer reports `ReadStream`, `WriteStream`, type parameters or `Collection<T>` as errors, and `cant check` accepts them. A file with the same name anywhere else is still an ordinary module.

## 0.13.0

### Minor Changes

- Declare `cant::Collections` in Cant, with generic signatures (ADR 0043). Standard library modules can declare type parameters on actions, as in `values<T>(map: {T}): [T]` or `concat<C: Collection>(src: C, tgt: C): C`, and write the generic type `Collection<T>`; a program that does either gets a compile-time error. The compiler ships `stdlib/Collections.cant`, and checks calls to its actions: it works out each call's type parameters from its arguments, reports collections of the wrong kind or element type, and gives the call's result its precise type, so `concat` of two `[NUMBER]`s is a `[NUMBER]`. The parser and formatter handle type parameters and generic types, and compiled programs write them as `typeParameter` and `collection` types. Hovering over a `cant::Collections` action shows its declaration.

- Declare `cant::Errors` in Cant (ADR 0023). The compiler ships `stdlib/Errors.cant`, which declares the eight built-in errors, with no `data`, so every standard library module is now declared in Cant and loaded from its source. A compiled program still records the built-in errors whether or not it imports `cant::Errors`. The compiler no longer exports `STANDARD_LIBRARY` and `StandardKind`; it exports `STANDARD_SOURCES`, the Cant source of each standard library module, by name.

- Declare `cant::IO` in Cant (ADR 0042). The compiler ships `stdlib/IO.cant` and loads it when a program imports `cant::IO`, so calls are checked against its declarations: `write(message: TEXT, stream?: WriteStream := @stdout): VOID` and `read(stream?: ReadStream := @stdin): [NUMBER]`, which both raise `StreamError`. `WriteStream` and `ReadStream` are internal types that only standard library modules can write: a `WriteStream` is `@stdout` or `@stderr`, and a `ReadStream` is `@stdin` or a `FILE`. A compiled program records `cant::IO`'s actions as standard actions, includes its source in the source map, and writes a `ReadStream` as a stream type with `file: true`. The language server shows `cant::IO`'s declarations on hover, and gives no location for them. The interpreter's implementation is still to come.

- Declare `cant::Time` in Cant (ADR 0026). The compiler ships `stdlib/Time.cant`, with `addDays`, `addMonths`, `addYears`, `format` and `parse`, and the errors `UnknownTimeZone`, `NotWholeNumber` and `InvalidDateTime`, and checks calls to them: arguments of the wrong type, a `style` that isn't `"date"`, `"time"` or `"dateTime"`, and results whose errors are never handled. Hovering over a `cant::Time` action shows its declaration.

## 0.12.0

### Minor Changes

- Add a formatter (ADR 0041). `cant fmt <files...>` prints each file formatted, `--write` rewrites the files that change, and `--check` lists the files that aren't formatted and exits with 1. The formatter indents blocks by four spaces, spaces operators, `:=`, commas and type annotations, writes only the parentheses that are needed (and around `and` inside `or`, and a prefix operator in the base of `**`), and puts each item of a collection that spans lines on its own line with a trailing comma. It never wraps lines, keeps literals as written, keeps comments, lining up trailing comments on consecutive lines, and keeps single blank lines. It checks that its output means the same and has the same comments. The language server formats documents, so the VS Code extension supports **Format Document** and format on save. `@dancrumb/cant-shared` exports `format`, and `comments`, which finds the comments in Cant source.

- Add **Cant: Restart Language Server** to the Command Palette. It stops the Cant language server and starts it again.

## 0.11.0

## 0.10.3

### Patch Changes

- The extension is published by `wasakatechnologies`, the Marketplace publisher it belongs to.

## 0.10.2

## 0.10.1

## 0.10.0

## 0.9.0

### Patch Changes

- The extension has an icon, the Cant logo, and `.cant` files show the Cant mark in the explorer.

- The extension can be packaged as a `.vsix` and published to the Visual Studio Marketplace. The package now includes the bundled language server, which it was missing, and a README and licence.

## 0.8.0

### Minor Changes

- The language server, `cant-lsp`, checks each open `.cant` file as the entry of a program and reports every problem `cant check` finds, in that file and in the modules it imports, using the editor's unsaved text. It also offers go to definition, find references, hover, the document outline and completion of keywords, visible names and locals. The VS Code extension starts it for `.cant` files. The compiler now exports `symbolOf`, and the shared package exports `KEYWORDS`.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-lsp@0.8.0
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

### Minor Changes

- Bring the tokenizer and parser up to date with the accepted ADRs. The tokenizer reserves every keyword the ADRs define, recognises number literals, built-in values such as `@subject`, the word operators `orElse`, `isEmpty`, `instanceOf` and `ignore`, and contextual keywords such as `auth` and `raises` where they are special. The parser now handles comments, the full expression grammar with literals, operators and precedence, collection values, security predicates, assignment, `delete`, `raise`, `pass`, `assert` and `ignore`, every type form, error clauses, trigger settings, and `permissions`, `enum`, `model`, `entity`, `error` and `const` declarations, with `export`. The syntax tree has changed accordingly: for example, `nullable` is now `optional`, a trigger's `event` is now `source`, and call arguments are `argument` nodes.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.3.0

## 0.2.0

### Minor Changes

- Tokenize the operators `:=`, `<`, `>`, `<=`, `=>`, `+`, `==`, `*`, `-`, `\`, `and`, `or`, `!` and `.`, and highlight them in VS Code

  Tokens now report where they are as a unist `Position` (`token.position`) instead of `start` and `length`

- Fold Cant code by indentation, and indent the next line after a line that starts a block, such as `body`, `if` or an action's signature

- Add a Cant tokenizer and a VS Code extension that uses it to highlight Cant files and `cant` and `cant-example` code blocks in Markdown

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
