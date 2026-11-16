# @dancrumb/cant-shared

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
