# cant-vscode

## 0.2.0

### Minor Changes

- Tokenize the operators `:=`, `<`, `>`, `<=`, `=>`, `+`, `==`, `*`, `-`, `\`, `and`, `or`, `!` and `.`, and highlight them in VS Code

  Tokens now report where they are as a unist `Position` (`token.position`) instead of `start` and `length`

- Fold Cant code by indentation, and indent the next line after a line that starts a block, such as `body`, `if` or an action's signature

- Add a Cant tokenizer and a VS Code extension that uses it to highlight Cant files and `cant` and `cant-example` code blocks in Markdown

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
