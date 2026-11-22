# 0023. Error handling

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Several ADRs say that something is an error at runtime, and leave what happens then to an ADR on error handling:

- A value that fails the runtime check when it is converted to an enum ([ADR 0013](0013-enums.md)).
- A facet that cannot be derived, such as an entity whose `@id` no longer exists ([ADR 0017](0017-faceted-types.md)).
- Division or modulo by zero, and a fractional operand to `%` ([ADR 0019](0019-operators.md)).
- Assigning to a negative index before the start of an array ([ADR 0021](0021-collections.md)).
- A default value that cannot be worked out when an object is created, and deleting a required field or assigning to a missing field when the field is named by an expression ([ADR 0027](0027-object-shapes.md)).

[ADR 0010](0010-security.md) leaves how a refused `auth` rule is reported, such as with an HTTP 401 or 403, to the interpreter. The source EBNF has an `assert` expression.

## Decision

Error handling in Cant combines checked exceptions with an error return type. It covers what can only go wrong at runtime:

- Values that might be missing are optionals, not errors, and must be checked before use ([ADR 0014](0014-optionals.md), [ADR 0016](0016-handling-optional-values.md)). Reading outside an array or a missing map member gives an empty optional, not an error ([ADR 0021](0021-collections.md)).
- Mistakes the compiler can find, such as mixing types or using an unchecked optional, are compile-time errors.

### The error return type

An action can declare that it can return an error. Its return type is then an **error return type**, which has two types: an **error type** and a **value type**. A value of an error return type holds exactly one value, which is either an error of the error type or a value of the value type, never both and never neither.

As with checked exceptions, the errors an action can return are part of its signature, so callers can see them. After its return type, an action can have a `raises` clause, listing the errors it raises itself, and a `passes` clause, listing the errors it can pass along from actions it calls with `pass` (see Passing an error). Each clause takes a comma-separated list of errors, which can be in other namespaces:

```ebnf
ActionSignature = Identifier, "(", [ParameterList], ")", ":", ReturnType, [ErrorClauses] ;
ErrorClauses    = RaisesClause, [PassesClause] | PassesClause, [RaisesClause] ;
RaisesClause    = RaisesKeyword, ErrorList ;
PassesClause    = PassesKeyword, PassedError, {",", PassedError} ;
PassedError     = ErrorName | "@all" ;
ErrorList       = ErrorName, {",", ErrorName} ;
ErrorName       = Identifier | QualifiedIdentifier ;
```

```cant
action FindUser(email: TEXT): User raises UserNotFound, AccountLocked
    body
        // ...

action Greet(email: TEXT): TEXT raises billing::PaymentDeclined passes UserNotFound, AccountLocked
    body
        // ...
```

`passes @all` means the action can `pass` along any error at all. The compiler does not work out a list of errors for it: to its callers, the action's result may hold any `ERROR`. Only `passes` can take `@all`: an action must list every error it raises itself. Neither clause can list `ERROR`; `passes @all` is the only way to pass along every error. `@all` can be combined with named errors, as in `passes @all, UserNotFound`.

The two clauses can be written in either order. A named error can appear in only one of them: listing an error in both `raises` and `passes` is a compile-time error, and so is listing it twice in the same clause, or `@all` twice. `@all` does not name any error, so `raises UserNotFound passes @all` is valid even when an action called in the body can return `UserNotFound`.

`passes @all` is a convenience for the action that declares it. It does not reduce its callers' obligations: a caller handles its result like any other, by checking it, passing it, ignoring it or using it (see Unhandled errors). Because the result may hold any error, a caller can only pass it along if it has `passes @all` too, and checking every error needs `instanceOf ERROR`:

```cant
action Import(file: FILE): NUMBER passes @all
    body
        // ...

action ImportAndCount(file: FILE): NUMBER passes @all
    body
        pass Import(file)       // valid: ImportAndCount also passes @all

action ImportQuietly(file: FILE): VOID
    body
        ignore Import(file)     // valid: the error is ignored

action ImportOrZero(file: FILE): NUMBER
    body
        result := Import(file)
        if result instanceOf ERROR
            return 0
        return result           // valid: result is narrowed to NUMBER
```

An action with either clause has an error return type. Its error type is any of the errors in both clauses, or any `ERROR` if it has `passes @all`, and its value type is the action's return type. A caller sees the errors in both clauses the same way: whether an error was raised by the action or passed along by it makes no difference to the caller.

`raises` and `passes` are only special in an action's signature, after the return type, and can be used as identifiers elsewhere.

### Errors

Errors are declared as top-level constructs, alongside actions, models and enums, with the `error` keyword:

```ebnf
ErrorDeclaration = ErrorKeyword, Identifier, [?indent?, ErrorData, ?dedent?] ;
ErrorData        = DataKeyword, ( Identifier | QualifiedIdentifier
                                | ?indent?, {Field | ?comment?}, ?dedent? ) ;
```

```cant
error UserNotFound

error AccountLocked
    data AccountLookup

error PaymentDeclined
    data
        reason: TEXT
        retryable?: BOOLEAN := false
```

An error has:

- a **name**, and
- an optional **`data`** model ([ADR 0027](0027-object-shapes.md)) that carries information about the error.

An error's name is a type name, so it must be unique among the type names in its namespace: an error and an enum, a model or an entity with the same name in the same namespace are a compile-time error ([ADR 0013](0013-enums.md), [ADR 0027](0027-object-shapes.md)).

The `data` model can be a named model, written after `data` on the same line, or an anonymous one. An anonymous `data` model lists its fields in an indented block under `data`, written as a model's fields are (`Field`, [ADR 0027](0027-object-shapes.md)), and is matched by structure like other anonymous models ([ADR 0027](0027-object-shapes.md)).

`error` starts a top-level declaration, so, like `model`, it is a keyword reserved everywhere. `data` is only special inside an error's declaration, and can be used as an identifier elsewhere.

### `ERROR`

`ERROR` is the type of all errors: every error is an `ERROR`. `ERROR` is written in upper case, like the base types ([ADR 0012](0012-base-types.md)), and like them is a keyword reserved everywhere.

### Where errors can be used

Although an error's name is a type name, neither an error type nor `ERROR` can be used as:

- an action's return type ([ADR 0007](0007-actions.md)),
- a parameter's type ([ADR 0020](0020-action-parameters.md)),
- a model field's type ([ADR 0027](0027-object-shapes.md)),
- a collection's element type ([ADR 0021](0021-collections.md)), or
- a value held by an `UNKNOWN` ([ADR 0033](0033-unknown-type.md)).

An error only reaches a caller inside an error return type, when an action declares that it can return that error.

Like other top-level declarations, an error can be exported from its module and imported into another ([ADR 0005](0005-module-namespaces.md), [ADR 0006](0006-imports.md)), so an action can declare that it returns an error defined in another namespace.

### Reading an error

An error that has a `data` model has a `data` field, which holds it. Once an identifier is narrowed to an error, the program reads `data` as a field, and can pass it on like any other model value. An error has no field for its name: a program finds out which error it has with `instanceOf`.

The type of `data` is fixed by the error's specific type. Once an identifier is narrowed to `PaymentDeclined`, `result.data` has the type of `PaymentDeclined`'s `data` model, so its fields can be read directly and are checked by the compiler. Reading `data` from an error that has no `data` model is a compile-time error. That includes `ERROR` itself: a value narrowed only to `ERROR`, not to a specific error, has no `data`, so a program narrows to the specific error first.

```cant
result := ChargeCard(invoice)
if result instanceOf PaymentDeclined
    LogDeclined(reason := result.data.reason)
    return "Payment declined: ${result.data.reason}"
```

### Raising an error

An action raises an error with a `raise` statement. `raise` is treated as equivalent to `return` ([ADR 0007](0007-actions.md)), except that the action's result holds the error instead of a value:

- It ends the action immediately, and nothing after it in the action runs.
- It can be used wherever `return` can, including inside loops and `if` blocks.
- Wherever the compiler checks that an action returns, a path that ends in `raise` counts as returning.
- Like `return`, `raise` is a keyword reserved everywhere.

`raise` is a statement, one of the statements of an action's body ([ADR 0007](0007-actions.md)). It can only be used in an action's body, not in an expression, a trigger's settings ([ADR 0009](0009-triggers.md)) or a model's default values ([ADR 0027](0027-object-shapes.md)).

```ebnf
RaiseStatement = RaiseKeyword, (Identifier | QualifiedIdentifier),
                 ["(", [ArgumentList], ")" | WithKeyword, Expression] ;
```

`raise` names the error, which can be in another namespace, and gives the error's `data` as arguments, written as in a call ([ADR 0020](0020-action-parameters.md)). The fields of the error's `data` model take the place of an action's parameters: each argument names a field, required fields must be given, optional fields can be left out and take their defaults ([ADR 0027](0027-object-shapes.md)), and the short forms of [ADR 0020](0020-action-parameters.md) apply. An error with no `data`, or whose `data` has no required fields, can be raised without the parentheses:

```cant
raise UserNotFound
raise PaymentDeclined(reason := "Card expired", retryable := false)
raise billing::PaymentDeclined(reason, retryable := false)
```

`raise … with` gives a model value as the error's whole `data`, if its type is consistent with the error's `data` model. The value is matched against the `data` model as an argument is matched against an action's parameter ([ADR 0020](0020-action-parameters.md), [ADR 0027](0027-object-shapes.md)): an anonymous model value is matched by structure, and a value of a named model matches a named `data` model by name and an anonymous `data` model by structure. A value of any other type is a compile-time error.

```cant
raise AccountLocked with lookup
raise AccountLocked with { email := email, attempts := 5 }
```

Arguments in parentheses always name the `data` model's fields, so `raise AccountLocked(lookup)` passes `lookup` as a field, by the short forms of [ADR 0020](0020-action-parameters.md), never as the whole `data`. `with` is only special after the error's name in a `raise` statement, and can be used as an identifier elsewhere.

An action can only raise errors listed in its `raises` clause. Raising any other error, including one listed only in `passes`, is a compile-time error.

### Handling an error

A caller can give the result of an action with an error return type to an identifier, and check it with `instanceOf` ([ADR 0033](0033-unknown-type.md)) to find out whether it holds an error or a value:

```cant
action Welcome(email: TEXT): TEXT
    body
        result := FindUser(email)
        if result instanceOf UserNotFound
            return "No such user"
        if result instanceOf AccountLocked
            return "Your account is locked"
        return "Welcome, ${result.name}"   // valid: result is narrowed to User
```

- `result instanceOf UserNotFound` is `true` when `result` holds that error, and narrows `result` to it.
- `result instanceOf ERROR` is `true` when `result` holds any error.
- Once every error the action can return has been ruled out, the identifier is narrowed to the value type, here `User`.

The value type can be `VOID` ([ADR 0012](0012-base-types.md)). The result of an action declared `: VOID raises SaveFailed` holds either an error or no value at all. Unlike the result of an action that returns `VOID` and no errors, it can be assigned to an identifier, so that the program can check it, pass it or ignore it. Once every error has been ruled out there is nothing left to use, and using the result as a value, including after narrowing, is a compile-time error:

```cant
result := SaveInvoice(invoice)       // valid: SaveInvoice is VOID raises SaveFailed
if result instanceOf SaveFailed
    return "Could not save"
notice := "Saved: ${result}"         // compile-time error: result has no value to use
```

Since such a result cannot be used, it is handled by checking, passing or ignoring it (see Unhandled errors).

The value type can be an optional ([ADR 0014](0014-optionals.md)), as in an action declared `: User? raises UserNotFound`. Its result holds an error, a `User` or `NOTHING`. Once every error has been ruled out, the identifier is narrowed to `User?`, and the program then checks it with `isEmpty` as for any optional ([ADR 0016](0016-handling-optional-values.md)).

Narrowing follows the same rules as for `isEmpty` and other uses of `instanceOf` ([ADR 0016](0016-handling-optional-values.md)): it follows the logic of the whole condition, holds after an early return, and only narrows an identifier, not an expression such as a call.

Giving the result to an identifier does not use it, so holding an error in an identifier never panics. An identifier is the only place an unchecked result can be held, since an error type cannot be a parameter's or field's type. That includes built-in values, which are special identifiers ([ADR 0024](0024-built-in-values.md)), such as `@result`, which holds the unchecked result of a trigger's action.

A caller does not have to check. If it uses the value without checking, and the value holds a value of the value type, the program carries on with that value. If the value holds an error, the program **panics**, whatever the action's `passes` clause says.

An error is only passed along by a `pass` statement (see Passing an error). Passing an error along is never implicit.

### Returning a checked result

A value that may hold an error cannot be returned with `return`. A `return` can only give a value that has been narrowed to a type that is not an error, such as the value type of an action's result once every error has been ruled out. Returning an unchecked result, or one narrowed to an error, is a compile-time error. This includes an expression that uses an unchecked result, such as `return LoadUser(id).email`: the result of `LoadUser` has to be checked before a `return` can use it. An error only leaves an action through `raise` or `pass`:

```cant
// Not valid
action FindUser(id: TEXT): User passes UserNotFound
    body
        result := LoadUser(id)
        return result        // error: result may hold UserNotFound

// Valid
action FindUser(id: TEXT): User passes UserNotFound
    body
        result := LoadUser(id)
        if result instanceOf UserNotFound
            pass result
        return result        // valid: result is narrowed to User
```

Using an unchecked result outside a `return` counts as checking it, since the program panics at that point if the result holds an error. So the value that comes out can be returned:

```cant
email := LoadUser(id).email   // panics if LoadUser gives UserNotFound
return email                  // valid: email is a TEXT
```

### Passing an error

An action passes an error along with a `pass` statement:

```ebnf
PassStatement = PassKeyword, Expression ;
```

```cant
action Welcome(email: TEXT): TEXT passes AccountLocked
    body
        result := FindUser(email)
        if result instanceOf UserNotFound
            return "No such user"
        if result instanceOf AccountLocked
            pass result
        return "Welcome, ${result.name}"
```

`pass` is treated as equivalent to `return` and `raise`, except that the action's result holds the error it is given:

- It ends the action immediately, and nothing after it in the action runs.
- It can only be used in an action's body, wherever `return` can.
- Wherever the compiler checks that an action returns, a path that ends in `pass` counts as returning.
- Like `return` and `raise`, `pass` is a keyword reserved everywhere.

`pass` can pass an error that the action lists in its `passes` clause, or that `passes @all` covers. It can also pass any error the action lists in its `raises` clause: an action can pass along anything it could raise itself, without listing it twice. Passing any other error is a compile-time error.

`pass` can also take an unchecked result, if its type is compatible with the action's return type: its value type must be compatible with the action's return type, and every error it may hold must be one the action can pass. If the result holds an error, `pass` passes it along. If it holds a value, `pass` returns that value, as `return` would:

```cant
action FindUserByEmail(email: TEXT): User passes UserNotFound, AccountLocked
    body
        pass FindUser(email)   // returns the User, or passes the error along
```

### Ignoring an error

A program says that it is going to ignore a potential error with the `ignore` keyword. `ignore` takes a value that may hold an error, such as a call or an identifier that holds a result:

```cant
ignore SendReceipt(invoice)

user := FindUser(email)
ignore user

owner := ignore FindUser(ownerEmail)   // the result is kept, and marked as ignored
```

`ignore` is a prefix operator, like `isEmpty` ([ADR 0016](0016-handling-optional-values.md)), and binds at the same level, between `orElse` and `**` ([ADR 0019](0019-operators.md)):

```ebnf
Prefix = (IsEmptyKeyword | IgnoreKeyword | "!" | "-"), Prefix | Fallback ;
```

So `ignore FindUser(email).name` is `ignore (FindUser(email).name)`: the `.name` uses the unchecked result first, and panics if it holds an error. `ignore user` on its own line is an expression statement ([ADR 0007](0007-actions.md)). Like `isEmpty`, `ignore` is a keyword.

`ignore` applies to every error the value may hold. It cannot name particular errors to ignore.

`ignore` is housekeeping: it marks a potential error as one the program has deliberately chosen not to handle. It does not handle the error, and it does not prevent panics. If `user` holds an error and the program later uses it, the program still panics. `ignore` does not narrow: after `ignore user`, `user` keeps its error return type, as `owner` does after `owner := ignore FindUser(ownerEmail)`, so it still cannot be returned until it has been checked. Unlike `return`, `raise` and `pass`, `ignore` does not end the action.

Calling an action that can raise or pass an error, without assigning or otherwise using its result, is also an ignore, as if `ignore` were written:

```cant
SendReceipt(invoice)   // the same as: ignore SendReceipt(invoice)
```

### Unhandled errors

Every result that may hold an error must have some kind of handling. A result is handled when the program:

- checks it with `instanceOf` (see Handling an error),
- passes it along with `pass`,
- ignores it with `ignore`, or by calling the action without using its result, or
- uses it, which panics if it holds an error.

A result that has none of these, such as one given to an identifier that is never read, checked or ignored, is a compile-time error:

```cant
user := FindUser(email)   // error: the result is never handled
return "Done"
```

Every error a result may hold must be handled. A result that is checked for some of its errors, and then neither checked for the rest nor passed, ignored or used, is a compile-time error for the errors that were not checked. `instanceOf ERROR` checks for every error at once.

```cant
result := FindUser(email)
if result instanceOf UserNotFound
    return "No such user"
return "Done"   // error: AccountLocked is never handled
```

### Assertions

Cant has an `assert`, which checks that a `BOOLEAN` condition holds at runtime. If the condition is `false`, the program panics (see Panics). A failed assertion is not an error that a program can check, pass or ignore, so `assert` adds nothing to an action's `raises` clause.

```ebnf
AssertStatement = AssertKeyword, Expression, [",", Expression] ;
```

```cant
assert count > 0
assert count > 0, "count must be positive, but was ${count}"
```

`assert` is a statement, so, like `return`, `raise` and `pass`, it can only be used in an action's body, and it is a keyword reserved everywhere. The condition must be a `BOOLEAN` expression. A condition of any other type is a compile-time error. An optional message follows a comma. It is `TEXT`, and the interpreter can include it when it reports the panic.

A passing `assert` narrows types as appropriate, as an `if` whose other branch always returns would ([ADR 0016](0016-handling-optional-values.md), [ADR 0033](0033-unknown-type.md)). The code after it only runs when the condition is `true`, so it gets the narrowing a `true` condition gives:

```cant
assert !isEmpty user
Greet(user)                 // valid: user is narrowed to User

assert !(result instanceOf ERROR)
return result               // valid: result is narrowed to its value type
```

### Panics

Panics are handled by the interpreter, not by the program. A program cannot catch or recover from a panic. The interpreter decides what happens when one occurs, including what the panic stops and what the trigger that started the action reports to an HTTP caller, as it decides how a refused `auth` rule is reported ([ADR 0010](0010-security.md)).

Cant has no transactions. When an action raises an error, passes one along or panics, nothing it has already done is undone.

A facet that cannot be derived ([ADR 0017](0017-faceted-types.md)), such as the contents of an entity whose `@id` no longer exists, panics. It is not an error that a program can check, pass or ignore ([ADR 0029](0029-accessing-facets.md)).

### Errors that reach a trigger

An error raised or passed by the action a trigger runs goes back to the trigger's source, which may handle it or pass it on to the interpreter ([ADR 0025](0025-trigger-sources.md)).

### Built-in errors

The language has a fixed set of **built-in errors** for the runtime errors that earlier ADRs leave to this one. Every built-in error is an `ERROR`, like a declared error, and none of them has `data`:

| Error | Raised when |
| --- | --- |
| `DivisionByZero` | The right-hand side of `/` or `%` is zero ([ADR 0019](0019-operators.md)) |
| `FractionalModulo` | An operand of `%` is not a whole number ([ADR 0019](0019-operators.md)) |
| `InvalidEnumValue` | A value converted to an enum is not one of the enum's values ([ADR 0013](0013-enums.md)) |
| `IndexBeforeStart` | A value is assigned to a negative index before the start of an array ([ADR 0021](0021-collections.md)) |
| `DefaultUnavailable` | A model field's default value cannot be worked out when an object is created ([ADR 0027](0027-object-shapes.md)) |
| `RequiredField` | A required field, named by an expression, is deleted ([ADR 0027](0027-object-shapes.md)) |
| `UnknownField` | A value is assigned to a field that the model does not have, named by an expression ([ADR 0027](0027-object-shapes.md)) |
| `CardinalityViolation` | A change to a relationship, or a delete, would break a relation's cardinality ([ADR 0035](0035-entity-relationships.md)) |

Built-in errors are handled like any other error: they can be checked with `instanceOf`, passed, ignored or used. Each comes from a construct that already has a way to give an error:

- `DivisionByZero` and `FractionalModulo` are part of the result of `/` and `%` (see Errors from operators).
- `InvalidEnumValue` comes from converting a value to an enum ([ADR 0013](0013-enums.md)), and only when the compiler cannot tell that the value is one of the enum's values, so passing or returning an enum value or a constant expression never gives it.
  - When an argument is converted, it is part of the call's result, as if the action listed it in `raises`.
  - When a `return` converts its value, the error is raised from the action, as statements raise theirs (below), so the action must list `InvalidEnumValue` in its `raises` clause. Leaving it out is a compile-time error. A `return` cannot be ignored, so, unlike a statement, there is no way around listing it.
- `CardinalityViolation` is raised from the action when a change to a relationship, or a delete, would break a cardinality, including a call to `add` or `remove` on a to-many navigation field ([ADR 0035](0035-entity-relationships.md)), as statements raise their errors (below): the action must list it in `raises`, unless the change is ignored.
- `DefaultUnavailable` is raised from the action when an object is created and a default cannot be worked out ([ADR 0027](0027-object-shapes.md)), as `IndexBeforeStart`, `RequiredField` and `UnknownField` are raised by statements (below): the action must list it in `raises`, unless the creation is ignored.

A program can also raise a built-in error itself, if it lists it in `raises`, as with a declared error.

The built-in errors live in a module, `cant::Errors`, which a program imports like any other module ([ADR 0006](0006-imports.md)), as it does `cant::Collections` ([ADR 0021](0021-collections.md)). It is declared in Cant, in `stdlib/Errors.cant` in `@dancrumb/cant-compiler`, as an `export error` with no `data` for each built-in error. A program must import `cant::Errors` before it can name a built-in error, such as in `raises`, `raise` or `instanceOf`. An operator or statement can still raise a built-in error in a program that has not imported it, and the program can still handle it with `instanceOf ERROR`, `pass` with `passes @all`, `ignore`, or by using it. The examples here import it `into Errors`, so its errors are named as in `Errors::DivisionByZero`; without `into`, they would be placed in the current namespace. Their names are not reserved, so a program can declare its own error with the same name in its own namespace:

```cant
import cant::Errors into Errors

action Average(total: NUMBER, count: NUMBER): NUMBER raises Errors::DivisionByZero
    body
        average := total / count
        if average instanceOf Errors::DivisionByZero
            raise Errors::DivisionByZero
        return average      // valid: average is narrowed to NUMBER
```

`IndexBeforeStart`, `RequiredField` and `UnknownField` come from assignment and `delete` statements ([ADR 0007](0007-actions.md)), which give no result that a program could check. When such a statement fails, the error is raised from the action, as if the action had a `raise` statement at that point, unless the statement is ignored with `ignore`. As with `raise`, an action whose statement can raise such an error must list it in its `raises` clause, unless the statement is ignored. Otherwise it is a compile-time error:

```cant
import cant::Errors into Errors

action SetField(customer: Customer, field: TEXT, value: TEXT): VOID raises Errors::UnknownField
    body
        customer[field] := value          // raises UnknownField if Customer has no such field

action TrySetField(customer: Customer, field: TEXT, value: TEXT): VOID
    body
        ignore customer[field] := value   // the error is ignored
```

```ebnf
IgnoredStatement = IgnoreKeyword, (AssignmentStatement | DeleteStatement) ;
```

When an ignored assignment or `delete` fails, it changes nothing, and the action moves on to its next statement.

### Errors from operators

Operators ([ADR 0019](0019-operators.md)) have a defined set of errors that they can raise, such as for division by zero. An operator that can raise an error behaves like a call to an action whose `raises` clause lists those errors: its result can be checked, and using it unchecked when it holds an error panics. `/` can raise `DivisionByZero`, including when it divides a `DURATION` ([ADR 0026](0026-dates-and-times.md)), and `%` can raise `DivisionByZero` and `FractionalModulo`. Because such a result is unchecked, the rules for `return` apply to it: `return total / count` is a compile-time error unless the compiler knows `count` is a non-zero constant, and the program must check the result first, or use it outside the `return` (see Returning a checked result).

When the right-hand side of `/` or `%` is a constant expression, one the compiler can work out, and its value is not zero, as in `total / 2`, `n % -3` or `seconds / (60 * 60)`, dividing by zero cannot happen. The compiler treats that operation as raising no division-by-zero or modulo-by-zero error. A constant expression is made of literals, enum values ([ADR 0013](0013-enums.md)), operators applied to constant expressions, strings that only interpolate constant expressions ([ADR 0008](0008-strings.md)), object values whose members' values are all constant expressions ([ADR 0021](0021-collections.md), [ADR 0027](0027-object-shapes.md)), and identifiers whose values the compiler knows because they were given a constant expression, including top-level constants ([ADR 0034](0034-top-level-constants.md)). Identifiers are immutable ([ADR 0030](0030-mutability.md)), so such an identifier keeps its known value:

```cant
secondsPerHour := 60 * 60
hours := elapsed / secondsPerHour   // cannot raise an error
```

An object value is a constant expression when every member's value is one, as in `{ retries := 3, timeout := 60 * 60 }`, including members whose values are themselves such objects. Because an object's fields can be changed ([ADR 0027](0027-object-shapes.md)), two rules keep a constant object from becoming shared, changing state:

- **A fresh object each time.** Each time a constant object is used, it gives a new object, with the same members, as if the object value were written out at that point. So when a top-level constant holds an object, every use of the constant gets its own object, and changing one never changes another, or the constant ([ADR 0034](0034-top-level-constants.md)). Objects are equal only when they are the same object ([ADR 0019](0019-operators.md)), so two uses of the same constant object are not equal: `defaults == defaults` is `false`.
- **Identifiers in a body.** An identifier in an action's body that is given a constant object, as in `config := { retries := 3 }`, holds that one object, which can then be changed like any other. So it is not a constant expression itself, unlike an identifier given a `NUMBER` or a `TEXT`.

Array, map and set values are never constant expressions, even when every element is one, so a constant cannot hold a collection.

Dividing by a constant expression whose value is zero, with `/` or `%`, as in `n / 0` or `n % (2 - 2)`, is a compile-time error. `%` can still raise its error for a fractional operand when the compiler cannot tell that both operands are whole numbers.

## Consequences

- The errors an action can return are part of its signature, so a caller can see every error it may have to deal with, and the compiler checks that each one is handled.
- Every potential error must be handled, by checking, passing, ignoring or using it, so an error cannot be lost by accident. A program that does not want to handle an error has to say so, with `ignore` or by not using a call's result.
- Errors are passed along only with `pass`, and only those the signature allows, so an error never travels up through an action that did not expect it.
- Errors are checked with `instanceOf` and narrowing, the same tools a program uses for optionals and `UNKNOWN`, so there is no separate `try`/`catch` construct to learn.
- Arithmetic is stricter than in most languages. A division by anything other than a non-zero constant gives a result that must be checked before it can be returned, and assignments and `delete`s by expression must declare or ignore their errors.
- `passes @all` saves listing errors, but its callers still have to handle every error, so it does not weaken checking further up.
- Panics cannot be caught by a program. The interpreter decides what a panic stops and how it is reported, so a program cannot rely on what happens after one, and nothing is rolled back.
- `error`, `ERROR`, `raise`, `pass`, `ignore` and `assert` become keywords reserved everywhere, and `raises`, `passes`, `data` and `with` become contextual keywords. The parser needs error declarations, error clauses on signatures, and the new statements.
- The built-in errors live in `cant::Errors`, so a program has to import it to name one, but a program that never names a built-in error does not need it.
