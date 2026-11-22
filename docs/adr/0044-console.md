# 0044. The `cant::Console` module

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

A program can write to its standard streams with `cant::IO` ([ADR 0042](0042-io.md)), but a program that wants to say what it is doing, for the people who run it, has to choose a stream, a format and a way to show how serious each message is, every time. Those messages are logs: they are for people watching or debugging the program, not output for another program to read.

Logging is common enough to belong in the standard library, so that every program logs the same way. It needs:

- levels, so that a reader can tell an error from a detail;
- a way to attach values to a message, such as the user an error was about, without building them into its text;
- to stay out of a program's output, so that a program whose `@stdout` is piped to another program can still log;
- never to fail in a way that stops the program, since a log line is never the point of a program.

`cant::Console` is a standard library module, so it is a native module that ships with the interpreter ([ADR 0031](0031-module-resolution.md), [ADR 0036](0036-native-modules.md)).

## Decision

### The module

`cant::Console` is declared by this Cant module, its bridge to the TypeScript that implements it:

```cant
export enum LogLevel
    Error
    Warn
    Info
    Debug
    Trace

export action error(message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"

export action warn(message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"

export action info(message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"

export action debug(message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"

export action trace(message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"

export action log(level?: LogLevel := LogLevel.Info, message: TEXT, data?: {UNKNOWN}): VOID
    native "./Console.js"
```

Like `cant::IO`, it lives in the compiler, as `stdlib/Console.cant` in `@dancrumb/cant-compiler`, and the interpreter provides its implementation ([ADR 0042](0042-io.md)).

### Levels

`LogLevel` names five levels, from the most serious to the least: `Error`, `Warn`, `Info`, `Debug` and `Trace`. Its members have no `:=`, so their values are their names as `TEXT` ([ADR 0013](0013-enums.md)).

There is an action for each level, named after it in lower case, and `log`, which takes the level as a value, for a program that works out the level at runtime. `log`'s level is `Info` when it is left out.

`error` is the name of one of these actions, which is why `error` is a keyword only where it starts an error declaration ([ADR 0023](0023-error-handling.md)).

### Calling it

Each action has one required parameter, `message`, so a call that only gives the message can leave its name out ([ADR 0020](0020-action-parameters.md)). A call that also gives data, or a level, names every argument:

```cant
import Console

Console::info("Started")
Console::warn(message := "Disk is nearly full", data := { free := 3, path := "/tmp" })
Console::log(level := Console::LogLevel.Debug, message := "Retrying")
```

### Data

`data` is a map of values of any type, `{UNKNOWN}` ([ADR 0021](0021-collections.md), [ADR 0033](0033-unknown-type.md)), so a call attaches values by name, without building them into the message. An object written in the call, such as `{ free := 3, path := "/tmp" }`, can be given for it, even when its members have values of different types, since such an anonymous model can be a `{UNKNOWN}` ([ADR 0021](0021-collections.md)). So can an object of a named model, which is given as a copy of its fields ([ADR 0027](0027-object-shapes.md)).

### What a call writes

Each call writes one line to `@stderr` ([ADR 0040](0040-standard-streams.md)), whatever its level:

```text
INFO  Started
WARN  Disk is nearly full  free: 3, path: /tmp
DEBUG Retrying
```

- **The level** comes first, in upper case, padded with spaces to five characters, so that the messages of lines at different levels line up.
- **The message** comes next, after one space, as it is given. A line break in it is written as it is.
- **The data**, when the call gives a map with any members, comes last, two spaces after the message, converted to text as a map is in an interpolation: `name: value` for each member, joined with `", "` ([ADR 0021](0021-collections.md)). An empty map, or no data, writes nothing after the message.
- **A line break** ends the line.

Writing to `@stderr` keeps logs out of `@stdout`, so a program's output can be piped to another program while its logs still reach the terminal. Every level goes to the same stream, so lines are in the order they are logged.

Each line is written whole, and lines are written in the order the calls are made, as `IO::write` writes messages ([ADR 0042](0042-io.md)). A call returns once the stream has accepted its line.

### Logging never fails

The actions raise no errors. A line that can't be written, such as when `@stderr` is closed, is dropped, and the call returns as usual. So a program never has to handle the result of a log call, and logging can never stop a program.

### Native code

The interpreter gives each standard library action its streams in its context, as well as its arguments, so `Console.js` writes to the `@stderr` the interpreter gives the program, which is the process's standard error unless the interpreter was given other streams ([ADR 0040](0040-standard-streams.md)). Other native modules aren't given the streams.

## Deferred

- **Filtering.** Showing only the levels at or above a minimum, such as hiding `Debug` and `Trace` unless they are asked for, and how a program or its runner chooses the minimum.
- **Other formats.** Lines with timestamps, or one JSON object per line for log collectors, and how a program chooses one.
- **Other destinations.** Logging to a stream or a service other than `@stderr`.
- **Test cases.** Checking what a `TestCase`'s action logs ([ADR 0037](0037-test-case-trigger-source.md)).

## Consequences

- A program can log with one import and one call, at five levels, and every program's logs look the same.
- Logs go to `@stderr`, so they never mix with a program's output on `@stdout`.
- Log calls never raise, so a program calls them as statements and never handles their results, unlike `IO::write` ([ADR 0042](0042-io.md)). The cost is that a lost log line is silent.
- Every level is always written, so `Debug` and `Trace` lines show in every run until filtering is decided. Adding filtering later, with `Info` and above shown by default, would hide lines that programs show today.
- `data` is a map, so a call can attach any values by name. The line writes them as text, so a value that is itself a collection is flattened, as interpolation flattens it ([ADR 0021](0021-collections.md)).
- The interpreter gives standard library actions its streams, which other native modules don't get, so a native module can't yet write to the program's streams itself.
