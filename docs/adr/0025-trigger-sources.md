# 0025. Trigger sources

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

A trigger names its source after `on` ([ADR 0009](0009-triggers.md)), as in `trigger SayHello on Start`, but no ADR says which sources exist. Until one does, the grammar accepts any identifier there. Examples in earlier ADRs use `Start`, and events such as `UserCreated` and `InvoicePaymentRequested`. The source EBNF that Cant's grammar started from has settings for HTTP requests (an endpoint with path parameters, a status code, a body and response headers), queues, events and cron schedules.

## Decision

A **trigger source** is something outside the program that causes a trigger to run its action, such as a program starting, an HTTP request or a schedule. A trigger source is defined by:

- **A name**, which a trigger uses after `on` to say which source it responds to, as in `trigger SayHello on Start` ([ADR 0009](0009-triggers.md)).
- **The built-in values it provides a value to** ([ADR 0024](0024-built-in-values.md)). When a source runs a trigger, it gives values to those built-ins, such as the request that arrived or the event that occurred, and the trigger's settings can use them, for example in its `arguments` and `auth`.
- **Its parameters**, which configure it in a particular trigger, such as an HTTP endpoint's path or a schedule's timing.

A trigger gives its source's parameters in a `parameters` block, one of the settings in the trigger's block ([ADR 0009](0009-triggers.md)), not after the source's name. Each parameter is written `name := value`, as an argument is in `arguments`:

```ebnf
TriggerSetting    = AuthBlock | TriggerArguments | SourceParameters | ?comment? ;
SourceParameters  = ParametersKeyword, ?indent?, {SourceParameter | ?comment?}, ?dedent? ;
SourceParameter   = Identifier, ":=", Expression ;
```

```cant
trigger GetInvoice on HttpRequest
    parameters
        method := "GET"
        path := "/invoices/{id}"
    arguments
        invoiceId := @request.path.id
```

A source's parameters are named and typed, as an action's are ([ADR 0007](0007-actions.md), [ADR 0020](0020-action-parameters.md)). Each value in `parameters` must have a type compatible with its parameter's type, and naming a parameter the source does not have is a compile-time error. A source can have optional parameters, with defaults, as an action's can, which a trigger can leave out of its `parameters` block. Leaving out a required parameter is a compile-time error.

A parameter's value can be any constant expression ([ADR 0023](0023-error-handling.md)), such as a literal, an enum value, or an identifier whose value the compiler knows, since a source is configured before any trigger runs. A value that is not a constant expression, such as one that uses a built-in value, is a compile-time error. A program can declare top-level constants ([ADR 0034](0034-top-level-constants.md)), and parameter values can use them, so several triggers can share a value such as a base path.

A trigger leaves out its `parameters` block when it would be empty, that is, when it gives no parameters because the source has none or only optional ones it does not set. The same applies to `arguments` ([ADR 0009](0009-triggers.md)). So `trigger SayHello on Start` stays valid.

Because the parameters have their own block, a source's parameter names cannot clash with the other settings, such as `arguments` and `auth`. Like those, `parameters` is only special inside a trigger's block, and can be used as an identifier elsewhere.

Each source provides values to the built-ins that describe what caused the trigger to run. For example:

| Source | Built-in values it provides |
| --- | --- |
| HTTP requests | `@request`, the request that arrived |
| Events | `@event`, the event that occurred |
| Queues | `@message`, the message taken from the queue |
| Program start | None |

A trigger can only use the built-ins its own source provides. Using any other, such as `@request` in a trigger `on Start`, is a compile-time error. The type of each built-in, and so what a program can read from it, such as a request's path parameters, query, headers and body, is defined by the trigger source as part of its definition.

The built-ins a source provides can only be used in the trigger, such as in its `arguments` and `auth`, not in the action it runs. An action gets what it needs from them through its parameters, so it does not depend on how it was started, and the same action can be run by different sources or called by other actions.

Neither rule applies to `@subject`, which always exists ([ADR 0010](0010-security.md)). A source may give it a value, but any trigger, and any action, can use it, whatever the source. It is `@anonymous` when the source has no subject.

How a trigger source is implemented, such as how it listens for HTTP requests or keeps time for a schedule, is not part of the language. It is up to the interpreter, or whatever provides the source.

Earlier ADRs already constrain trigger sources:

- A trigger has an optional block of settings, `arguments` and `auth`, and source-specific settings must be added without breaking them ([ADR 0009](0009-triggers.md)). The `parameters` block is added alongside them.
- A trigger's `arguments` always name every argument in full ([ADR 0020](0020-action-parameters.md)), and an argument that may be missing can only be passed to an optional parameter.
- Some triggers, such as those that deal with uploads, provide a `FILE` to the action they invoke ([ADR 0015](0015-files.md)).
- What a trigger reports when its action panics is decided by the interpreter ([ADR 0023](0023-error-handling.md)).
- Queue-driven triggers remain an example of a source, though there is no statement for putting messages on a queue.

## Deferred

- **Where sources come from.** To be decided later. Is a source's definition (its name, built-ins and parameters) written in Cant, for example as a declaration whose implementation the interpreter supplies, or is it built into the interpreter? Can a module provide sources that a program imports ([ADR 0006](0006-imports.md))? Are source names keywords, or ordinary names that can be namespaced, as in `on http::Request`?

## Consequences

- Every source is described the same way, by a name, the built-ins it provides and its parameters, so a trigger for any source is written and checked in the same way.
- Parameters are named, typed and checked at compile time, and must be constant expressions, so a misconfigured trigger is caught before the program runs.
- Source built-ins are confined to the trigger, so actions do not depend on how they were started, and can be reused by other triggers and called by other actions. The cost is that every value an action needs from a request or event has to be passed through `arguments`.
- Implementations are left to the interpreter, so the language stays small, but a program's behaviour depends on the sources its interpreter provides.
- Where sources are defined, which sources Cant comes with, how a source's reply, such as an HTTP response, is formed, how events are declared and raised, and which sources have a subject are left open. Until they are decided, the grammar accepts any identifier after `on`.
