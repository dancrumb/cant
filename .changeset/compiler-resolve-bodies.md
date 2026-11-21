---
"@dancrumb/cant-compiler": minor
---

`cant check` now resolves names inside expressions and statements, with local scopes for parameters, assignments and loop variables. It reports names that are out of scope, identifiers assigned twice in one block, `break` and `continue` outside a loop, calls of anything but an action, actions and types used as values, unknown enum members, arguments that don't match an action's parameters in calls and triggers, unknown `TestCase` parameters, and built-in values that don't exist or are used where they can't be. It also checks entities and security declarations: the fields `expose`, `hide`, `identity` and `membership` name, navigation fields that clash, subjects without an `identity` or with identity fields claims can't carry, roles without a `group`, and the group kinds, roles and permissions that `permissions` declarations and predicates name.
