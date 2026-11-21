# 0037. The `TestCase` trigger source

- **Status:** Proposed
- **Date:** 2026-11-21

## Context

Cant has no way to write tests. A program's behaviour lives in actions, and actions only run when a trigger runs them ([ADR 0009](0009-triggers.md)) or another action calls them. So a test needs something that runs an action, with arguments that the test chooses, and reports whether it worked.

That is what a trigger source does: it causes a trigger to run its action ([ADR 0025](0025-trigger-sources.md)). A trigger already says which action to run, and gives its arguments in an `arguments` block. So a test can be a trigger, on a source whose job is to run each of its triggers once and report the outcome.

Cant already has some of the pieces a test needs to check its work:

- `assert` panics when its condition is `false`, and can carry a message ([ADR 0023](0023-error-handling.md)).
- `@result` holds what a trigger's action returned, or the error it raised or passed ([ADR 0024](0024-built-in-values.md)), but which of a trigger's settings can use it is still open.
- An error that the action raises or passes goes back to the trigger's source, which decides what happens ([ADR 0025](0025-trigger-sources.md)).
- A panic can't be caught by the program, and is handled by the interpreter ([ADR 0023](0023-error-handling.md)).

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### The source

Cant has a trigger source called `TestCase`. Each trigger on it is one **test case**:

```cant
import "./invoices.cant"

trigger InvoiceTotal on TestCase
    parameters
        name := "totals the line items on an invoice"
    arguments
        lines := [10, 20, 30]
    assertions
        @result == 60, "the total is the sum of the lines"
```

`TestCase` is described as every source is, by its name, its parameters and the built-in values it provides ([ADR 0025](0025-trigger-sources.md)):

| | |
| --- | --- |
| **Name** | `TestCase` |
| **Parameters** | `name: TEXT`, required; `subject`, optional, a subject entity (below) |
| **Built-in values** | `@error` (below) |

- **`name`.** The test case's name, which is how the test case is reported. Like every source parameter, it must be a constant expression ([ADR 0025](0025-trigger-sources.md)), so it can be built from top-level constants, as in `"${suite}: totals the line items"` ([ADR 0034](0034-top-level-constants.md)). Since the compiler knows every name, two test cases with the same name in one program are a compile-time error.
- **Arguments.** The action's arguments are given in the trigger's `arguments` block, as for any trigger ([ADR 0009](0009-triggers.md), [ADR 0020](0020-action-parameters.md)). Each one names one of the action's parameters, and the compiler checks them against the action's signature: a missing required parameter, or one the action doesn't have, is a compile-time error. Unlike the source's parameters, arguments don't have to be constant expressions, so a test case can pass arrays, objects and the results of calls.
- **`subject`.** The subject the test case runs as, which becomes `@subject` (see [Choosing the subject](#choosing-the-subject)). When it is left out, `@subject` is `@anonymous`.
- **Built-in values.** `TestCase` provides `@error`, and gives `@subject` its value. Using `@request` or `@message` in a test case is a compile-time error. `@result` is available, as in every trigger ([ADR 0024](0024-built-in-values.md)).
- **`auth`.** A test case's `auth` block is evaluated against its subject, as on any other trigger ([ADR 0010](0010-security.md)). A test case whose `auth` rule is `false` fails (below).

### Choosing the subject

A test case runs as the subject described by its optional `subject` parameter. Its value is an object value ([ADR 0021](0021-collections.md)) that names a subject entity and gives that entity's fields:

```cant
model UserRecord
    email: TEXT
    name: TEXT
    nickname?: TEXT

entity User
    subject
    identity email
    models
        UserRecord
    expose
        @all

trigger ApproveInvoice on TestCase
    parameters
        name := "an admin can approve an invoice"
        subject := {
            entity := User,
            email := "ada@example.com",
            name := "Ada",
        }
    arguments
        invoiceId := "inv_1"
    assertions
        isEmpty @error, "the invoice is approved"
```

- **`entity`.** The `entity` member names the subject entity, by name or qualified name ([ADR 0005](0005-module-namespaces.md)). It must be an entity marked `subject` ([ADR 0010](0010-security.md)), and naming any other type is a compile-time error. This is the only place a type is given as a member's value. `entity` is a keyword reserved everywhere ([ADR 0010](0010-security.md)), so no field can be called `entity`, and the member can't clash with one.
- **Fields.** The other members give the entity's fields, named as they are in its model, as its `identity` line names them ([ADR 0022](0022-entities.md)). They are matched against the model as an anonymous model is ([ADR 0027](0027-object-shapes.md)): every required field must be given, optional fields can be left out and take their defaults, each value must have its field's type, and a member the model doesn't have is a compile-time error. Hidden fields can be given too, since a test may need them. Since every `identity` field is a field of the model, the subject is always identified.
- **Navigation fields.** A navigation field ([ADR 0035](0035-entity-relationships.md)) can't be given, since it holds entities. So an entity whose `identity` names a navigation field can't be a test case's subject, and naming one in `entity` is a compile-time error.
- **Constant.** Every member's value must be a constant expression ([ADR 0023](0023-error-handling.md)), so the subject is known at compile time, and `subject`, like every other source parameter, is configured before the test case runs ([ADR 0025](0025-trigger-sources.md)). An object value is not otherwise a constant expression ([ADR 0034](0034-top-level-constants.md)). `subject` is the one place where an object value of constant members counts as one, since the object is only used to make the subject, and is never shared.
- **`@subject`.** The interpreter makes an entity of the named type from the object, with an `@id` of its own ([ADR 0017](0017-faceted-types.md)), and a fresh one each time the test case runs, so a change one test case makes to its subject never reaches another. For the whole test case, in its `auth` rule, in the action and every action it calls, and in its assertions, `@subject` is that entity. So `@subject is User` is `true`, and `@subject` can be narrowed and its fields read as usual ([ADR 0010](0010-security.md)). It is set directly, not by authenticating a request, so it doesn't depend on [ADR 0032](0032-authentication.md).
- **Left out.** Without `subject`, `@subject` is `@anonymous`, as on any source that has no subject ([ADR 0025](0025-trigger-sources.md)). `@anonymous` can't be given as the value, since it can only be used in an `is` predicate ([ADR 0024](0024-built-in-values.md)).

### Assertions

A test case checks what its action did in an `assertions` block, one of the settings in the trigger's block ([ADR 0009](0009-triggers.md)). Each assertion is a `BOOLEAN` condition, a comma, and a message:

```ebnf
TriggerSetting  = AuthBlock | TriggerArguments | SourceParameters | Assertions | ?comment? ;
Assertions      = AssertionsKeyword, ?indent?, {Assertion | ?comment?}, ?dedent? ;
Assertion       = Expression, ",", Expression ;
```

```cant
trigger ChargeCard on TestCase
    parameters
        name := "declines an expired card"
    arguments
        token := "tok_expired"
        amount := 100
    assertions
        !isEmpty @error, "the charge fails"
        @error instanceOf PaymentDeclined, "the card is declined"
        @error.data.reason == "Card expired", "the reason given is that the card expired"
```

- **Conditions.** The condition must be a `BOOLEAN`. A condition of any other type is a compile-time error, as it is for `assert` ([ADR 0023](0023-error-handling.md)) and `auth` ([ADR 0010](0010-security.md)). It can use any operator ([ADR 0019](0019-operators.md)), `@result`, `@error`, `@subject`, top-level constants, and calls to actions.
- **Messages.** Every assertion has a message, which says what the assertion checks. It must be a `TEXT`, and a message of any other type, or a missing one, is a compile-time error. It can interpolate any expression the condition could use ([ADR 0008](0008-strings.md)), as in `"expected 60, but got ${@result}"`. It is only evaluated when the condition is `false`.
- **Order.** The assertions are evaluated in order, after the action has finished. The first one whose condition is `false` fails the test case, and is reported with its message. The ones after it are not evaluated.
- **Narrowing.** Since an assertion is only reached when every assertion before it was `true`, each one narrows the types of `@result` and `@error` for the ones after it, as a passing `assert` narrows the statements after it ([ADR 0023](0023-error-handling.md)). In the example, `!isEmpty @error` narrows `@error` from an optional to the action's errors, and `@error instanceOf PaymentDeclined` narrows it to `PaymentDeclined`, so the last assertion can read its `data`. Narrowing also follows the logic of a single condition, as in `!isEmpty @error and @error instanceOf PaymentDeclined` ([ADR 0016](0016-handling-optional-values.md)).
- **Where.** `assertions` can only be used in a trigger on `TestCase`. In a trigger on any other source it is a compile-time error. A test case has at most one `assertions` block, and the block has at least one assertion.
- **Keywords.** `assertions` is only special inside a trigger's block, like `arguments`, `auth` and `parameters` ([ADR 0009](0009-triggers.md), [ADR 0025](0025-trigger-sources.md)), and stays usable as an identifier elsewhere.

### `@result` and `@error`

In an assertion, `@result` is what [ADR 0024](0024-built-in-values.md) says it is: a value of an error return type, holding either the value the action returned or the error it raised or passed. Using it as a value, as in `@result == 60`, uses an unchecked result. If it holds an error, that panics ([ADR 0023](0023-error-handling.md)), and the test case fails.

`@error` is a built-in value that `TestCase` provides. It holds the error the action raised or passed, if there was one:

- Its type is an optional of the action's errors: any of the errors in the action's `raises` and `passes` clauses, or any `ERROR` if the action has `passes @all` ([ADR 0023](0023-error-handling.md)).
- It is empty when the action returned a value, so `isEmpty @error` is `true` exactly when the action raised or passed no error.
- Like any optional, it must be checked with `isEmpty` before it is used as an error, and `instanceOf` then tells which error it is ([ADR 0016](0016-handling-optional-values.md), [ADR 0033](0033-unknown-type.md)). A value narrowed to a specific error has its `data` ([ADR 0023](0023-error-handling.md)).
- Using `@error` in a test case whose action can give no errors is a compile-time error, since it could never hold one.
- `@error` can only be used in a test case's `assertions`. Anywhere else it is a compile-time error ([ADR 0024](0024-built-in-values.md)).

`@result` and `@error` never change once the action has finished, so narrowing either one holds for the rest of the assertions, as it does for an identifier ([ADR 0018](0018-immutable-identifiers.md)), and as `@subject is <type>` narrows `@subject` ([ADR 0010](0010-security.md)).

### Passing and failing

`TestCase` runs each of its triggers' actions once. A test case fails when:

- its `auth` rule is `false`, since its action doesn't run;
- its action panics, such as when an `assert` in it fails ([ADR 0023](0023-error-handling.md));
- its action raises an error or passes one along, unless one of its assertions uses `@error`. A test case that uses `@error` expects that the action may give an error, so the assertions decide;
- one of its assertions is `false`, or evaluating one panics.

Otherwise, it passes.

A test case with no `assertions` block passes when its action finishes without an error or a panic. So a test can also be written as an action that sets something up, calls the actions under test and checks the results with `assert`, run by a test case with no assertions:

```cant
action TotalsSeveralInvoices(): VOID
    body
        first := InvoiceTotal(lines := [10, 20])
        second := InvoiceTotal(lines := [5])
        assert first + second == 35, "the totals add up"

trigger TotalsSeveralInvoices on TestCase
    parameters
        name := "totals several invoices"
```

### When test cases run

Test cases run only when the interpreter is asked to run a program's tests. When it runs a program in any other way, `TestCase` never fires, so test cases in a program do nothing.

Triggers in an imported module never take effect ([ADR 0006](0006-imports.md)), so a test case only runs as part of the program whose own modules declare it. A program's tests normally live in their own module, which imports the modules it tests. A test module can only call what those modules export, so it tests a module through its exports.

`TestCase`, like the names of other sources, is not a keyword ([ADR 0025](0025-trigger-sources.md)).

## Open questions

These need answers before this ADR is accepted:

- **Storing the subject.** Is a test case's subject stored, so that the action can find it, or relate other entities to it, as it could a stored entity ([ADR 0022](0022-entities.md))? This is part of how test cases are isolated (below).
- **Memberships and roles.** A subject's roles and permissions come from its groups, but how subjects become members of groups and get roles is still open ([ADR 0032](0032-authentication.md)). How does a test set up the memberships that its subject needs?
- **Other sources.** When the interpreter runs a program's tests, do its other triggers, such as those `on Start`, also fire?
- **Isolation.** Do test cases share stored entities and files ([ADR 0015](0015-files.md), [ADR 0022](0022-entities.md)), or does each start from empty storage? Since there are no transactions, nothing one test case changes is undone ([ADR 0023](0023-error-handling.md)).
- **Order and concurrency.** In what order do test cases run, and can they run at the same time?
- **Running and reporting.** How is the interpreter asked to run tests: on a whole project, on chosen modules, or on test cases whose names match a pattern? What does it report, and in what format?
- **Set-up and tear-down.** Is there a way to share set-up between test cases, other than calling a shared action from each one?
- **Native code.** Can a test case replace a native action ([ADR 0036](0036-native-modules.md)) with a stand-in, so that it doesn't reach a real payment provider, for example?

## Consequences

- Tests are written in Cant, as triggers, so there is little new syntax to learn: a source, an `assertions` block and `@error`. The compiler checks a test case's arguments against the action's signature as it checks any trigger's, and checks every assertion's types.
- A test case can run an action under test directly and check what it returned, or which error it gave, without a separate test action.
- Every assertion has a message, so a failing test case always says what it expected, not just which line failed.
- Assertions stop at the first failure and narrow the ones after them, like a series of `assert` statements, so later assertions can rely on earlier ones, such as reading an error's `data` once it has been narrowed. The cost is that a test case reports only its first failing assertion.
- An error from the action fails the test case unless an assertion uses `@error`, so an unexpected error is never ignored by accident, while a test that expects an error can check it.
- A test case names itself with a constant expression, so its name is known at compile time, and two test cases with the same name are caught before any test runs.
- Test cases only run when the interpreter runs a program's tests, so a program can keep its tests alongside its code without them running in production.
- A test case can describe its subject in place, as a literal object, so `auth` rules and actions that check `@subject` can be tested as a signed-in subject, as well as anonymously, without creating or loading entities, and without going through authentication.
- The subject's fields are checked against its entity's model at compile time, like an anonymous model, so a missing or misspelled field is caught before any test runs.
- An object value of constant members counts as a constant expression in `subject`, and nowhere else, so source parameters stay known at compile time, as [ADR 0025](0025-trigger-sources.md) requires, at the cost of one special case in what counts as a constant expression ([ADR 0034](0034-top-level-constants.md)).
- `entity` is used as a member name that holds a type, which happens nowhere else in Cant.
- A subject entity whose `identity` names a navigation field, such as one identified by its organization, can't be a test case's subject.
- `@error` is added to the built-in values ([ADR 0024](0024-built-in-values.md)), and `assertions` to the trigger settings ([ADR 0009](0009-triggers.md)). The parser has to accept both.
- `TestCase` is the first trigger source this language defines in an ADR, so it is also the first test of how [ADR 0025](0025-trigger-sources.md) describes sources: a name, parameters and built-in values.
