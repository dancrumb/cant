# 0041. Formatting

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Cant source can be laid out in many ways that mean the same thing. Spaces around operators and `:=` are optional, an action's return type can be written `():VOID` or `(): VOID`, blocks can be indented by any amount ([ADR 0007](0007-actions.md)), and inside brackets, braces and a set's parentheses, layout is free ([ADR 0021](0021-collections.md)). Code written by different people, or by one person on different days, drifts apart, and reviews spend time on layout instead of meaning.

The examples in these ADRs already share a style: four spaces of indentation, `name: Type` and `): ReturnType`, spaces around `:=` and binary operators, `{ name := value }` with spaces inside the braces, `[a, b]` without, and multi-line objects with one item per line and a trailing comma.

A formatter that prints a program from its syntax tree gives every program that layout. The tree ([ADR 0003](0003-parse-with-peggy-into-a-unist-tree.md)) has no comments, no blank lines and no grouping parentheses, so those have to be handled separately.

## Decision

Cant has a formatter. It prints a module from its syntax tree in the layout below, puts back the source's comments, and keeps single blank lines where the source has them. Formatting formatted source changes nothing.

### Layout

- **Indentation** is four spaces per block, whatever the source uses.
- **Spacing:** one space around `:=`, binary operators, `instanceOf` and the `---` of a relation; one space after a comma and after `:` in `name: Type` and `): ReturnType`; none inside parentheses or square brackets; one inside the braces of an object value written on one line, `{ name := value }`. A word operator, such as `isEmpty`, is followed by one space, and a symbol, such as `!` or `-`, by none.
- **Parentheses:** only where precedence needs them ([ADR 0019](0019-operators.md)), plus two cases where they make grouping plain: `and` inside `or`, as in `(a and b) or c`, and a prefix operator in the base of `**`, as in `(-a) ** 2`.
- **Literals** are kept as written: a number keeps its base, separators and exponent, and a string keeps its escapes. Interpolations inside a string are formatted like any other expression.
- **Collections:** an array, set or object value written on one line stays on one line. One that spans lines has each item on its own line, indented one level, with a trailing comma, and its closing bracket on its own line, lined up with the line that opens it. An empty collection is `[]`, `{}` or `SET()`, unless it holds comments.
- **Line length:** the formatter never wraps a line or joins lines. The only line breaks it adds are in collections that already span lines.
- **Order:** declarations, statements and the lines of a block keep their order. A trigger's `auth`, `arguments`, `parameters` and `assertions` blocks, and an action's `raises` and `passes` clauses, keep the order the source gives them.

### Comments and blank lines

- A comment after code stays at the end of the line that code is printed on, two spaces after it. The comments of consecutive lines at the same indentation are lined up, two spaces after the longest line.
- A comment on its own line stays on its own line, before the code that follows it, indented like the code its source indentation matches. A comment indented further than the line before it, where that line starts a block, goes inside the block, so a block that holds only comments still does.
- A comment's text is kept as written, without trailing whitespace.
- One or more blank lines between two lines become one. Blank lines at the start and end of the file, at the start of a block, and before a closing bracket are removed.
- A file ends with one line break. A file with Windows line endings keeps them.

### Safety

The formatter checks its own output: it must parse to the same syntax tree, ignoring positions, and have the same comments in the same order. If it doesn't, that is a bug in the formatter, which reports it and leaves the source unchanged. Source that doesn't parse isn't formatted; the syntax error is reported instead.

### Tools

`@dancrumb/cant-shared` exports `format(source)`, which the command line and the language server share.

`cant fmt <files...>` formats each file:

| Option | Does |
| --- | --- |
| (none) | Prints the formatted source of each file. |
| `-w`, `--write` | Rewrites each file that changes, and names it. |
| `--check` | Names each file that isn't formatted, and changes nothing. It can't be used with `--write`. |

It exits with 1 if a file has a syntax error or, with `--check`, isn't formatted, and with 2 if a file can't be read, as `cant check` does.

The language server formats a document when the editor asks, so in VS Code **Format Document** and format on save use the formatter. A document with a syntax error is left as it is.

The formatter formats `.cant` files only, not `cant` code blocks in Markdown.

## Consequences

- Every formatted program has the same layout, so diffs and reviews show changes in meaning, not in layout. A CI job can run `cant fmt --check`.
- Redundant parentheses that an author added for clarity are removed, except in the two cases above.
- Hand-aligned comments that aren't on consecutive lines are no longer lined up with each other.
- Long lines stay long. Wrapping can come later, as a change to this ADR, without changing the rest of the layout.
- The examples in these ADRs aren't formatted, and many are fragments that don't parse as a whole module. Formatting `cant` blocks in Markdown is left for later.
- Every change to the grammar needs a matching change to the formatter. The formatter's self-check catches a construct it prints wrongly, but only when that construct is formatted.
