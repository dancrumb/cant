# 0040. Standard streams

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

A Cant program runs in the interpreter's process, which has standard input, standard output and standard error, like any other process. A program that greets the world, logs what it does, or reports a problem needs some way to name those streams, for example to tell `cant::IO` where to write.

[ADR 0015](0015-files.md) leaves reading and writing to `cant::IO`, which isn't designed yet. Earlier examples call `IO::write("Hello World!")` without saying where the text goes ([ADR 0012](0012-base-types.md), [ADR 0038](0038-namespaces-from-imports.md)).

The streams belong to the process, not to the program, and the program can't create them, so they fit what built-in values are for ([ADR 0024](0024-built-in-values.md)). That ADR's list of built-in values is closed, and a new one needs an ADR.

A `FILE` doesn't fit. It is a document with an identifier facet, its URL, and stream and blob facets that read its contents ([ADR 0015](0015-files.md), [ADR 0017](0017-faceted-types.md)). Standard output and standard error can't be read, and none of the three has a URL that means anything outside the process.

## Decision

### The built-in values

Cant has three more built-in values ([ADR 0024](0024-built-in-values.md)):

| Built-in value | Stands for | Type |
| --- | --- | --- |
| `@stdin` | The interpreter process's standard input | The input stream type |
| `@stdout` | The interpreter process's standard output | The output stream type |
| `@stderr` | The interpreter process's standard error | The output stream type |

```cant
import IO

action SayHello(person: TEXT): VOID
    body
        IO::write(to := @stdout, text := "Hello ${person}")
```

The names of `IO::write`'s parameters here are only for illustration. They belong to `cant::IO`'s own ADR (see [Deferred](#deferred)).

- **The same streams everywhere.** Each one stands for the same stream in every trigger and every action for as long as the program runs, since there is one process. Like every built-in value, a program can't assign it, and it never changes while a trigger runs ([ADR 0024](0024-built-in-values.md)).
- **Always defined.** None of them is ever `NOTHING`, and none is optional. A process whose standard input is empty, or closed, still has `@stdin`. What reading from it, or writing to a closed stream, gives is left to `cant::IO`.
- **Where they can be used.** Anywhere, in any trigger and any action, but not in a constant expression, since they aren't known at compile time ([ADR 0034](0034-top-level-constants.md)). This is where `@now` can be used too.

### The stream types

There are two stream types: the **input stream type**, of `@stdin`, and the **output stream type**, of `@stdout` and `@stderr`. Like the type of `@subject` ([ADR 0024](0024-built-in-values.md)), they are unnamed built-in types: a program can't write them.

- **Where a stream can go.** A program can't name a stream type, so no parameter, return type, model field, entity field or collection type it declares can be one. A stream can still be given to an identifier, as in `out := @stdout`, or put in a collection or object value, whose types are inferred. Its main use is as an argument to the actions of `cant::IO`, which can declare internal types because it is a standard library module ([ADR 0036](0036-native-modules.md)).
- **Input and output are kept apart.** The two types are different, so an action that takes the output stream type can't be given `@stdin`. Writing to standard input is a compile-time error, as reading from standard output will be once `cant::IO` declares actions that read.
- **Not an `UNKNOWN`.** A stream can't be given where an `UNKNOWN` is expected, even inside a collection or an object ([ADR 0033](0033-unknown-type.md)). This keeps streams away from ordinary native actions, whose values the interpreter infers by a fixed table that doesn't include streams ([ADR 0036](0036-native-modules.md)), and away from fields that can be stored.
- **Not text.** A stream can't be converted to text, so interpolating one is a compile-time error ([ADR 0011](0011-converting-values-to-text.md)).
- **Equality.** Streams are compared by which stream they stand for: `@stdout == @stdout` is `true`, and `@stdout == @stderr` is `false`. Comparing an input stream with an output stream is a compile-time error, as comparing any two values of different types is ([ADR 0019](0019-operators.md)).
- **No fields.** A stream has no fields that a program can read.

### Native code

The interpreter gives `cant::IO`'s native implementation each stream as the matching Node.js stream: `process.stdin`, `process.stdout` or `process.stderr`. That is internal to the interpreter, since no other native action can receive a stream. Other native code can use Node.js's `process` streams itself, as it can anything the process can do ([ADR 0036](0036-native-modules.md)).

## Deferred

- **`cant::IO`.** Which actions read from and write to streams, their parameters, whether `write`'s stream is optional and defaults to `@stdout` so that `IO::write("Hello World!")` stays valid ([ADR 0012](0012-base-types.md), [ADR 0038](0038-namespaces-from-imports.md)), how text is encoded, and what happens when a stream is closed or fails, are left to `cant::IO`'s own ADR ([ADR 0015](0015-files.md)).
- **Writes from several triggers.** While one action waits on a native call, the interpreter may run others ([ADR 0036](0036-native-modules.md)), so two triggers can write to `@stdout` at about the same time. Whether each write is kept whole is left to `cant::IO`.
- **Test cases.** A `TestCase` can set `@now` ([ADR 0037](0037-test-case-trigger-source.md)). Whether it can also give its action streams of its own, such as to check what was written to `@stdout`, is left for later.
- **Other streams.** Streams that a program opens itself, such as to a file or a network connection, and whether they share these types, are left to `cant::IO`.

## Consequences

- A program says where its output goes, and the compiler can tell standard input from the two output streams, so writing to `@stdin` is caught before the program runs.
- The stream types can't be named, so a program can't write its own action that takes a stream, such as a logger that writes to a stream its caller chooses. It has to call `cant::IO` with the built-in directly, or pick the stream inside the action. Making the types nameable can be decided later, without breaking programs that use these built-ins.
- Streams can't reach ordinary native actions, stored fields or text, so the boundary rules of [ADR 0036](0036-native-modules.md) and the text rules of [ADR 0011](0011-converting-values-to-text.md) need no new cases.
- Any action can write to `@stdout` and `@stderr`, and read from `@stdin`, with no `auth` check ([ADR 0010](0010-security.md)). The streams belong to whoever runs the interpreter, not to a subject, so a program that runs as a server can still write logs.
- The ADRs' earlier `IO::write("Hello World!")` examples stay as they are until `cant::IO` decides whether the stream can be left out.
