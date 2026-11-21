# 0036. Native modules

- **Status:** Proposed
- **Date:** 2026-11-21

## Context

Some of what a Cant program needs can't be written in Cant, or is already provided by the platform the interpreter runs on:

- The standard library modules `cant::Collections` ([ADR 0021](0021-collections.md)), `cant::Errors` ([ADR 0023](0023-error-handling.md)) and `cant::IO` ([ADR 0015](0015-files.md)) are imported like any other module, but their actions can't be written in Cant. For example, `cant::Collections` takes parameters of the internal type `Collection<T>`, which a program can't write.
- Some built-in keywords return a `FILE` ([ADR 0015](0015-files.md)), and a `FILE`'s URL, stream and blob facets follow JavaScript semantics, so their types can't be named in Cant ([ADR 0017](0017-faceted-types.md), [ADR 0029](0029-accessing-facets.md)).
- Trigger sources, such as HTTP requests and schedules, are implemented outside the language, by the interpreter "or whatever provides the source" ([ADR 0025](0025-trigger-sources.md)).
- Programs will want to use existing libraries, such as a payment provider's SDK or a PDF renderer, without each one being rewritten in Cant.

The interpreter runs on Node.js and is written in TypeScript. This ADR is about the bridge between Cant and TypeScript: how an action declares that it is implemented in TypeScript, how the interpreter finds the implementation, and how values, errors and control pass between the two. For now, TypeScript is the only native language.

Earlier ADRs constrain the bridge:

- The compiler checks every call against the action's signature at compile time: named arguments, optional parameters and defaults ([ADR 0020](0020-action-parameters.md)), return types, including `VOID` and `T?` ([ADR 0012](0012-base-types.md), [ADR 0014](0014-optionals.md)), and `raises` clauses ([ADR 0023](0023-error-handling.md)). So it needs a native action's signature without running any TypeScript.
- A module exports only Cant declarations ([ADR 0006](0006-imports.md)), and a top-level constant must be a constant expression the compiler knows ([ADR 0034](0034-top-level-constants.md)), so a constant can't be computed by native code.
- Collections are mutable and passed by reference, and arrays are sparse ([ADR 0021](0021-collections.md)). An object of a model always has exactly its model's fields ([ADR 0027](0027-object-shapes.md)). Only an optional can hold `NOTHING` ([ADR 0014](0014-optionals.md)), and a collection's elements can't be optional ([ADR 0021](0021-collections.md)).
- A value carries its actual type at runtime, so `instanceOf` can check it ([ADR 0033](0033-unknown-type.md)).
- Every error an action can give is in its signature, and a panic can't be caught by a program ([ADR 0023](0023-error-handling.md)).

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Native actions

An action is **native** when its implementation is written in TypeScript. A native action is declared in Cant, with an ordinary signature, but has a `native` line where its `body` would be:

```ebnf
Action          = ActionKeyword, ActionSignature, ?indent?, {?comment?},
                  (BodyKeyword, Block | NativeClause), ?dedent? ;
NativeClause    = NativeKeyword, ConstantStringLiteral ;
```

```cant
model Receipt
    reference: TEXT
    total: NUMBER

error PaymentDeclined
    data
        reason: TEXT

export action ChargeCard(token: TEXT, amount: NUMBER, currency?: TEXT := "GBP"): Receipt raises PaymentDeclined
    native "./payments.js"
```

- The string after `native` names the ECMAScript module that holds the implementation. It is resolved as a URL, with the location of the declaring Cant module as the base, as a URL import is ([ADR 0006](0006-imports.md)). It must be a string literal with no interpolations ([ADR 0008](0008-strings.md)).
- The module must export a function with the same name as the action. `ChargeCard` above is implemented by the export `ChargeCard` of `./payments.js`.
- Only actions can be native. The models, enums, errors and constants that a native action's signature uses are declared in Cant, as usual.
- `native` is only special where an action's `body` could start, and stays usable as an identifier elsewhere, as `body` does.

### Native modules

A **native module** is a Cant module that has at least one native action. It is still Cant source: it is imported, resolved and exported like any other module ([ADR 0006](0006-imports.md), [ADR 0031](0031-module-resolution.md)), needs no `as`, and can mix native actions with actions that have a `body`. A caller can't tell whether an action it calls is native.

The Cant declarations are the single source of truth for a native action's interface. The compiler reads only Cant, so it checks calls to a native action exactly as it checks calls to any other action. The compiler can also generate TypeScript from each native module's Cant declarations, so that `tsc` checks the implementation against them. Neither side is written twice. For each native action, the generated TypeScript has:

- the type of its implementation: its arguments object, and its return type, or a `Promise` of it;
- a constructor for each error in its `raises` clause, which takes that error's `data`, typed from its `data` model, and returns a `CantError` (see [Errors](#errors)).

The interpreter loads the module with JavaScript's dynamic `import()`. Cant doesn't compile TypeScript: the string after `native` names whatever the interpreter can load, normally the JavaScript that the TypeScript compiles to.

The interpreter loads every native action's module when the program starts, before any trigger runs, and checks that it exports a function with the action's name. If a module can't be loaded, or doesn't export that function, the program does not start, and the interpreter reports which action is missing its implementation. So a call to a native action never finds its implementation missing. Loading a module runs its top-level code, so a native module's set-up happens when the program starts.

The standard library modules, such as `cant::Collections`, are native modules provided by the interpreter. Their declarations may use internal types such as `Collection<T>` ([ADR 0021](0021-collections.md)), which no other module can, since a program can't write them.

### Calling a native action

A native action's implementation is a function that takes a single object, with one property for each of the action's parameters, by name, and returns the action's value, or a `Promise` of it:

```ts
// Generated from the Cant declarations
import { type ChargeCard as ChargeCardImpl, PaymentDeclined } from "./payments.cant-types.js";

export const ChargeCard: ChargeCardImpl = async ({ token, amount, currency }) => {
  const result = await provider.charge({ token, amount, currency });
  if (!result.ok) {
    throw PaymentDeclined({ reason: result.reason });
  }
  return { reference: result.id, total: result.amount };
};
```

- **Arguments.** The interpreter evaluates arguments and defaults as for any call ([ADR 0020](0020-action-parameters.md)), then passes them by name. An optional parameter with a default always has a value. An optional parameter with no default that the caller left out is `undefined`.
- **Waiting.** If the implementation returns a `Promise`, the interpreter waits for it to settle before the calling action carries on, so a call to a native action reads, and behaves, like any other call. Whether the interpreter runs other actions, such as those of other triggers, while it waits is up to the interpreter.
- **Return values.** The value an implementation returns, or its `Promise` resolves to, is the action's result. For an action whose return type is `VOID`, the value is ignored.
- **State.** A native module can keep state in its JavaScript module, such as a connection or a cache. It lasts as long as the interpreter keeps the module loaded, which Cant does not define.

### Representing values

Values pass between Cant and TypeScript as plain JavaScript values, without being copied:

| Cant type | TypeScript value |
| --- | --- |
| `TEXT` | `string` |
| `NUMBER` | `number`, never `NaN` or an infinity |
| `BOOLEAN` | `boolean` |
| `DATE_TIME` | `Date`, never an invalid one ([ADR 0026](0026-dates-and-times.md) may change this) |
| `FILE` | A `CantFile`, from the native API (below) |
| An enum | The member's value, a `string`, `number` or `boolean` ([ADR 0013](0013-enums.md)) |
| `T?` | The value, or `undefined` for `NOTHING` |
| `[T]` | An `Array`, whose empty slots ([ADR 0021](0021-collections.md)) are holes |
| `{T}` | A `Map` with `string` keys |
| `SET(T)` | A `Set` |
| A model, named or anonymous | A plain object with one property per field. An optional field with no value has no property |
| `UNKNOWN` | Whichever of the above the value's actual type gives |

- **By reference.** Collections and objects of models are passed by reference, as they are in Cant ([ADR 0021](0021-collections.md), [ADR 0027](0027-object-shapes.md)). A change native code makes to one is seen by Cant, and the other way round. So the interpreter has to hold collections and objects as these JavaScript values.
- **Runtime types.** Native code doesn't attach Cant types to the values it returns. The interpreter gives each returned value the type the signature declares, so a plain object returned where `Receipt` is expected becomes an object of `Receipt`, and `instanceOf Receipt` is `true` for it ([ADR 0033](0033-unknown-type.md)). A value that came from Cant keeps the type it had. Where the signature declares `UNKNOWN`, including as the element type of a collection or the type of a model field, the interpreter infers the actual type from the JavaScript value (see [Inferring types](#inferring-types)).
- **Sets.** A `Set` that native code receives holds no two values that Cant considers equal ([ADR 0021](0021-collections.md)). In a `Set` that native code returns, the interpreter merges values that Cant considers equal, such as two `CantFile`s with the same URL ([ADR 0017](0017-faceted-types.md)).
- **Maps.** A `Map`'s insertion order is a stable order, so it satisfies Cant's undefined but stable order for maps ([ADR 0021](0021-collections.md)).
- **`null`.** `null` is not a Cant value. It is never passed to native code, and returning it is a boundary failure (below).

#### Inferring types

When native code gives a value where Cant expects an `UNKNOWN`, and the value didn't come from Cant, its actual type is inferred from the JavaScript value:

| JavaScript value | Actual Cant type |
| --- | --- |
| A `string` | `TEXT` |
| A `number`, other than `NaN` or an infinity | `NUMBER` |
| A `boolean` | `BOOLEAN` |
| A valid `Date` | `DATE_TIME` |
| A `CantFile` | `FILE` |
| An `Array` | `[UNKNOWN]` |
| A `Map` whose keys are all `string`s | `{UNKNOWN}` |
| A `Set` | `SET(UNKNOWN)` |
| A plain object, whose prototype is `Object.prototype` or `null` | An anonymous model, with one field per own enumerable property ([ADR 0027](0027-object-shapes.md)), each of type `UNKNOWN` |

- The elements of an `Array`, `Map` or `Set`, and the properties of a plain object, are inferred by the same rules, one by one, so each carries its own actual type. An `[UNKNOWN]` can hold a `TEXT` and a `NUMBER` side by side.
- A value inferred this way is never an enum, a named model or an optional. An enum value is just its member's value at runtime anyway ([ADR 0013](0013-enums.md)).
- `undefined` gives `NOTHING` where the type is `UNKNOWN?`, and is a boundary failure where it is `UNKNOWN`. Inside a collection, an `undefined` element is a boundary failure, though a hole in an `Array` is an empty slot ([ADR 0021](0021-collections.md)).
- Any other value is a boundary failure. That includes `null`, functions, symbols, `bigint`s, an invalid `Date`, a `Map` with a key that isn't a `string`, and an instance of any other class, such as a `URL` or a `Buffer`.

### Checking at the boundary

The interpreter checks every value that native code returns, and every error it raises, against the action's declaration: the value's type, `undefined` where the type is not optional, elements and members that are `undefined`, `NaN` and infinities, an enum value that is not one of the enum's values, and a model object with missing or extra properties.

A failed check is a **boundary failure**. A boundary failure is a bug in the native code, not something the program can handle, so it panics ([ADR 0023](0023-error-handling.md)). In particular, an enum value that fails its check panics rather than raising `InvalidEnumValue`, which only a Cant `return` raises ([ADR 0013](0013-enums.md)).

Changes that native code makes later through a reference, such as adding a property to a model object it was given, can't all be caught at the boundary. Cant's guarantees about such values hold only as long as native code keeps them, and the interpreter panics when it finds one broken.

### Errors

A native action lists the errors it can raise in its `raises` clause, as any action does ([ADR 0023](0023-error-handling.md)). It can't have a `passes` clause, since it doesn't call Cant actions. A `passes` clause on a native action is a compile-time error.

Native code raises one of those errors by throwing a `CantError` from the native API, or rejecting its `Promise` with one. The call's result then holds that error, exactly as if a Cant action had raised it. A `CantError` names one of the action's errors, and gives its `data`, which is checked against the error's `data` model like any other value.

Native code normally creates a `CantError` with the constructors generated from the action's declaration (see [Native modules](#native-modules)), as `PaymentDeclined({ reason })` does above. They are typed from the `raises` clause and the errors' `data` models, so `tsc` reports a misspelled error, one the action doesn't raise, or `data` of the wrong shape. A `CantError` can also be created directly, as `new CantError("PaymentDeclined", { reason })`, naming the error as the `raises` clause does, but then only the interpreter's check at the boundary catches those mistakes.

A `CantError` for a built-in error ([ADR 0023](0023-error-handling.md)), such as `Errors::DivisionByZero`, identifies the built-in error itself, not a name. It is passed on as that error if the action's `raises` clause lists it, whatever namespace the declaring module imports `cant::Errors` into.

Anything else that native code throws, or rejects with, panics. That includes a `CantError` for an error the action doesn't list, or whose `data` fails its check. The interpreter can include the JavaScript error when it reports the panic.

### `FILE`s

The native API represents a `FILE` as a `CantFile`, with one method for each facet ([ADR 0015](0015-files.md), [ADR 0017](0017-faceted-types.md)):

| Method | Gives |
| --- | --- |
| `url()` | A `URL`, the identifier facet |
| `stream()` | A `ReadableStream` of the file's contents |
| `blob()` | A `Promise` of a `Blob` of the file's contents |

A `FILE` always has its URL ([ADR 0017](0017-faceted-types.md)), so `url()` never fails. Deriving the stream or blob facet can fail, such as when the file the URL points to no longer exists. Then `stream()` throws, and `blob()` rejects, with an ordinary JavaScript error. Native code can catch it and handle it. If it escapes, it panics, like any other exception that isn't a `CantError` (see [Errors](#errors)), as a facet that can't be derived does in Cant code ([ADR 0029](0029-accessing-facets.md)).

Native code can create a `CantFile` from any one facet, with `CantFile.fromUrl`, `CantFile.fromStream` or `CantFile.fromBlob`, and the interpreter derives the others ([ADR 0017](0017-faceted-types.md)). This is how built-in keywords and `cant::IO` can return new `FILE`s. A program still can't create one itself ([ADR 0015](0015-files.md)). How a Cant program reads a facet is still decided by [ADR 0029](0029-accessing-facets.md).

### The native API

The types and helpers that native code uses, such as `CantError` and `CantFile`, are published in a package of their own, `@dancrumb/cant-native`. Native modules depend on it, but not on the interpreter, the compiler or `@dancrumb/cant-shared` ([ADR 0002](0002-share-language-code-in-cant-shared.md)). The interpreter depends on it too, so it recognises the same `CantError` and `CantFile`.

### Trust

Native code runs with everything the interpreter's Node.js process can do, outside Cant's checks. It isn't sandboxed and needs no permission. Importing a module that has native actions means trusting that code, as with any npm dependency.

## Open questions

These need answers before this ADR is accepted:

- **Concurrency.** While the interpreter waits for a native action's `Promise`, it may run other actions ([Calling a native action](#calling-a-native-action)). Those can change a native module's state, or a collection or object that was passed to the native action, in the middle of the call. Does Cant guarantee anything here, such as running one action at a time, or does a native module have to protect its own state?
- **Cancellation and timeouts.** A `Promise` that never settles stalls the calling action forever. Can the interpreter time a native call out, and if so, is that a panic or a built-in error? Can native code find out that a call has been abandoned, such as with an `AbortSignal`?

## Deferred

- **Entities.** An entity type can't appear in a native action's signature for now, as a parameter, a return type, or inside a collection or model, until the keywords for creating, loading and saving entities are specified ([ADR 0022](0022-entities.md)). Using one is a compile-time error.
- **`@subject` and other context.** A native action is given only its arguments, not `@subject` ([ADR 0024](0024-built-in-values.md)). An action that needs to know the subject receives what it needs as an argument.
- **Trigger sources and built-in keywords.** Whether a native module can provide trigger sources ([ADR 0025](0025-trigger-sources.md)) or built-in keywords ([ADR 0015](0015-files.md)) is left for later.
- **Calling back into Cant.** Native code can't call Cant actions. That waits for Cant to have lambdas or functions ([ADR 0021](0021-collections.md)).
- **Generating TypeScript.** What the generated TypeScript must provide is decided above. How the compiler generates it, such as the command and the file names, is a tooling decision, not part of the language.
- **Capabilities.** A way for a program to limit what a native module can do, such as reaching the network or the file system, may be added later.
- **Other native languages.** Supporting a language other than TypeScript, such as WebAssembly, would need its own representation of values and errors.

## Consequences

- Native actions are declared in Cant, so the compiler, the language server and callers treat them like any other action. A caller never knows, or depends on, whether an action is native.
- There is one source of truth for a native action's interface. The TypeScript is checked against types generated from it, so the declaration and the implementation can't silently drift apart.
- Every native implementation is found when the program starts, so a missing module or export stops the program from starting, rather than panicking the first time a trigger happens to call the action. The cost is that every native module is loaded, and its set-up run, at start-up, even if none of its actions is ever called.
- A native module is an ordinary Cant module, so no new module type, import form or resolution rule is needed, and a module can implement some actions in Cant and some in TypeScript.
- Named arguments arrive as one object, and `Promise`s are waited for, so existing asynchronous libraries can be wrapped with little code.
- Values cross the boundary as plain JavaScript values, without copying, so calls are cheap and native code can use familiar types. The cost is that the interpreter has to hold Cant values as those same JavaScript values, and native code can break Cant's guarantees through a reference in ways that can't all be checked.
- Every returned value is checked against the signature, so a mistake in native code is caught at the boundary, as a panic, rather than spreading through the program as a value of the wrong type. Checking large collections and objects on every return has a cost.
- Native code raises only declared errors, and anything else panics, so Cant's checked errors stay complete: a caller handles every error a native action can give, and no unexpected JavaScript exception reaches Cant code as a value.
- Errors are raised with generated, typed constructors, so `tsc` catches a misspelled error or wrong `data` before the program runs, rather than the interpreter catching it as a panic.
- Values of `UNKNOWN` type are inferred from their JavaScript values by a fixed table, so native code can return mixed data, such as parsed JSON, without declaring its shape. A value that fits none of the rules, such as a class instance, is caught at the boundary.
- A failure to derive a `FILE`'s contents reaches native code as an ordinary JavaScript error, which it can catch. Otherwise it panics, as it does in Cant code.
- The standard library is built the same way as any other native module, apart from being allowed internal types.
- Native code is trusted completely. A native module can do anything the interpreter can, so importing one is a security decision.
- Entities, `@subject` and callbacks are out of reach of native code for now, which limits what native modules can do until those are decided.
- `native` becomes a contextual keyword, and the parser has to accept it in place of `body`.
