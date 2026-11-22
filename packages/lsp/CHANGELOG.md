# @dancrumb/cant-lsp

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
