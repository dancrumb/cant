# 0032. Authentication

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

Before an `auth` rule is evaluated, the interpreter authenticates the request and finds `@subject` by matching it against the `identity` of each subject entity; if none matches, the subject is anonymous ([ADR 0010](0010-security.md)). [ADR 0010](0010-security.md) leaves the authentication algorithm to a later ADR.

## Decision

Not decided yet. Earlier ADRs already constrain it:

- Subject entities are marked `subject`, and each must have an `identity` ([ADR 0010](0010-security.md)).
- `@subject` is always defined, and is `@anonymous` when no subject is found or the trigger has no subject ([ADR 0010](0010-security.md)).
- How a refused request is reported, such as with an HTTP 401 or 403, is up to the interpreter ([ADR 0010](0010-security.md)).

## Open questions

These need answers before this ADR is accepted:

- **Mechanisms.** Which ways of authenticating are supported: sessions, bearer tokens, API keys, OAuth or OpenID Connect, signed requests?
- **Who decides.** Is the mechanism chosen by the program, by the interpreter's configuration, or by the trigger source ([ADR 0025](0025-trigger-sources.md))?
- **Matching identities.** How is an authenticated request's claims matched to an entity's `identity` fields, especially when `identity` names several fields?
- **Several subject types.** When a program has several subject entities, such as `User` and `ServiceAccount`, how is the right one chosen?
- **Signing in and out.** Does Cant provide ways to sign in, sign out or issue tokens, or are those left to the program or an external service?
- **Non-request triggers.** Do triggers that are not requests, such as schedules or queues, ever have a subject?

## Consequences

TODO
