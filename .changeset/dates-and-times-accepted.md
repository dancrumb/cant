---
---

Accept ADR 0026 on dates and times: a `DATE_TIME` is a UTC instant, `DURATION` is a new base type for exact lengths of time, both have ISO 8601 literals such as `DATE_TIME("…")`, `@now` is the instant the trigger fired, arithmetic mixes the two, and calendar arithmetic, formatting and parsing are actions in `cant::Time`. ADRs 0011, 0012, 0013, 0019, 0023, 0024, 0025, 0036 and 0037 are updated to match.
