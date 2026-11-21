---
---

Accept ADR 0037 on the `TestCase` trigger source: test cases are triggers with a `name` and an optional `subject`, checked by an `assertions` block that can use `@result` and the new `@error` built-in, each run with fresh storage. Adds `assertions` to the trigger settings (ADR 0009), `@error` to the built-in values (ADR 0024), and lets `@entity` be a member name in a test case's `subject` (ADR 0021).
