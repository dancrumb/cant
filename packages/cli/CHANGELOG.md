# @dancrumb/cant

## 0.19.0

### Minor Changes

- Run arrays, sets, `if`, `instanceOf` and prefix operators (ADR 0021, ADR 0033, ADR 0019). The interpreter holds arrays, with their empty slots, and sets, makes them from literals, passes them to native code as an `Array` and a `Set`, and takes an `Array`, a `Set` or a `Map` back, so `IO::read()` gives its bytes. It runs `if` and `else`, checks a value with `instanceOf` against a base type, `UNKNOWN`, `ERROR`, a declared error, model or enum, an optional or a collection, and applies `-`, `!`, `isEmpty` and `ignore`. A collection is converted to text as its elements joined with `", "`, and an error, once narrowed, as its name and its data, so `"OOPS: ${problem}"` writes `OOPS: StreamError: reason: …`.

- Add `IO::readline(stream?: ReadStream := @stdin): TEXT? raises StreamError` (ADR 0042). It reads the next line of a stream, decoded as UTF-8, without its `\n` or `\r\n`, and returns as soon as the line ends, so an interactive program can read answers as they are typed. It takes only the line from the stream, leaving the rest for later reads, and gives `NOTHING` once the stream has ended. A `FILE` gives its first line.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.19.0
  - @dancrumb/cant-interpreter@0.19.0
  - @dancrumb/cant-shared@0.19.0

## 0.18.0

### Minor Changes

- Add `cant::Console`, the standard library module for logging (ADR 0044). The compiler ships `stdlib/Console.cant`, which declares `LogLevel` (`Error`, `Warn`, `Info`, `Debug`, `Trace`), an action for each level, `error`, `warn`, `info`, `debug` and `trace`, each taking `message: TEXT` and `data?: {UNKNOWN}`, and `log`, which also takes `level?: LogLevel := LogLevel.Info`. The interpreter implements them: each call writes one line to the program's `@stderr`, the level padded to five characters, the message, and the data's members as text, two spaces after it, and never raises, dropping a line it can't write. The interpreter also evaluates map literals, gives maps to native code as a `Map`, and converts them to text, and gives standard library actions the program's streams in their context.

- Run object values and model construction (ADR 0027, ADR 0039). The interpreter evaluates object values, and makes an object value given where a model is expected into an object of that model: it takes the members it is given, then works out each missing field's default in the order the compiler gives, so that a default can use the model's other fields, and orders the members as the model's fields. An optional field with no value is left out, and a required field with no value panics. So a program can pass `{ … }` for a model, such as in a trigger's `arguments`, to `cant run`.

- Let an object of a named model be given where a `{UNKNOWN}` is expected (ADR 0027), such as `Console::warn(message := "Low", data := disk)`. It is given as a copy: a new map of the object's fields that have values, so a change made through the map never reaches the object. It still can't be given for a map of any other type. A compiled program records the copy as a new `copyToMap` expression (ADR 0039), which the interpreter evaluates.

### Patch Changes

- Updated dependencies:
  - @dancrumb/cant-compiler@0.18.0
  - @dancrumb/cant-interpreter@0.18.0
  - @dancrumb/cant-shared@0.18.0

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
