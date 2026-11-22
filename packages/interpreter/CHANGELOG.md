# @dancrumb/cant-interpreter

## 0.16.0

### Minor Changes

- Run programs (ADR 0039). The interpreter exports `run(program, { root, sourceMap })`, which runs a compiled program's `Start` triggers, with their arguments, and `Panic`. This first version runs actions with bodies and the standard library's actions, with arguments, defaults, locals, `return`, and strings with interpolations, and gives `@stdin`, `@stdout`, `@stderr` and `@now`; anything else panics, saying the interpreter can't run it yet. The `cant` command moves to a new package, `@dancrumb/cant`, which depends on the compiler and the interpreter, and gains `cant version`, which prints Cant's version, and `cant run`, which runs an entry `.cant` file, compiling it first, or a compiled program from `cant build`, and reports a panic with its source as a diagnostic is. The compiler no longer provides the `cant` binary: install `@dancrumb/cant` for it.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.16.0

## 0.15.0

### Minor Changes

- Implement the standard library's actions in the interpreter (ADRs 0021, 0026, 0036, 0042). The interpreter exports `STANDARD_ACTIONS`, the implementation of every `cant::IO`, `cant::Collections` and `cant::Time` action, by the symbol a compiled program names it with, such as `cant::IO#write`, each called with its arguments and context as ADR 0036 describes. `cant::IO` writes UTF-8 to and reads bytes from the standard streams and `FILE`s, raising `StreamError`; `cant::Collections` changes and compares sets with Cant's equality and converts members to text as the language does; and `cant::Time` does calendar moves in IANA time zones with date-fns, formats at `Intl`'s medium length, and parses `DATE_TIME` text. The native API, `@dancrumb/cant-native`, with `CantError`, `CantDuration` and `CantFile`, is a private package for now, bundled into the interpreter. `@dancrumb/cant-shared` exports `isDateTimeText`, which the parser now uses to check `DATE_TIME` literals.

### Patch Changes

- refactor: get rid of single-line blocks

- Updated dependencies:
  - @dancrumb/cant-shared@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.11.0

## 0.10.3

## 0.10.2

## 0.10.1

### Patch Changes

- initial publish of some packages

## 0.10.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.8.0

## 0.7.0

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

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-shared@0.2.0
