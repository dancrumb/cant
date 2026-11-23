---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Add `cant::Conversion` (ADR 0045): `textToNumber(text, base?)`, which reads a number written in a base from 2 to 36, with an optional `-` and fraction, and raises `NotANumber` for anything else, and `numberToText(number, base?)`, which writes one. Base 10 is the default, and writes as `"${n}"` does. Every number written in any base reads back as itself: reading rounds the exact value once, and writing uses the fewest digits that read back. Either raises `InvalidBase` for a base that isn't a whole number from 2 to 36.
