# 0016. Handling optional values

- **Status:** Accepted
- **Amended by:** [0019](0019-operators.md) (`isEmpty` requires an optional)
- **Date:** 2026-11-14

## Context

[ADR 0014](0014-optionals.md) gives a value that might be missing the internal type `Optional<T>`, written `T?`, which holds either a `T` or `NOTHING`. Using the value inside an `Optional<T>` as a `T` is a compile-time error unless the program has first checked whether it holds a `T` or `NOTHING`. ADR 0014 does not say how a program makes that check, so until this ADR is decided, a program cannot use an optional's value at all. It can only pass it on to other optional parameters.

Some rules from ADR 0014 limit the options:

- `Optional<T>` cannot be written in a program, so a check cannot name it.
- `NOTHING` cannot be passed as an argument or assigned to an identifier.
- An identifier cannot be declared optional explicitly. It is optional only when it is assigned an optional value.

Programs handle missing values often, so checking one should take little code, and the compiler must be able to tell, from the shape of the program, where a value has been checked.

## Decision

Cant has two operators for optional values: `isEmpty`, which checks whether a value is missing, and `orElse`, which supplies a fallback.

### `isEmpty`

`isEmpty` is a unary operator that can be applied to any value. It produces a `BOOLEAN`:

- If the value is not an optional, `isEmpty` is `false`.
- If the value is an optional, `isEmpty` is `true` when it holds `NOTHING`, and `false` when it holds a value.

```ebnf
IsEmptyExpression  = IsEmptyKeyword, Expression ;
```

`isEmpty` is a keyword. It binds more tightly than comparison operators, so `isEmpty a == b` is read as `(isEmpty a) == b`.

#### `isEmpty`, not `== NOTHING`

`isEmpty` is the only way to check an optional. Comparing a value against `NOTHING`, with `==` or any other comparison operator, is a syntax error:

```cant
if isEmpty user      // valid
if user == NOTHING   // syntax error
```

This narrows [ADR 0012](0012-base-types.md) and [ADR 0014](0014-optionals.md), which say a program can compare against `NOTHING`. With this rule, the only place a program can write `NOTHING` is in returning it from an action whose return type is `T?`.

#### Narrowing

In a branch that `isEmpty` guards, the compiler narrows the value's type as appropriate. Where `isEmpty user` is `false`, `user` is known to hold a value, so a `User?` is narrowed to `User` and can be used as one ([ADR 0014](0014-optionals.md)). Where `isEmpty user` is `true`, `user` holds `NOTHING`, and it still cannot be used as a `User`.

```cant
action Welcome(email: TEXT): VOID
    body
        user := FindUser(email)
        if isEmpty user
            // user is NOTHING here
            return
        else
            Greet(user)  // valid: user is narrowed to User
```

Narrowing works wherever a condition is definitive about whether a value is empty: wherever the condition's result tells the compiler for certain whether the value holds `NOTHING`. A condition can combine `isEmpty` with `!`, `and` and `or`:

| Condition | When it is `true` | Narrowed? |
| --- | --- | --- |
| `!isEmpty user` | `user` holds a value | Yes: `user` is a `User` |
| `!isEmpty user and isAdmin` | Both parts are `true`, so `user` holds a value | Yes: `user` is a `User` |
| `isEmpty user and isAdmin` | Both parts are `true`, so `user` holds `NOTHING` | Yes: `user` is empty |
| `isEmpty user or isAdmin` | Either part may be the one that is `true` | No |

```cant
if !isEmpty user and isAdmin
    Greet(user)  // valid: the condition is only true when user holds a value
if isEmpty user or isAdmin
    Greet(user)  // compile-time error: user might be NOTHING
```

The same reasoning applies where a condition is `false`, such as in an `else` branch. When `isEmpty user or isAdmin` is `false`, both parts are `false`, so `user` holds a value and is narrowed to `User` there.

#### Narrowing and constants

For now, all identifiers are constants ([ADR 0018](0018-immutable-identifiers.md)): once an identifier is assigned, it cannot be assigned again. A narrowed identifier therefore cannot change, so its narrowing lasts for as long as it is in scope, including inside loops. How narrowing interacts with reassignment will be decided when Cant adds support for mutability.

#### Checking results directly

`isEmpty` can be applied to an expression that is not an identifier, such as an action call. The result is an ordinary `BOOLEAN`, but nothing is narrowed, because there is no identifier to narrow. Calling the action again gives a new, unchecked optional:

```cant
if isEmpty FindUser(email)
    CreateUser(email)       // valid: a check for whether a user exists
if !isEmpty FindUser(email)
    Greet(FindUser(email))  // compile-time error: this second call returns an unchecked User?
```

To use the value, a program assigns it to an identifier first and checks that.

#### Returning early

If a branch whose condition is definitive about a value always returns, the value stays narrowed after the `if`, for the rest of the block. The code after the `if` only runs when the condition was `false`, so it gets the narrowing that a `false` condition gives:

```cant
action Welcome(email: TEXT): VOID
    body
        user := FindUser(email)
        if isEmpty user
            return
        Greet(user)  // valid: the action has already returned if user was NOTHING
```

### `orElse`

`a orElse b` gives the value inside the optional `a`, or `b` if `a` holds `NOTHING`. `b` must match the type of the optional: for a `T?`, `b` is a `T`, and the result is a `T`.

`a` must be an optional. Using `orElse` on a value that is not optional is a compile-time error, since there is nothing to fall back from.

```cant
name := FindNickname(user) orElse "friend"  // name is TEXT
```

`orElse` is a keyword, separate from the boolean operator `or`. Using a different word means a `BOOLEAN?` is never ambiguous: `flag orElse true` gives `flag`'s value when it has one, while `flag or true` is boolean logic, which uses `flag`'s value and so needs `flag` to be checked first ([ADR 0014](0014-optionals.md)).

`orElse` short-circuits: `b` is evaluated only when `a` holds `NOTHING`, so if `b` is an action call, the action is not called unless it is needed. Boolean `or` short-circuits in the same way, evaluating `b` only when `a` is `false`.

`orElse` binds more tightly than most operators, including arithmetic, comparison and boolean operators, so its result is worked out first:

```cant
count := FindCount(user) orElse 0 + 1      // (FindCount(user) orElse 0) + 1
same := FindNickname(user) orElse "" == name  // (FindNickname(user) orElse "") == name
```

Operators that build up a single operand, such as `::`, `.` and calls, bind more tightly than `orElse`, so `FindUser(email) orElse guest` applies `orElse` to the result of the call.

`orElse` also binds more tightly than `isEmpty`, so `isEmpty a orElse b` is read as `isEmpty (a orElse b)`. The other reading, `(isEmpty a) orElse b`, would apply `orElse` to a `BOOLEAN` and could never use `b`. `isEmpty (a orElse b)` is useful when `b` is itself optional, as at the end of a chain: it is `true` only when every optional in the chain holds `NOTHING`. The full order of operators is left to the ADR that defines expressions.

`orElse` can be applied to an unchecked optional. It does not use the optional's value as a `T` unless that value is present, so it needs no `isEmpty` check first.

#### Chaining

`orElse` can be chained, to try several optionals in turn before falling back to a value:

```cant
name := FindNickname(user) orElse FindFirstName(user) orElse "friend"
```

The result is the value of the first optional that holds one, or the final value if none do. `b` can itself be an optional `T?`, which is what makes chaining possible, and the type of `a orElse b` is the type of `b`. So a chain that ends in a `T` produces a `T`, and a chain that ends in a `T?` produces a `T?`, which must still be checked before it is used as a `T`.

### Property chaining

Reading a field or calling an action through an optional value, such as `user?.email`, is not supported yet.

## Consequences

- A program checks for a value with `isEmpty` and an `if`, and the compiler narrows the type where it knows the value is present, so a checked value can be used directly.
- Because a value stays narrowed after an early return, a program can deal with a missing value at the top of a block and then use the value freely, without nesting the rest of the block in an `else`.
- Because narrowing follows the logic of the whole condition, a check can be combined with other conditions using `and`, `or` and `!`. The compiler has to analyse those combinations to know where narrowing applies.
- `orElse` handles the common case of a fallback in one expression, without an `if`.
- Because `isEmpty` works on any value, code can check a value without knowing whether its type is optional. On a value that is not optional, the check is always `false`, which the compiler could warn about.
- `orElse` and boolean `or` are separate words, so neither readers nor the compiler have to work out from context which one is meant. Both short-circuit, so the right-hand side is only evaluated when it is needed.
- Treating identifiers as constants keeps narrowing simple and reliable for now. Adding mutability later will mean revisiting where narrowing holds.
- `orElse` adds another keyword, and is longer to type than a symbol such as `??`.
