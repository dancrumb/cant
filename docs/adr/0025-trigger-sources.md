# 0025. Trigger sources

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

A trigger names its source after `on` ([ADR 0009](0009-triggers.md)), as in `trigger SayHello on Start`, but no ADR says which sources exist. Until one does, the grammar accepts any identifier there. Examples in earlier ADRs use `Start`, and events such as `UserCreated` and `InvoicePaymentRequested`. The source EBNF that Cant's grammar started from has settings for HTTP requests (an endpoint with path parameters, a status code, a body and response headers), queues, events and cron schedules.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- A trigger has an optional block of settings, of which only `arguments` and `auth` are defined so far, and source-specific settings must be added without breaking them ([ADR 0009](0009-triggers.md)).
- A trigger's `arguments` always name every argument in full ([ADR 0020](0020-action-parameters.md)), and an argument that may be missing can only be passed to an optional parameter.
- Some triggers, such as those that deal with uploads, provide a `FILE` to the action they invoke ([ADR 0015](0015-files.md)).
- When a trigger has no subject, `@subject` is `@anonymous` ([ADR 0010](0010-security.md)).
- Queue-driven triggers remain an example of a source, though there is no statement for putting messages on a queue.

## Open questions

These need answers before this ADR is accepted:

- **Sources.** Which sources exist: program start, HTTP requests, events, queues, schedules, uploads? Are source names keywords, built-in names, or declared by modules?
- **HTTP.** How is an endpoint written, including path parameters such as `/invoices/{id}`, and how does an action set the response's status code, body and headers?
- **Events.** How is an event declared, how is one raised, and what does it carry? What is `event` in `user := event.user`?
- **Schedules.** How is a schedule written: as cron syntax, or something else?
- **Queues.** How is a queue named and configured, and how do messages get onto it?
- **Settings.** Which settings does each source add to the trigger block, and are they checked at compile time?
- **Subjects.** Which sources have a subject, and how is it found ([ADR 0032](0032-authentication.md))?

## Consequences

TODO
