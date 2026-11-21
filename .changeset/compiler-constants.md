---
"@dancrumb/cant-compiler": minor
---

`cant check` now reports constants and trigger source parameters whose values aren't constant expressions (ADRs 0023, 0025, 0034), entity models that hold entities (ADRs 0027, 0035), and defaults that depend on each other in a cycle (ADRs 0020, 0027). Test case names are compared across the whole program, including names built from constants, and `DATE_TIME` and `DURATION` enum values that are equal but written differently count as duplicates.
