# 0045. The `cant::Conversion` module

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

A program can turn a `NUMBER` into `TEXT` by interpolating it, as `"${n}"` ([ADR 0011](0011-converting-values-to-text.md)), but it has no way back. Text that a program reads, such as a line typed at a prompt with `IO::readline` ([ADR 0042](0042-io.md)), stays text, so a program that asks for a number can't use the answer as one.

Programs also read and write numbers in other bases, such as hexadecimal colours or binary flags, which interpolation can't write.

Text that a program reads may not be a number at all, so turning it into one has to be able to fail, in a way the program handles ([ADR 0023](0023-error-handling.md)).

`cant::Conversion` is a standard library module, so it is a native module that ships with the interpreter ([ADR 0031](0031-module-resolution.md), [ADR 0036](0036-native-modules.md)).

## Decision

### The module

`cant::Conversion` is declared by this Cant module, its bridge to the TypeScript that implements it:

```cant
export error NotANumber

export error InvalidBase

export action textToNumber(text: TEXT, base?: NUMBER := 10): NUMBER raises NotANumber, InvalidBase
    native "./Conversion.js"

export action numberToText(number: NUMBER, base?: NUMBER := 10): TEXT raises InvalidBase
    native "./Conversion.js"
```

Like `cant::IO`, it lives in the compiler, as `stdlib/Conversion.cant` in `@dancrumb/cant-compiler`, and the interpreter provides its implementation ([ADR 0042](0042-io.md)).

### Bases

A base is a whole number from 2 to 36. Its digits are `0` to `9`, then `a` to `z` for 10 to 35, as many as the base has: base 16's are `0` to `9` and `a` to `f`. Letters can be either case when reading, and are written in lower case.

Either action raises `InvalidBase` for a base that isn't a whole number from 2 to 36.

### `textToNumber`

`textToNumber` reads `text` as a number written in `base`, which is 10 when it is left out. The text must be, and only be:

- an optional `-`;
- one or more digits of the base;
- optionally, `.` and one or more digits of the base, for a fraction.

So `"42"`, `"-3.25"` and `"007"` are numbers in base 10, and `"ff"` and `"FF"` are both 255 in base 16. Anything else raises `NotANumber`, including:

- spaces before or after the number, so text read from a person may have to be trimmed first;
- `+`, an exponent such as `"1e3"`, a prefix such as `"0x"`, or separators such as `"1_000"`;
- `"."` without digits on both sides, as in `"1."` or `".5"`;
- a digit that isn't one of the base's, such as `"2"` in base 2, or a digit from another script, such as `"١٢"`;
- a number too large for a `NUMBER` to hold ([ADR 0012](0012-base-types.md)).

`"-0"` is `0`, since Cant has no negative zero.

A number in base 10 is read as closely as a `NUMBER` can hold it. Since base 10 is also how Cant writes a `NUMBER` as text ([ADR 0011](0011-converting-values-to-text.md)), any `NUMBER` converted to text reads back as itself.

### `numberToText`

`numberToText` writes `number` in `base`, which is 10 when it is left out.

- **Base 10.** The number is written as Cant converts it to text ([ADR 0011](0011-converting-values-to-text.md)), so `Conversion::numberToText(n)` and `"${n}"` give the same text.
- **Other bases.** The number is written with the same parts that `textToNumber` reads: a `-` if it is negative, its whole part, and, if it has a fraction, `.` and the fraction's digits. An exponent is never used. A fraction is written with as many digits as it takes to tell the number apart from its neighbours, so a number written in a base reads back as itself. A fraction that doesn't end in that base, such as a tenth in base 2, is written to that many digits and no more.

### Errors

`NotANumber` and `InvalidBase` have no data, since the program already has the text and the base it gave.

```cant
import Conversion

guess := Conversion::textToNumber(line)
if guess instanceOf Conversion::NotANumber
    IO::write("That isn't a number.\n")
```

## Deferred

- **Trimming.** A way to ignore spaces around a number, or a `TEXT` action that removes them.
- **Other formats.** Reading or writing with an exponent, digit separators, a sign for positive numbers, or a fixed number of digits after the point.
- **Locales.** Reading and writing numbers as people in different places write them, such as `"1.234,5"`.
- **Other conversions.** Between `TEXT` and the other base types, such as `BOOLEAN` or `DURATION`.

## Consequences

- A program can read a number that a person types, and handle text that isn't one as an error.
- Base 10 round-trips through `"${n}"` and `textToNumber`, so a program can write a number to text and read it back without losing anything.
- Reading is strict, so text that people would read as a number, such as `" 42"` or `"+1"`, raises `NotANumber`. In exchange, what is accepted is the same in every base, and is exactly what `numberToText` writes.
- `textToNumber`'s default base means a call that gives only the text can leave the name out, as `Conversion::textToNumber(line)` does ([ADR 0020](0020-action-parameters.md)).
- Every call can raise `InvalidBase`, even with the default base, so a program handles it, often by ignoring it when it gives a fixed base.
