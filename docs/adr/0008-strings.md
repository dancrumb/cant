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
EscapeSequence     = '\', ('"' | '\' | '$' | 'n' | 't' | UnicodeEscape) ;
UnicodeEscape      = 'u{', HexDigit, [HexDigit], [HexDigit], [HexDigit], [HexDigit], [HexDigit], '}' ;
Interpolation      = "${", Expression, "}" ;
```

- **Literal text** is any run of characters other than `"`, `\` and line breaks. A `$` is literal unless it is followed by `{`.
- **Escape sequences** start with `\`. They let a string contain characters that would otherwise end it or start an interpolation, such as `\"`, `\\` and `\${`, and characters that are hard to type or see.
- **Interpolations** are written `${ … }`, as in JavaScript, Kotlin and shell, and contain an `Expression`. The source EBNF names the opening token `?templateStart?` without spelling it; this ADR spells it `${`. When the string is evaluated, the expression is evaluated and its result is inserted in place of the interpolation. Expressions are defined in [ADR 0019](0019-operators.md), and how a result that is not a string is converted to text is defined in [ADR 0011](0011-converting-values-to-text.md).

A string with no interpolations is simply a template that always produces the same text, so there is no separate syntax for a "plain" string.

### Escape sequences

Cant starts with a minimal set of escape sequences:

| Escape | Stands for |
| --- | --- |
| `\"` | A double quote |
| `\\` | A backslash |
| `\$` | A dollar sign, so `\${` is literal text, not an interpolation |
| `\n` | A line feed |
| `\t` | A tab |
| `\u{…}` | The Unicode code point with the given hexadecimal value, from one to six digits, up to `10FFFF` |

Any other character after `\`, or a `\u{…}` above `10FFFF`, is an error. More escapes can be added later without changing the meaning of existing programs, because none of them are valid today.

### Line breaks

A string cannot span lines. A line break before the closing `"` is an error. To put a line break in a string, use `\n`. Multi-line strings may be added in a later ADR.

## Consequences

- There is one string syntax to learn, and any string can gain an interpolation without changing its delimiters.
- A literal `${` must be escaped, so text that contains it, such as shell snippets, is slightly awkward to write.
- Strings can contain expressions, and those expressions can contain strings (`"a ${f("b")} c"`). The tokenizer can no longer match a string with one regular expression; it has to track nesting.
- The `string` node in the syntax tree, which currently holds a single `value`, has to be able to hold a mix of text and expressions.
- Wherever the language needs a string whose value is known at compile time, such as a module identifier in an `import` or an inline `enum`, interpolations must be disallowed or required to be constant. That rule belongs to those constructs.
