# @dancrumb/cant

## 0.17.0

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.17.0
  - @dancrumb/cant-interpreter@0.17.0
  - @dancrumb/cant-shared@0.17.0

## 0.16.0

### Minor Changes

- Run programs (ADR 0039). The interpreter exports `run(program, { root, sourceMap })`, which runs a compiled program's `Start` triggers, with their arguments, and `Panic`. This first version runs actions with bodies and the standard library's actions, with arguments, defaults, locals, `return`, and strings with interpolations, and gives `@stdin`, `@stdout`, `@stderr` and `@now`; anything else panics, saying the interpreter can't run it yet. The `cant` command moves to a new package, `@dancrumb/cant`, which depends on the compiler and the interpreter, and gains `cant version`, which prints Cant's version, and `cant run`, which runs an entry `.cant` file, compiling it first, or a compiled program from `cant build`, and reports a panic with its source as a diagnostic is. The compiler no longer provides the `cant` binary: install `@dancrumb/cant` for it.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.16.0
  - @dancrumb/cant-interpreter@0.16.0
  - @dancrumb/cant-shared@0.16.0
