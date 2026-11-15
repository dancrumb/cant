# 0009. Triggers

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Actions ([ADR 0007](0007-actions.md)) describe what to do, but not when to do it. A **trigger** connects an action to something that causes it to run: the program starting, an HTTP request, a message on a queue, an event, or a schedule.

The current grammar only supports `trigger <action> on <identifier>`, with no way to configure the trigger, pass arguments to the action, or restrict who can cause it to run.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md): rule names match [`cant.peggy`](../../packages/shared/src/cant.peggy) where the rule already exists, keywords are `<Name>Keyword` rules, and punctuation is written inline.

### Triggers

A trigger names an action, the source that triggers it, and optionally an indented block of settings:

```ebnf
Trigger         = TriggerKeyword, (QualifiedIdentifier | Identifier), OnKeyword, Identifier,
                  [?indent?, {TriggerSetting}, ?dedent?] ;
TriggerSetting  = AuthBlock | TriggerArguments | ?comment? ;
```

```cant
trigger SayHello on Start

trigger SendWelcome on UserCreated
    arguments
        user := event.user
```

The action can be in another namespace (`trigger accounts::SendWelcome on UserCreated`). The identifier after `on` names the trigger's source. A later ADR will decide which sources exist and any settings that are specific to a source, such as an HTTP endpoint, a queue name or a schedule. Until then, the grammar accepts any identifier after `on`.

A trigger with no settings has no block, so the existing form `trigger SayHello on Start` stays valid.

The source EBNF also allows key-value metadata lines in a trigger. This ADR leaves them out.

### Arguments

```ebnf
TriggerArguments  = ArgumentsKeyword, ?indent?, {TriggerArgument | ?comment?}, ?dedent? ;
TriggerArgument   = Identifier, ":=", Expression ;
```

`arguments` lists the values passed to the action, one per line. The name on the left of each `:=` is one of the action's parameters ([ADR 0007](0007-actions.md)). Parameters are named, not positional, so arguments can be listed in any order. How arguments are checked against the action's parameters is described in [ADR 0020](0020-action-parameters.md).

### Authorization

```ebnf
AuthBlock  = AuthKeyword, ?indent?, Expression, ?dedent? ;
```

`auth` holds a single rule: a `BOOLEAN` expression that must be `true` for the trigger to run the action. A rule of any other type is a compile-time error. It can use any operator ([ADR 0019](0019-operators.md)), together with predicates about `@subject`, whoever caused the trigger:

| Predicate | Meaning |
| --- | --- |
| `@subject can "<permission>"` | The subject has the permission |
| `@subject can "<permission>" within <group>` | The subject has the permission within the group |
| `@subject is @anonymous` | The subject is not identified |
| `@subject is @defined` | The subject is identified |
| `@subject is <type>` | The subject is of the given type |
| `@subject is <role> within <group>` | The subject has the role within the group |

`@subject`, `@anonymous` and `@defined` are **built-in values**. A built-in value is written `@<identifier>`, with no space between the `@` and the identifier. The language has a fixed list of them, which a later ADR will define. This ADR uses only these three.

[ADR 0010](0010-security.md) defines the predicates' grammar, where subject types, roles, groups and permissions are declared, and how `auth` rules are checked.

```cant
trigger GetInvoice on InvoiceRequested
    auth
        @subject is @defined and (@subject can "invoices:read" or @subject is admin within billing)
    arguments
        invoiceId := event.invoiceId
```

### Keywords

The setting names `arguments` and `auth` are only special inside a trigger's block. Like `into` and `as` in imports ([ADR 0006](0006-imports.md)), they stay usable as identifiers elsewhere. The words used in predicates are described in [ADR 0010](0010-security.md).

## Consequences

- One construct covers every way an action can be started, and the trigger, not the action, says how the action is started.
- Authorization is declared next to the entry point it protects, where it is easy to review.
- Arguments make the mapping from a request, event or message to an action's parameters explicit.
- The parser has to handle another set of contextual keywords.
- The ADR on trigger sources has to add source-specific settings to `TriggerSetting` without breaking the settings defined here.
