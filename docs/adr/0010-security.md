# 0010. Security

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Triggers ([ADR 0009](0009-triggers.md)) can restrict who causes an action to run, using `auth` rules about `@subject`. Those rules refer to subject types, roles, groups and permissions, but nothing yet says where those come from.

We need a security model that says:

- what a **subject** is: who, or what, causes a trigger;
- how a subject is **identified**;
- how subjects are organised into **groups**, and what **roles** they can have in them;
- which **permissions** a group or role grants;
- how a trigger's **authorization** rules use all of the above.

Subjects and groups are kinds of **entity**. Roles are not entities: they are declared on group entities, and represent roles in the application's security model. Entities will be fully described in a later ADR; this ADR only defines the parts of an entity declaration that concern security, and shows the rest (such as `fields`) only to give examples context.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md): rule names match [`cant.peggy`](../../packages/shared/src/cant.peggy) where the rule already exists, keywords are `<Name>Keyword` rules, and punctuation is written inline.

### Security in entities

An entity declaration can contain these security lines, in any order, before its fields:

```ebnf
EntitySecurity  = SubjectKeyword | Identity | GroupDefiner | RoleDefiner ;
Identity        = IdentityKeyword, Identifier, {",", Identifier} ;
GroupDefiner    = GroupKeyword, Identifier ;
RoleDefiner     = RoleKeyword, Identifier ;
```

```cant
entity User
    subject
    identity email
    fields
        email: TEXT
        name: TEXT

entity Organization
    group organization
    role admin
    role member
    identity slug
    fields
        slug: TEXT
```

#### `subject`

`subject` marks an entity as a kind of subject: something that can cause a trigger and be checked by `auth` rules. A program can have several subject entities, such as `User` and `ServiceAccount`. These are the types that `@subject is <type>` refers to.

#### `identity`

`identity` names the fields of an entity that together uniquely identify each instance of it. An entity has at most one `identity` line, and each field it names must be declared in the entity's fields:

```cant
entity Membership
    identity organization, user
    fields
        organization: Organization
        user: User
```

For a subject entity, the identity is what an authenticated request is matched against to find the subject, so every subject entity must have an `identity`.

#### `group`

`group` marks an entity as a kind of group, and gives the group kind a name. Each instance of the entity is a group that subjects can be members of. For example, each `Organization` is a group, and the group kind is called `organization`.

#### `role`

`role` declares a role in the application's security model: one that a member can have within a group of this entity's kind. The role itself is not an entity; it is a name that `permissions` declarations and `auth` rules refer to. An entity can declare any number of roles, but only if it also has a `group` line. A `role` in an entity with no `group` is an error, since there would be no group for a member to hold the role in. Role names are scoped to their group kind, so two group kinds can both have an `admin` role.

How subjects become members of groups, and how roles are assigned, is part of the entity model and is left to the entities ADR.

### Permissions

```ebnf
Permissions      = PermissionsKeyword, GroupMembership, ?indent?, {ConstantStringLiteral | ?comment?}, ?dedent? ;
GroupMembership  = Identifier, [HasKeyword, Identifier] ;
```

A `permissions` declaration grants a list of permissions to the members of a group kind, or only to members that have a particular role:

```cant
permissions organization
    "invoices:read"

permissions organization has admin
    "invoices:read"
    "invoices:write"
    "members:invite"
```

- A permission is a string. Its meaning is up to the program; Cant only checks whether a subject has it.
- `permissions <group>` grants the permissions to every member of a group of that kind.
- `permissions <group> has <role>` grants them only to members with that role in the group.
- A permission is held **within a group**: an admin of one organization has `"invoices:write"` in that organization only.
- Grants add up. A subject's permissions in a group are the union of every `permissions` declaration that applies to it there.

### Authorization

```ebnf
AuthBlock      = AuthKeyword, ?indent?, Expression, ?dedent? ;
AuthPredicate  = Subject, ( CanKeyword, ConstantStringLiteral, [WithinKeyword, Identifier]
                          | IsKeyword, (SubjectType | Identifier, WithinKeyword, Identifier) ) ;
SubjectType    = Identifier | BuiltIn ;
Subject        = "@subject" ;
BuiltIn        = "@", Identifier ;
```

An `auth` block appears in a trigger ([ADR 0009](0009-triggers.md)) and holds one rule. The rule is an expression, and can use any operator ([ADR 0019](0019-operators.md)), but it must have the type `BOOLEAN`. A rule of any other type is a compile-time error. A trigger with no `auth` block lets any subject through, including an anonymous one.

`auth` blocks are handled by the interpreter. Each time a trigger fires, the interpreter:

1. authenticates the request, using an algorithm that a later ADR will define, and finds `@subject`, the subject that caused the trigger, by matching the authenticated request against the `identity` of each subject entity; if none matches, the subject is anonymous;
2. resolves each `within <identifier>` in the rule to a group instance;
3. evaluates the rule, and runs the action only if it is `true`.

If the rule is `false`, the action does not run. How the interpreter reports that to the caller, such as with an HTTP 401 or 403 response, is up to the interpreter.

Before the program runs, the compiler validates `auth` rules as far as it can without running them. For example, it reports an error when a rule:

- uses `@subject is <type>` with a type that is not a subject entity;
- refers to a role that no group entity declares, or that the group in `within <identifier>` cannot have, when the group's kind is known;
- checks a permission that no `permissions` declaration grants.

Anything that depends on the request, such as who the subject is and which group an identifier resolves to, is left to the interpreter.

#### Predicates

| Predicate | Is `true` when |
| --- | --- |
| `@subject is @anonymous` | The subject is anonymous |
| `@subject is @defined` | The subject is not anonymous |
| `@subject is User` | The subject is an instance of the subject entity `User` |
| `@subject is admin within org` | The subject has the role `admin` in the group `org` |
| `@subject can "invoices:read" within org` | The subject has the permission in the group `org` |
| `@subject can "invoices:read"` | The subject has the permission in at least one group |

- A predicate names a group with `within <identifier>`. The identifier names a group instance, which the interpreter resolves when the trigger fires, for example from the request or event that caused the trigger; how it does so is up to the interpreter. If the identifier cannot be resolved to a group, the predicate is `false`.
- An anonymous subject is in no groups, so every `can` and role predicate is `false` for it.
- The permission in a `can` predicate must be a string literal, so that the compiler can check it against the `permissions` declarations. A later version of Cant may allow an expression there.
- Predicates are ordinary `BOOLEAN` expressions. They sit at the same level of precedence as comparisons ([ADR 0019](0019-operators.md)), so they bind more tightly than `and` and `or`, and they can be used in any expression, not only in an `auth` rule. An action can check one in an `if`:

```cant
if @subject can "invoices:approve" within org
    // ...
```

- `@subject` is always defined. In an action, it is the subject that caused the trigger that started the action. When there is no such subject, such as for an action started by a trigger that has no subject, `@subject` is `@anonymous`.

```cant
trigger PayInvoice on InvoicePaymentRequested
    auth
        @subject is User and (@subject can "invoices:write" within org or @subject is admin within org)
```

### Keywords

`entity` and `permissions` start top-level declarations, so they are reserved everywhere. The other words in this ADR are only special where they are used, and stay usable as identifiers elsewhere:

- `subject`, `identity`, `group` and `role`, in an entity's block;
- `has`, in a `permissions` declaration;
- `can`, `is` and `within`, in a predicate.

`@subject`, `@anonymous` and `@defined` are built-in values, written `@<identifier>` as described in [ADR 0009](0009-triggers.md). The full list of built-in values will be defined in a later ADR. Because the `@` prefix is reserved for them, they cannot clash with anything a program declares.

## Consequences

- Who can do what is declared in the language, next to the entities and triggers it applies to, rather than in application code.
- Authorization is enforced in one place, the interpreter, before any action runs, so an action never has to check its own caller.
- Many mistakes in `auth` rules, such as a misspelled role or permission, are caught by the compiler rather than when a request is refused.
- Because `auth` rules are ordinary expressions, they can use every operator, and the same predicates can be checked inside an action when a decision depends on more than the trigger.
- Permissions are always scoped to a group, which suits multi-tenant programs but makes "global" permissions (for example, for site administrators) awkward to express.
- Security depends on the entities ADR for membership, role assignment and fields, so it cannot be implemented until that ADR exists.
- More contextual keywords make the grammar harder to read and the tokenizer harder to get right, since it has to know which block it is in.
