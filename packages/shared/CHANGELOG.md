# @dancrumb/cant-shared

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
