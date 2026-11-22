# @dancrumb/cant-shared

## 0.18.0

### Minor Changes

- Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.

## 0.17.0

### Minor Changes

- make `error` a contextual keyword

## 0.16.0

## 0.15.0

### Minor Changes

- Implement the standard library's actions in the interpreter (ADRs 0021, 0026, 0036, 0042). The interpreter exports `STANDARD_ACTIONS`, the implementation of every `cant::IO`, `cant::Collections` and `cant::Time` action, by the symbol a compiled program names it with, such as `cant::IO#write`, each called with its arguments and context as ADR 0036 describes. `cant::IO` writes UTF-8 to and reads bytes from the standard streams and `FILE`s, raising `StreamError`; `cant::Collections` changes and compares sets with Cant's equality and converts members to text as the language does; and `cant::Time` does calendar moves in IANA time zones with date-fns, formats at `Intl`'s medium length, and parses `DATE_TIME` text. The native API, `@dancrumb/cant-native`, with `CantError`, `CantDuration` and `CantFile`, is a private package for now, bundled into the interpreter. `@dancrumb/cant-shared` exports `isDateTimeText`, which the parser now uses to check `DATE_TIME` literals.

### Patch Changes

- refactor: get rid of single-line blocks

## 0.14.0

## 0.13.0

### Minor Changes

- Declare `cant::Collections` in Cant, with generic signatures (ADR 0043). Standard library modules can declare type parameters on actions, as in `values<T>(map: {T}): [T]` or `concat<C: Collection>(src: C, tgt: C): C`, and write the generic type `Collection<T>`; a program that does either gets a compile-time error. The compiler ships `stdlib/Collections.cant`, and checks calls to its actions: it works out each call's type parameters from its arguments, reports collections of the wrong kind or element type, and gives the call's result its precise type, so `concat` of two `[NUMBER]`s is a `[NUMBER]`. The parser and formatter handle type parameters and generic types, and compiled programs write them as `typeParameter` and `collection` types. Hovering over a `cant::Collections` action shows its declaration.

- Declare `cant::IO` in Cant (ADR 0042). The compiler ships `stdlib/IO.cant` and loads it when a program imports `cant::IO`, so calls are checked against its declarations: `write(message: TEXT, stream?: WriteStream := @stdout): VOID` and `read(stream?: ReadStream := @stdin): [NUMBER]`, which both raise `StreamError`. `WriteStream` and `ReadStream` are internal types that only standard library modules can write: a `WriteStream` is `@stdout` or `@stderr`, and a `ReadStream` is `@stdin` or a `FILE`. A compiled program records `cant::IO`'s actions as standard actions, includes its source in the source map, and writes a `ReadStream` as a stream type with `file: true`. The language server shows `cant::IO`'s declarations on hover, and gives no location for them. The interpreter's implementation is still to come.

## 0.12.0

### Minor Changes

- Add a formatter (ADR 0041). `cant fmt <files...>` prints each file formatted, `--write` rewrites the files that change, and `--check` lists the files that aren't formatted and exits with 1. The formatter indents blocks by four spaces, spaces operators, `:=`, commas and type annotations, writes only the parentheses that are needed (and around `and` inside `or`, and a prefix operator in the base of `**`), and puts each item of a collection that spans lines on its own line with a trailing comma. It never wraps lines, keeps literals as written, keeps comments, lining up trailing comments on consecutive lines, and keeps single blank lines. It checks that its output means the same and has the same comments. The language server formats documents, so the VS Code extension supports **Format Document** and format on save. `@dancrumb/cant-shared` exports `format`, and `comments`, which finds the comments in Cant source.

## 0.11.0

### Minor Changes

- Add the built-in values `@stdin`, `@stdout` and `@stderr`, the interpreter process's standard streams (ADR 0040). They can be used in any trigger or action, but not in a constant expression. `@stdin` has an input stream type and `@stdout` and `@stderr` an output stream type, which a program can't name. A stream can't be converted to text, given where an `UNKNOWN` is expected, or compared with a stream of the other direction. `@dancrumb/cant-shared`'s compiled types gain `{ kind: 'stream', direction }`. Error messages that start with a type's description now start with a capital letter.

## 0.10.3

## 0.10.2

## 0.10.1

### Patch Changes

- initial publish of some packages

## 0.10.0

### Minor Changes

- The compiler can now compile a program for the interpreter (ADR 0039). `compile()` checks a program and gives its compiled program and source map, and `cant build` writes them to disk, as `<entry>.compiled.json` and `<entry>.compiled.json.map` in the program's root, or where `-o` says, with `--no-source-map` to leave the source map out. A build with problems writes nothing and removes the files an earlier build wrote. `@dancrumb/cant-shared` declares the compiled program's types. A constant can now declare an enum type and give one of its values, as in ADR 0034's `const defaultStatus: InvoiceStatus := "draft"`, which `cant check` wrongly rejected.

## 0.9.0

### Minor Changes

- `@dancrumb/cant-shared` has an evaluator for constant expressions, `evaluate`, which the compiler and the interpreter share, with the values it gives (`Value`) and their conversion to text (`toText`). The compiler now uses it to find constant divisors and test case names, so names built from any constant value, such as a fractional number, an enum member or a date, are compared. `cant check` also reports a constant expression that can't be worked out, such as a `DATE_TIME` out of range, since it would fail when the program starts.

## 0.8.0

### Minor Changes

- The language server, `cant-lsp`, checks each open `.cant` file as the entry of a program and reports every problem `cant check` finds, in that file and in the modules it imports, using the editor's unsaved text. It also offers go to definition, find references, hover, the document outline and completion of keywords, visible names and locals. The VS Code extension starts it for `.cant` files. The compiler now exports `symbolOf`, and the shared package exports `KEYWORDS`.

## 0.7.0

### Patch Changes

- Type `ParseError` in the published declarations, with its `location`, `expected` and `found`, which were `any` because the declarations are built from the generated parser.

## 0.6.0

### Minor Changes

- Parse native actions, `action A(): VOID` with `native "./a.js"` in place of `body`, into `action` nodes with a `native` module; `assertions` blocks in triggers, each `condition, message`, into `assertion` nodes; `membership user in organization with roles` lines in entities; `@entity` and other built-in names as object member names; the `DURATION` base type; and `DATE_TIME("…")` and `DURATION("…")` literals, which are checked against ISO 8601 and can be enum values. The tokenizer reserves `DURATION` and marks `native`, `assertions`, `membership` and its `with` as keywords where they are special.

## 0.5.0

### Minor Changes

- Lock the language design: every ADR from 0001 to 0037 is accepted, and later changes are recorded as new ADRs that supersede or amend them.

## 0.4.0

### Minor Changes

- Parse `relation` declarations, such as `relation User[tasks] 1 --- 0..* Task[owner]`, into `relation` nodes with an entity, navigation field and cardinality at each end. The tokenizer reserves `relation` and recognises cardinalities and `---`.

- Parse `within` followed by any name, member or call, such as `within @message.organization`, and re-exports of imported symbols, such as `export accounts::FindUser as LookupUser`. The tokenizer marks `as` as a keyword in a re-export.

## 0.3.2

### Patch Changes

- Keep an interpolation open past an object or other braces written inside it, so that only the `}` matching `${` ends it.

## 0.3.1

## 0.3.0

### Minor Changes

- Bring the tokenizer and parser up to date with the accepted ADRs. The tokenizer reserves every keyword the ADRs define, recognises number literals, built-in values such as `@subject`, the word operators `orElse`, `isEmpty`, `instanceOf` and `ignore`, and contextual keywords such as `auth` and `raises` where they are special. The parser now handles comments, the full expression grammar with literals, operators and precedence, collection values, security predicates, assignment, `delete`, `raise`, `pass`, `assert` and `ignore`, every type form, error clauses, trigger settings, and `permissions`, `enum`, `model`, `entity`, `error` and `const` declarations, with `export`. The syntax tree has changed accordingly: for example, `nullable` is now `optional`, a trigger's `event` is now `source`, and call arguments are `argument` nodes.

## 0.2.0

### Minor Changes

- Tokenize the operators `:=`, `<`, `>`, `<=`, `=>`, `+`, `==`, `*`, `-`, `\`, `and`, `or`, `!` and `.`, and highlight them in VS Code

  Tokens now report where they are as a unist `Position` (`token.position`) instead of `start` and `length`

- Tokenize `>=` and `!=` as operators, and stop tokenizing `=>` as one

- Tokenize `/`, `%` and `**` as operators, stop tokenizing `\` as one, and skip `//` comments

- Remove the `enqueue … with` statement and its AST node, and stop treating `enqueue` and `with` as keywords so they can be used as identifiers

- Remove the `queue … with` statement, and stop treating `queue` as a keyword so it can be used as an identifier

- Parse and tokenize actions and strings as described in ADRs 0007 and 0008

  - Blocks are delimited by indentation instead of braces, and statements end at the end of the line instead of at `;`. An action's statements go in an indented `body` block.
  - Actions take parameters (optionally marked `?`, with default values) and a return type that may be marked `?` as nullable. Types can be names, `ns::Name` or `enum("a", "b")`.
  - Action bodies support `return`, `break`, `continue`, `for … in`, `while`, `if` / `else if` / `else`, `enqueue … with` and `queue … with`.
  - Every string is a template string with escapes (`\"`, `\\`, `\$`, `\n`, `\t`, `\u{…}`) and `${…}` interpolations. `string` nodes now have `parts` instead of `value`, and the tokenizer splits strings around their interpolations.
  - `into` and `as` are tokenized as keywords on `import` lines.

- Add a Peggy-based parser, `parse`, that builds a unist syntax tree for Cant source

- Tokenize the `namespace` keyword and the `::` scope operator from ADR 0005

- Parse `namespace` declarations, `ns::symbol` references, and imports of the form `import <module> [into <identifier>] [as <string>]`, following ADRs 0005 and 0006

  The `module` of an `import` node is now a `moduleName` node (with an optional `scope`) or a string, instead of an identifier

- Add a Cant tokenizer and a VS Code extension that uses it to highlight Cant files and `cant` and `cant-example` code blocks in Markdown
