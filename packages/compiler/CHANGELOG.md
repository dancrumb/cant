# @dancrumb/cant-compiler

## 0.7.0

### Minor Changes

- Add `cant check <files...>`, which parses each Cant file, reports a syntax error where it is, and reports names declared twice where the ADRs allow only one: types, actions and constants in a namespace, exported symbols, test case names, and parameters, fields, enum members and values, roles and entity lines inside a declaration. The package now exports `check`, `collectDeclarations` and `formatDiagnostic`, and a symbol table of each module's declarations by namespace.

- `cant check` now reports constants and trigger source parameters whose values aren't constant expressions (ADRs 0023, 0025, 0034), entity models that hold entities (ADRs 0027, 0035), and defaults that depend on each other in a cycle (ADRs 0020, 0027). Test case names are compared across the whole program, including names built from constants, and `DATE_TIME` and `DURATION` enum values that are equal but written differently count as duplicates.

- `cant check` now checks error handling (ADR 0023). Calls to actions with `raises` or `passes`, and `/` and `%` unless the divisor is a non-zero constant, give results that must be handled: checked with `instanceOf`, passed, ignored or used. It reports results that are never handled, unchecked results returned, errors raised or passed that the action doesn't declare, `raise` data that doesn't match the error's, duplicate and misplaced error clauses, division by a constant zero, fractional `%` operands, and statements that can raise `IndexBeforeStart`, `UnknownField`, `RequiredField`, `CardinalityViolation` or `InvalidEnumValue` without listing it. `instanceOf` narrows results and errors on both branches, and `@result`, `@error` and an error's `data` are typed.

- Place a symbolic import without `into` in a namespace named after the module too, as well as the current namespace (ADR 0038), so `import IO` followed by `IO::write(…)` checks.

- `cant check` now resolves names inside expressions and statements, with local scopes for parameters, assignments and loop variables. It reports names that are out of scope, identifiers assigned twice in one block, `break` and `continue` outside a loop, calls of anything but an action, actions and types used as values, unknown enum members, arguments that don't match an action's parameters in calls and triggers, unknown `TestCase` parameters, and built-in values that don't exist or are used where they can't be. It also checks entities and security declarations: the fields `expose`, `hide`, `identity` and `membership` name, navigation fields that clash, subjects without an `identity` or with identity fields claims can't carry, roles without a `group`, and the group kinds, roles and permissions that `permissions` declarations and predicates name.

- `cant check` now checks whole programs: it follows each entry file's imports, resolving them through the `cant` standard library, `cant.json` scopes and relative files, and rejecting remote URLs and `as`. It works out each module's exports and re-exports, places imported symbols by `into` or the current namespace, reports names that clash there, and resolves the types, errors, models, entities and actions that declarations refer to, reporting unknown names and namespaces and names of the wrong kind. The package exports `checkProgram`, `loadProgram` and `resolveNames`.

- `cant check` now checks types. It reports operators given operands they don't take, including on dates and durations; conditions that aren't `BOOLEAN` and messages that aren't `TEXT`; arguments, returns, assignments, defaults and constants whose values don't fit, with enum compatibility and object values matched against models; fields a value doesn't have; VOID results used as values; actions that can end without returning a value; and values that can't be interpolated. Optionals must be checked before they are used, with narrowing by `isEmpty`, `instanceOf` and `@subject is`, through `!`, `and`, `or`, early returns, `assert` and earlier assertions.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.4.0

## 0.3.2

## 0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.3.0

## 0.2.0

### Minor Changes

- Add support for an output file parameter for `weave` and make `weave` into a binary

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
