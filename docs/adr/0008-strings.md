# 0008. Strings

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Cant needs a single, predictable way to write text. Many languages have several kinds of string literal (single-quoted, double-quoted, raw, template) with different rules for escaping and interpolation, which is a common source of confusion.

The current grammar only supports a plain double-quoted string with no escapes and no interpolation.

## Decision

Cant has one kind of string. Every string is a **template string**, delimited by double quotes (`"`), and can contain literal text, escape sequences and embedded expressions:

```cant
"Hello, World!"
"Hello, ${name}!"
"She said \"hi\""
```

The grammar uses ISO/IEC 14977 EBNF, with rule names that match [`cant.peggy`](../../packages/shared/src/cant.peggy):

```ebnf
StringLiteral      = '"', {StringCharacter | EscapeSequence | Interpolation}, '"' ;
StringCharacter    = ? any character except '"', '\', a line break, or a '$' that starts an Interpolation ? ;
EscapeSequence     = '\', ? an escape character ? ;
Interpolation      = "${", Expression, "}" ;
```

- **Literal text** is any run of characters other than `"`, `\` and line breaks. A `$` is literal unless it is followed by `{`.
- **Escape sequences** start with `\`. They let a string contain characters that would otherwise end it or start an interpolation, such as `\"`, `\\` and `\${`.
- **Interpolations** are written `${ … }` and contain an `Expression`. When the string is evaluated, the expression is evaluated and its result is inserted in place of the interpolation. Expressions are defined in a later ADR.

A string with no interpolations is simply a template that always produces the same text, so there is no separate syntax for a "plain" string.

## Open questions

These need answers before this ADR is accepted:

- **Escape sequences.** Which characters can follow `\`? A likely minimum is `\"`, `\\`, `\$`, `\n`, `\t` and a Unicode escape such as `\u{1F600}`. What happens to an unrecognised escape: an error, or the character itself?
- **Interpolation delimiter.** The source EBNF names the opening token `?templateStart?` without spelling it. This draft assumes `${`.
- **Multi-line strings.** Can a string span lines? This draft says no, matching the current tokenizer and parser.
- **Converting values to text.** How is a non-string result of an interpolated expression turned into text? For example, `null`, numbers and objects.

## Consequences

- There is one string syntax to learn, and any string can gain an interpolation without changing its delimiters.
- A literal `${` must be escaped, so text that contains it, such as shell snippets, is slightly awkward to write.
- Strings can contain expressions, and those expressions can contain strings (`"a ${f("b")} c"`). The tokenizer can no longer match a string with one regular expression; it has to track nesting.
- The `string` node in the syntax tree, which currently holds a single `value`, has to be able to hold a mix of text and expressions.
- Wherever the language needs a string whose value is known at compile time, such as a module identifier in an `import` or an inline `enum`, interpolations must be disallowed or required to be constant. That rule belongs to those constructs.
