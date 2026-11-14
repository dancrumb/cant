---
"@dancrumb/cant-shared": minor
---

Parse and tokenize actions and strings as described in ADRs 0007 and 0008

- Blocks are delimited by indentation instead of braces, and statements end at the end of the line instead of at `;`. An action's statements go in an indented `body` block.
- Actions take parameters (optionally marked `?`, with default values) and a return type that may be marked `?` as nullable. Types can be names, `ns::Name` or `enum("a", "b")`.
- Action bodies support `return`, `break`, `continue`, `for … in`, `while`, `if` / `else if` / `else`, `enqueue … with` and `queue … with`.
- Every string is a template string with escapes (`\"`, `\\`, `\$`, `\n`, `\t`, `\u{…}`) and `${…}` interpolations. `string` nodes now have `parts` instead of `value`, and the tokenizer splits strings around their interpolations.
- `into` and `as` are tokenized as keywords on `import` lines.
