# 0002. Share language code in `@dancrumb/cant-shared`

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Cant has several tools that need to understand Cant source: the compiler, the interpreter, the language server and the VS Code extension. If each one tokenized and parsed source its own way, they would drift apart and disagree about what is valid Cant.

## Decision

Code that understands the language itself, such as the tokenizer, the parser and the syntax tree types, lives in `@dancrumb/cant-shared`. The other packages depend on it, not on each other.

## Consequences

- Every tool reads Cant the same way, and a change to the language is made in one place.
- `cant-shared` is a published package. Changes to its exports, such as the shape of a token or a syntax tree node, affect every package that uses it and need a changeset.
- Code that only one tool needs belongs in that tool's package, not in `cant-shared`.
