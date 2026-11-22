# cant-vscode

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
