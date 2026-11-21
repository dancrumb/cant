# 0024. Built-in values

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

A **built-in value** is written `@<identifier>` ([ADR 0009](0009-triggers.md)). Several ADRs use them, and promise a later ADR that gives the full list:

- `@subject`, `@anonymous` and `@defined` in `auth` rules and predicates ([ADR 0009](0009-triggers.md), [ADR 0010](0010-security.md)).
- `@id`, an entity's identifier facet ([ADR 0017](0017-faceted-types.md)).
- `@all`, which exposes or hides all of a model's fields in an entity ([ADR 0022](0022-entities.md)), and, in `passes @all`, lets an action pass along any error ([ADR 0023](0023-error-handling.md)).

## Decision

Cant's built-in values are the ones listed here: `@subject`, `@anonymous`, `@defined`, `@id`, `@entity`, `@all`, `@result`, `@request` and `@message`. The list is closed: a program or module cannot define built-in values of its own. Later ADRs can add more, such as for the current time or a new trigger source, and a future ADR may let programs define custom built-ins, but that is not planned for now. Some of the rules below come from earlier ADRs:

- The grammar is `BuiltIn = "@", Identifier`, with no space after the `@` ([ADR 0009](0009-triggers.md)). The `@` prefix is reserved, so built-in values cannot clash with anything a program declares ([ADR 0010](0010-security.md)).
- `@subject` is always defined: it is the subject that caused the trigger, or `@anonymous` when there is none ([ADR 0010](0010-security.md)).
- `@subject` has an unnamed built-in type with the fields `entityName: TEXT` and `identityFields: [TEXT]`, and `@subject is <type>` narrows it to that subject entity ([ADR 0010](0010-security.md)).
- `@anonymous` stands for no subject, and `@defined` is its opposite, for any subject that is not anonymous. So `@subject is @defined` is `true` exactly when `@subject is @anonymous` is `false` ([ADR 0010](0010-security.md)).
- `@anonymous` and `@defined` are the only built-in values that can be a `SubjectType` ([ADR 0009](0009-triggers.md)).
- `@id` is provided by the interpreter for every entity ([ADR 0017](0017-faceted-types.md)). It cannot be read in Cant code: a program has no way to write `@id` to get an entity's identifier, so `user.@id` is an error. The interpreter still uses it, to compare entities and to load their contents ([ADR 0017](0017-faceted-types.md)).
- `@entity` is provided by the interpreter for every entity, and holds the entity's specific type ([ADR 0022](0022-entities.md)). Like `@id`, it cannot be read in Cant code, so `user.@entity` is an error. The interpreter uses it to resolve an entity's type at runtime, such as for `instanceOf` ([ADR 0033](0033-unknown-type.md)) and equality ([ADR 0017](0017-faceted-types.md)).
  - An `EntityId` is a `TEXT` under the covers. It stays an internal type that a program cannot name or read ([ADR 0022](0022-entities.md)), but when an entity is converted to text, it is written as that `TEXT` ([ADR 0011](0011-converting-values-to-text.md)).
- `@result` is defined in every trigger, whatever its source, and holds what the action the trigger runs returned ([ADR 0009](0009-triggers.md)).
  - Its type is always an error return type ([ADR 0023](0023-error-handling.md)). If the action has an error return type, `@result` has that type, and holds either the action's value or the error it raised or passed. Otherwise, `@result` has an error return type whose value type is the action's return type and which has no errors, so it always holds the value the action returned.
  - When the action's return type is `VOID`, the value `@result` holds is `NOTHING`. So for an action declared `: VOID raises SaveFailed`, `@result` holds either `NOTHING` or a `SaveFailed`.
- `@request` is provided by the HTTP request source, so it can only be used in a trigger on that source ([ADR 0025](0025-trigger-sources.md)). It has four parts:

  | Field | Holds | Type of each member |
  | --- | --- | --- |
  | `@request.body.<fieldName>` | The fields of the request's JSON body | The type of that field in the body's model, which the trigger declares |
  | `@request.path.<paramName>` | The path parameters, named by `{paramName}` in the path | `TEXT` |
  | `@request.query.<paramName>` | The values in the query string | `TEXT?` |
  | `@request.files.<fieldName>` | The uploaded files ([ADR 0015](0015-files.md)) | `FILE?` |

  A path parameter is always present, since a request only matches the trigger when its path does. The trigger's `path` parameter is a constant expression ([ADR 0025](0025-trigger-sources.md)), so the compiler knows its parameters, and reading one it does not name, such as `@request.path.name` for the path `"/invoices/{id}"`, is a compile-time error.

  Reading a query value or file that the request does not have gives an empty optional, as reading a map member does ([ADR 0021](0021-collections.md)). So such a value can only be passed to an optional parameter, or checked first ([ADR 0020](0020-action-parameters.md)).

  ```cant
  trigger ShowInvoice on HttpRequest
      parameters
          method := "GET"
          path := "/invoices/{id}"
      arguments
          invoiceId := @request.path.id
          page := @request.query.page
  ```

### Where they can be used

| Built-in value | Where it can be used |
| --- | --- |
| `@subject` | Anywhere: in any trigger and any action ([ADR 0010](0010-security.md), [ADR 0025](0025-trigger-sources.md)) |
| `@anonymous`, `@defined` | Only in an `is` predicate about `@subject`, as its `SubjectType` ([ADR 0009](0009-triggers.md)) |
| `@all` | Only in an entity's `expose` and `hide` blocks ([ADR 0022](0022-entities.md)), and in `passes @all` ([ADR 0023](0023-error-handling.md)) |
| `@result` | Only in a trigger, whatever its source |
| `@request`, `@message` | Only in a trigger on a source that provides them ([ADR 0025](0025-trigger-sources.md)) |
| `@id`, `@entity` | Nowhere: they cannot be read in Cant code |

Using a built-in value anywhere else is a compile-time error.

## Deferred

- **`@request.body`.** How a trigger declares the model of the request's body, how the JSON body is matched to that model, and what happens when it does not match, such as when a required field is missing or has the wrong type, will be decided with the HTTP request trigger source.
- **Where `@result` is used.** Which of a trigger's settings can use `@result`, such as one that forms the source's reply, is left for later.
- **Custom built-ins.** A future ADR may let programs or modules define built-in values of their own.

## Consequences

- Every built-in value is listed in one place, with its type and where it can be used, so the compiler can reject any other `@` name, and any built-in used in the wrong place.
- The list is closed, so a program cannot add built-ins of its own, and new ones, such as the current time, need an ADR.
- `@subject` can be used anywhere, but source built-ins only in triggers, so actions get request and message data only through their parameters.
- `@id` cannot be read, so a program never handles entity identifiers directly, and cannot build an entity from one. An entity still converts to text as its identifier, so a program can show one, but not use it.
- `@result` always has an error return type, so whatever reads it handles a successful result and an error in the same way, even for actions that cannot raise errors.
- The model of `@request.body` is still to be decided, so request bodies cannot be used until the HTTP request source is defined.
