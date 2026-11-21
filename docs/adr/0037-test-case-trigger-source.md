# 0037. The `TestCase` trigger source

- **Status:** Accepted
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
            @entity := User,
            email := "ada@example.com",
            name := "Ada",
        }
    arguments
        invoiceId := "inv_1"
    assertions
        isEmpty @error, "the invoice is approved"
```

- **`@entity`.** The `@entity` member names the subject entity, by name or qualified name ([ADR 0005](0005-module-namespaces.md)). It must be an entity marked `subject` ([ADR 0010](0010-security.md)), and naming any other type is a compile-time error. This is the only place a type is given as a member's value. Its name starts with `@`, the prefix reserved for built-ins ([ADR 0024](0024-built-in-values.md)), so it can never clash with a field, however that field is named, including a member written as a string, such as `"entity"` ([ADR 0021](0021-collections.md)). To allow it, an object value's member name can be a built-in name:

  ```ebnf
  ObjectItem  = (Identifier | ?keyword? | StringLiteral | BuiltIn), ":=", Expression ;
  ```

  This extends the `ObjectItem` rule of [ADR 0021](0021-collections.md). `@entity` in a test case's `subject` is the only built-in name a member can have. Any other, and `@entity` in any other object value, is a compile-time error. `@entity` is the built-in field that every entity has, which holds its type ([ADR 0022](0022-entities.md)). So the member gives the subject entity its `@entity`, which is how the interpreter resolves the subject's type, as it does for any entity. [ADR 0024](0024-built-in-values.md) lists this use of `@entity`, as a member name in `subject`, alongside `@error`.
- **Fields.** The other members give the entity's fields, named as they are in its model, as its `identity` line names them ([ADR 0022](0022-entities.md)). They are matched against the model as an anonymous model is ([ADR 0027](0027-object-shapes.md)): every required field must be given, optional fields can be left out and take their defaults, each value must have its field's type, and a member the model doesn't have is a compile-time error. Hidden fields can be given too, since a test may need them. Since every `identity` field is a field of the model, the subject is always identified.
- **Navigation fields.** A navigation field ([ADR 0035](0035-entity-relationships.md)) can't be given, since it holds entities. So an entity whose `identity` names a navigation field can't be a test case's subject, and naming one in `@entity` is a compile-time error.
- **Constant.** Every field's value must be a constant expression, so the object is a constant expression ([ADR 0023](0023-error-handling.md)), the subject is known at compile time, and `subject`, like every other source parameter, is configured before the test case runs ([ADR 0025](0025-trigger-sources.md)). The `@entity` member holds a type, not a value, and is allowed only here, so the object itself must be written in `subject`, but its fields' values can come from top-level constants ([ADR 0034](0034-top-level-constants.md)).
- **`@subject`.** The interpreter makes an entity of the named type from the object, with an `@id` of its own ([ADR 0017](0017-faceted-types.md)), and stores it in the test case's storage before the test case runs (see [Running tests](#running-tests)), so the action can find it, and relate other entities to it, as it could any stored entity ([ADR 0022](0022-entities.md), [ADR 0035](0035-entity-relationships.md)). It makes a fresh one each time the test case runs, so a change one test case makes to its subject never reaches another. For the whole test case, in its `auth` rule, in the action and every action it calls, and in its assertions, `@subject` is that entity. So `@subject is User` is `true`, and `@subject` can be narrowed and its fields read as usual ([ADR 0010](0010-security.md)). It is set directly, not by authenticating a request, so it doesn't depend on [ADR 0032](0032-authentication.md).
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

### Running tests

When the interpreter runs a program's tests:

- **Only `TestCase` fires.** No other trigger source fires, so triggers `on Start`, on HTTP requests and on any other source do nothing. A test that needs what a `Start` trigger's action does calls that action itself.
- **Fresh storage for each test case.** Each test case starts with empty storage for entities and files ([ADR 0015](0015-files.md), [ADR 0022](0022-entities.md)), which holds only its subject, if it has one (see [Choosing the subject](#choosing-the-subject)). Its storage is thrown away when it ends, whether it passes or fails. So nothing one test case stores can be seen by another, and nothing has to be undone, though Cant has no transactions ([ADR 0023](0023-error-handling.md)).
- **No defined order.** Test cases run in no defined order, and the interpreter may run several at the same time. Since each has its own storage, a test case can't depend on another having run.
- **Native module state is shared.** Storage is fresh for each test case, but a native module's own state isn't ([ADR 0036](0036-native-modules.md)): the module is loaded once for the whole run, and its state is shared by every test case, which may be running at the same time. A native module that keeps state has to allow for that, as it does for interleaving triggers ([ADR 0036](0036-native-modules.md)).
- **Set-up.** There is no separate set-up or tear-down. Set-up that several test cases share is an action that each test action calls, and fresh storage makes tear-down unnecessary.
- **Reporting.** The interpreter reports each test case by its `name`, as passed or failed. A failed test case is reported with why it failed: the message of its failing assertion, the panic, with the message of a failing `assert` if there is one, the error its action raised or passed, or its `auth` rule being `false`. How a program's tests are chosen, such as all of them, those in some modules or those whose names match a pattern, and the format of the report, are up to the interpreter.

## Deferred

- **Memberships and roles.** A subject's roles and permissions come from its groups, but how subjects become members of groups and get roles is left to [ADR 0032](0032-authentication.md). Until it is decided, a test case can test `@subject is <type>` and anonymous `auth` rules, but not role or permission predicates.
- **Stand-ins for native actions.** A test case can't replace a native action ([ADR 0036](0036-native-modules.md)) with a stand-in. A native module that shouldn't reach a real service during tests, such as a payment provider, has to choose a fake itself, such as from its own configuration.
- **Shared set-up.** A mechanism for set-up shared by several test cases, other than an action each one calls, may be added later.

## Consequences

- Tests are written in Cant, as triggers, so there is little new syntax to learn: a source, an `assertions` block and `@error`. The compiler checks a test case's arguments against the action's signature as it checks any trigger's, and checks every assertion's types.
- A test case can run an action under test directly and check what it returned, or which error it gave, without a separate test action.
- Every assertion has a message, so a failing test case always says what it expected, not just which line failed.
- Assertions stop at the first failure and narrow the ones after them, like a series of `assert` statements, so later assertions can rely on earlier ones, such as reading an error's `data` once it has been narrowed. The cost is that a test case reports only its first failing assertion.
- An error from the action fails the test case unless an assertion uses `@error`, so an unexpected error is never ignored by accident, while a test that expects an error can check it.
- A test case names itself with a constant expression, so its name is known at compile time, and two test cases with the same name are caught before any test runs.
- Test cases only run when the interpreter runs a program's tests, so a program can keep its tests alongside its code without them running in production. In a test run, no other source fires, so a test only does what its own action does.
- Each test case has its own empty storage, holding only its subject, so test cases can't affect each other, can run in any order or at the same time, and need no tear-down. The cost is that every test case has to set up all the data it needs, and that native module state is still shared between them.
- The language fixes what a test report says about each test case, but not how tests are chosen or how the report is formatted, which is left to the interpreter's tooling.
- Role and permission predicates can't be tested until [ADR 0032](0032-authentication.md) decides how subjects get them, and native actions can't be replaced with stand-ins, so code that reaches outside services needs its native modules to provide fakes.
- A test case can describe its subject in place, as a literal object, so `auth` rules and actions that check `@subject` can be tested as a signed-in subject, as well as anonymously, without creating or loading entities, and without going through authentication.
- The subject's fields are checked against its entity's model at compile time, like an anonymous model, so a missing or misspelled field is caught before any test runs.
- `subject` is a constant object ([ADR 0023](0023-error-handling.md)), so it is known at compile time, as every source parameter is ([ADR 0025](0025-trigger-sources.md)), and needs no special case.
- `@entity` is a member name that holds a type, which happens nowhere else in Cant. Because it starts with `@`, it can't clash with a field, but object values gain built-in names as member names, which the parser has to accept and the compiler has to reject everywhere but `subject`.
- A subject entity whose `identity` names a navigation field, such as one identified by its organization, can't be a test case's subject.
- `@error` is added to the built-in values, and `subject` becomes a place where `@entity` can be written ([ADR 0024](0024-built-in-values.md)), and `assertions` to the trigger settings ([ADR 0009](0009-triggers.md)). The parser has to accept both.
- `TestCase` is the first trigger source this language defines in an ADR, so it is also the first test of how [ADR 0025](0025-trigger-sources.md) describes sources: a name, parameters and built-in values.
