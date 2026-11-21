# 0032. Authentication

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Before an `auth` rule is evaluated, the interpreter authenticates the request and finds `@subject` by matching it against the `identity` of each subject entity; if none matches, the subject is anonymous ([ADR 0010](0010-security.md)). [ADR 0010](0010-security.md) leaves the authentication algorithm, and how subjects become members of groups and get roles in them, to this ADR.

Earlier ADRs already constrain it:

- Subject entities are marked `subject`, and each must have an `identity` ([ADR 0010](0010-security.md)).
- `@subject` is always defined, and is `@anonymous` when no subject is found or the trigger has no subject ([ADR 0010](0010-security.md)). Its `entityName` field holds the subject entity's name, such as `"User"` ([ADR 0010](0010-security.md)).
- Groups are entities with a `group` line, and roles are declared on them with `role` lines. A permission is held within a group, and `permissions` declarations grant them to a group kind's members, or to its members with a role ([ADR 0010](0010-security.md)).
- How a refused request is reported, such as with an HTTP 401 or 403, is up to the interpreter ([ADR 0010](0010-security.md)).
- A trigger source is outside the language, and is implemented by the interpreter or whatever provides it ([ADR 0025](0025-trigger-sources.md)).
- Stored entities are linked only by relations, through navigation fields ([ADR 0035](0035-entity-relationships.md)).
- A `TestCase` trigger sets `@subject` directly, without authenticating anything ([ADR 0037](0037-test-case-trigger-source.md)).

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Authentication is done by sources

Cant doesn't define any way of authenticating a request. Sessions, bearer tokens, API keys, OpenID Connect and signed requests are all outside the language. Each trigger source that can have a subject authenticates its own requests, in whatever ways the interpreter supports and is configured to use ([ADR 0025](0025-trigger-sources.md)), and the program doesn't choose between them.

What a source gives Cant, when it has authenticated a request, is its **claims**:

- **An entity name.** The name of a subject entity, as `@subject.entityName` gives it ([ADR 0010](0010-security.md)), such as `"User"` or `"ServiceAccount"`.
- **Identity values.** One value for each field on that entity's `identity` line ([ADR 0010](0010-security.md)), by the field's name.

When a request carries no credentials, the source gives no claims. When its credentials are invalid, such as an expired token, the source can refuse the request without running the trigger, in whatever way the interpreter reports refusals ([ADR 0010](0010-security.md)), or give no claims.

### Finding the subject

When a trigger fires, the interpreter turns the source's claims into `@subject`, before its `auth` rule is evaluated ([ADR 0010](0010-security.md)):

1. If there are no claims, `@subject` is `@anonymous`.
2. The entity name picks the subject entity. If no subject entity has that name, `@subject` is `@anonymous`.
3. Each identity value is converted to its field's type. If one can't be, or one is missing, `@subject` is `@anonymous`.
4. The interpreter finds the stored entity of that type whose `identity` fields have those values. That entity is `@subject`. If there is none, `@subject` is `@anonymous`.

Every failure gives `@anonymous` rather than an error, so a request that can't be matched to a subject is treated as one with no subject, and `auth` rules decide what an anonymous subject can do. `@id` and `@entity` are never part of the claims ([ADR 0024](0024-built-in-values.md)).

So that claims can always pick out one entity and match its identity:

- **Names are unique.** No two subject entities in a program can have the same name, even in different namespaces ([ADR 0005](0005-module-namespaces.md)). That is a compile-time error.
- **Identity types.** Every field on a subject entity's `identity` line must be a `TEXT`, a `NUMBER`, a `BOOLEAN` or an enum ([ADR 0012](0012-base-types.md), [ADR 0013](0013-enums.md)), since those are the values claims can carry. Any other type, including a navigation field ([ADR 0035](0035-entity-relationships.md)), is a compile-time error on a subject entity.

### Sources without subjects

Each trigger source says, as part of its definition, whether it can have a subject, alongside its name, parameters and built-in values ([ADR 0025](0025-trigger-sources.md)):

| Source | Can have a subject |
| --- | --- |
| HTTP requests | Yes, from the request's credentials |
| Events and queues | If the source carries claims with its messages |
| Program start, schedules | No |
| Test cases | Set directly by `subject`, not by claims ([ADR 0037](0037-test-case-trigger-source.md)) |

A trigger on a source that can't have a subject always runs as `@anonymous` ([ADR 0010](0010-security.md)).

### Memberships

A subject becomes a member of a group, with roles in it, through a **membership entity**: an entity that the program declares, with a `membership` line, and stores like any other entity ([ADR 0022](0022-entities.md)):

```ebnf
EntitySecurity  = SubjectKeyword | Identity | GroupDefiner | RoleDefiner | MembershipDefiner ;
MembershipDefiner = MembershipKeyword, Identifier, InKeyword, Identifier, [WithKeyword, Identifier] ;
```

```cant
enum OrganizationRole
    admin
    member

model MembershipRecord
    joined: DATE_TIME
    roles: SET(OrganizationRole)

entity Membership
    membership user in organization with roles
    identity user, organization
    models
        MembershipRecord
    expose
        @all

relation User[memberships] 1 --- 0..* Membership[user]
relation Organization[memberships] 1 --- 0..* Membership[organization]
```

`membership user in organization with roles` names three of the entity's fields:

- **The member.** `user` is a navigation field whose far end has the cardinality `1` and is a subject entity ([ADR 0035](0035-entity-relationships.md)).
- **The group.** `organization` is a navigation field whose far end has the cardinality `1` and is a group entity: one with a `group` line ([ADR 0010](0010-security.md)).
- **The roles.** `roles`, after `with`, is a field of the entity's model whose type is an enum, or a set of an enum ([ADR 0013](0013-enums.md), [ADR 0021](0021-collections.md)). Every value of the enum must be the name of a role that the group entity declares, and the compiler checks this. A membership with no `with` gives its member no roles.

Each stored membership entity makes its member a member of its group, with the roles its roles field holds:

- `@subject is admin within org` is `true` when a stored membership entity has `@subject` as its member, `org` as its group, and `admin` among its roles ([ADR 0010](0010-security.md)).
- `@subject can "<permission>" within org` is `true` when a `permissions` declaration grants the permission to the group's kind, or to a role the subject has in `org` ([ADR 0010](0010-security.md)).
- If several membership entities have the same member and group, the member has all of their roles. A program that wants at most one usually makes the member and group its `identity`, as `Membership` does above.
- A program can declare several membership entities, such as one for each group kind.

A membership entity is an ordinary entity in every other way. It is created, changed, saved and deleted with the keywords for entities ([ADR 0022](0022-entities.md)), and a change to its member, group or roles takes effect when it is saved. Who can change memberships is decided by the program, with the `auth` rules of the triggers whose actions change them, like any other data ([ADR 0010](0010-security.md)).

A membership entity can't also be a subject or a group, so an entity with a `membership` line and a `subject` or `group` line is a compile-time error, and so is one with two `membership` lines.

### Keywords

`membership` is only special inside an entity's block, like `subject`, `identity`, `group` and `role` ([ADR 0010](0010-security.md)), and stays usable as an identifier elsewhere. So does `with` after it, as in a `raise` ([ADR 0023](0023-error-handling.md)). `in` is already a keyword ([ADR 0021](0021-collections.md)).

## Deferred

- **Signing in and out.** Cant has no way to sign in, sign out or issue tokens. Those are left to the program, such as with native actions ([ADR 0036](0036-native-modules.md)), or to an external identity provider, whose tokens a source then accepts.
- **Configuring mechanisms.** Which mechanisms a source supports, and how the interpreter is configured to use them, such as which identity provider to trust and which token claims give the entity name and identity values, are left to the interpreter.
- **Program-defined authentication.** A way for a program to authenticate requests itself, such as with a native action that turns a request into claims ([ADR 0036](0036-native-modules.md)), may be added later.
- **Memberships in tests.** A test case's storage holds only its subject ([ADR 0037](0037-test-case-trigger-source.md)). Giving a test case's subject memberships needs the keywords for creating entities ([ADR 0022](0022-entities.md)).

## Consequences

- Cant stays out of authentication protocols, so the same program can be served with sessions, tokens or an identity provider, depending on how its interpreter is configured. The cost is that a program can't see, or choose, how its requests are authenticated.
- Claims always name the subject entity, so a program with several subject entities, such as `User` and `ServiceAccount`, never has to guess which one a request is for. Subject entity names must be unique across a program to make that work.
- Any claims that can't be matched to a stored subject give `@anonymous`, so a bad or stale credential can never be mistaken for another subject, and `auth` rules decide what it can do.
- Subject entities' `identity` fields are limited to types that claims can carry, so a subject can't be identified by its relationships, or by a `DATE_TIME`.
- Memberships are entities the program declares and stores, so the program owns who belongs to which group, and changes it with the same keywords as any other data. The cost is that role and permission predicates have to look memberships up when they are evaluated.
- Roles are an enum whose values the compiler checks against the group's `role` lines, so a misspelled role in a membership is caught at compile time.
- Whether a trigger can have a subject is part of each source's definition, so a trigger on a schedule or at start-up always runs as `@anonymous`.
- `membership` becomes a contextual keyword in an entity's block, and the parser needs to support the `membership` line.
