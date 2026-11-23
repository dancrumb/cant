---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Add `cant::Text` (ADR 0046): `length`, `split`, `trim`, `trimLeft`, `trimRight`, `slice`, `charAt` and `repeat`. A character is a Unicode code point, so an emoji counts as one, and positions work as array indexes do: from 0, negative from the end, and truncated towards zero. `charAt` gives `NOTHING` past either end, `slice` takes a position past an end as that end, and `split` with `""` gives each character.
