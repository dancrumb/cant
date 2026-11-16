# 0024. Built-in values

- **Status:** Proposed
- **Date:** 2026-11-15

## Context

A **built-in value** is written `@<identifier>` ([ADR 0009](0009-triggers.md)). Several ADRs use them, and promise a later ADR that gives the full list:

- `@subject`, `@anonymous` and `@defined` in `auth` rules and predicates ([ADR 0009](0009-triggers.md), [ADR 0010](0010-security.md)).
- `@id`, an entity's identifier facet ([ADR 0017](0017-faceted-types.md)).
- `@all`, which exposes or hides all of a model's fields in an entity ([ADR 0022](0022-entities.md)), and, in `passes @all`, lets an action pass along any error ([ADR 0023](0023-error-handling.md)).

## Decision

Not decided yet. Earlier ADRs already constrain it:

- The grammar is `BuiltIn = "@", Identifier`, with no space after the `@` ([ADR 0009](0009-triggers.md)). The `@` prefix is reserved, so built-in values cannot clash with anything a program declares ([ADR 0010](0010-security.md)).
- `@subject` is always defined: it is the subject that caused the trigger, or `@anonymous` when there is none ([ADR 0010](0010-security.md)).
- `@subject` has an unnamed built-in type with the fields `entityName: TEXT` and `identityFields: [TEXT]`, and `@subject is <type>` narrows it to that subject entity ([ADR 0010](0010-security.md)).
- `@anonymous` stands for no subject, and `@defined` is its opposite, for any subject that is not anonymous. So `@subject is @defined` is `true` exactly when `@subject is @anonymous` is `false` ([ADR 0010](0010-security.md)).
- `@anonymous` and `@defined` are the only built-in values that can be a `SubjectType` ([ADR 0009](0009-triggers.md)).
- `@id` is provided by the interpreter for every entity ([ADR 0017](0017-faceted-types.md)).
- `@result` is defined in every trigger, whatever its source, and holds what the action the trigger runs returned ([ADR 0009](0009-triggers.md)). Where in a trigger it can be used is left for later.
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

## Open questions

These need answers before this ADR is accepted:

- **The full list.** Which built-in values exist, and what is each one's type?
- **Where they can be used.** `@subject` is available in any action, and `@id` belongs to an entity. Is `@id` written `user.@id`, or some other way? Are some built-in values only available in certain places, such as inside a trigger?
- **Request and event data.** Trigger sources provide built-ins such as `@request` and `@message`, usable only in triggers ([ADR 0025](0025-trigger-sources.md)). Should this ADR list them, or leave them to the sources that define them?
- **Other candidates.** Should the current time, the current request or the program's configuration be built-in values?
- **`@id`.** Can a program read an entity's `@id`, whose type, `EntityId`, is internal ([ADR 0022](0022-entities.md))? If so, what can it do with it, and how is an `EntityId` converted to text, given that an entity converts to text as its `@id` ([ADR 0011](0011-converting-values-to-text.md))?
- **Programs.** Can a program, or a module, define built-in values of its own?
- **`@request.body`.** How does a trigger declare the model of the request's body? How is the JSON body matched to that model, and what happens when it does not match, such as when a required field is missing or has the wrong type?

## Consequences

TODO
