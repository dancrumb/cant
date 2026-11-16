# 0035. Entity relationships

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Entities are the records a Cant program stores ([ADR 0022](0022-entities.md)), and each one is made of models ([ADR 0027](0027-object-shapes.md)). [ADR 0022](0022-entities.md) leaves how one entity refers to another to a separate ADR, and this is that ADR.

[ADR 0010](0010-security.md) showed a relationship before this ADR existed: its `Membership` entity linked an `Organization` to a `User` through a model whose fields had entity types. The source EBNF that Cant's grammar started from has relations between entities.

## Decision

A relationship between two entities is declared with `relation`, a top-level construct:

```ebnf
Relation     = RelationKeyword, RelationEnd, Cardinality, "---", Cardinality, RelationEnd ;
RelationEnd  = (Identifier | QualifiedIdentifier), "[", Identifier, "]" ;
Cardinality  = "1" | "0..1" | "0..*" | "1..*" ;
```

```cant
relation User[tasks] 1 --- 0..* Task[owner]
```

### Ends and navigation fields

Each end of a relation names an entity, and, in square brackets, a **navigation field** that the relation adds to that entity. The field reaches the entity at the other end. In the example:

- `user.tasks` is the `Task`s the user owns;
- `task.owner` is the `User` who owns the task.

The relation adds both fields, so neither `User`'s nor `Task`'s models declare them. A navigation field's name must not clash with a field the entity already has, from its models or from another relation. A clash is a compile-time error.

### Cardinality

Each cardinality is written beside its own entity, and says how many of that entity each instance at the other end is related to, as in UML. In `User[tasks] 1 --- 0..* Task[owner]`, the `1` beside `User` means each task has exactly one owner, and the `0..*` beside `Task` means each user has any number of tasks.

A navigation field's type follows from the cardinality at the far end:

| Cardinality of the far end | Type of the navigation field | Example |
| --- | --- | --- |
| `1` | The far entity, `E` | `task.owner` is a `User` |
| `0..1` | An optional, `E?` | |
| `0..*` or `1..*` | An array, `[E]` | `user.tasks` is a `[Task]` |

### Setting a relationship

Creating or updating an entity can give a navigation field a value, as in `owner := someUser`. When the field's entity is a subject entity ([ADR 0010](0010-security.md)), the value can be `@subject`, as in `owner := @subject`, once `@subject` has been narrowed to that entity with `@subject is User` ([ADR 0010](0010-security.md)). The keywords for creating and updating entities are not specified yet ([ADR 0022](0022-entities.md)).

### Changing a relationship

A relationship can be changed from either end. A to-many navigation field, such as `user.tasks`, can have entities added to it and removed from it, with the operations that change an array ([ADR 0021](0021-collections.md)), and a single-entity navigation field, such as `task.owner`, can be given a new value. Either way, both ends change together: adding a task to `user.tasks` sets the task's `owner` to that user, and setting `task.owner` adds the task to its new owner's `tasks` and removes it from its old owner's.

### Enforcing cardinality

Every change to a relationship must keep both cardinalities. The compiler reports a break as a compile-time error wherever it can tell, such as creating a `Task` without giving it an `owner`. The interpreter also checks every change at runtime, whether or not the compiler could tell, and a change that would break a cardinality raises the built-in error `CardinalityViolation` ([ADR 0023](0023-error-handling.md)) and is not made. Examples are removing a task from `user.tasks` when each task must have exactly one owner, or emptying a `1..*` end.

Deleting an entity removes it from every relationship it is part of. If that would break a cardinality at the other end, such as deleting a `User` who still owns `Task`s that must each have an owner, the delete raises `CardinalityViolation` and is not made.

Like the errors from assignment and `delete` ([ADR 0023](0023-error-handling.md)), `CardinalityViolation` is raised from the action, so an action whose changes can raise it must list it in its `raises` clause, unless the change is ignored.

### Loading

The entities at the far end of a navigation field are loaded when the field is read, not when the entity that has the field is obtained. Reading a navigation field derives a facet ([ADR 0017](0017-faceted-types.md)), so it can fail, and raises `FacetUnavailable` when it does ([ADR 0023](0023-error-handling.md)). How a program reads facets is left to [ADR 0029](0029-accessing-facets.md).

### Relating an entity to itself

Both ends of a relation can name the same entity, as long as their navigation fields have different names:

```cant
relation User[reports] 0..1 --- 0..* User[manager]
```

Here `user.reports` is a `[User]`, and `user.manager` is a `User?`. As in any relation, each field's type comes from the cardinality at the far end: `reports` gets the `0..*` beside `manager`, and `manager` gets the `0..1` beside `reports`. Writing the ends the other way round, `User[manager] 0..1 --- 0..* User[reports]`, would make `manager` the `[User]` and `reports` the `User?`.

### Entity-typed fields

A model field cannot have an entity type. Entities are linked only by relations, so a field such as `owner: User` in a model is a compile-time error. A model that is not part of an entity, such as one used as a parameter type, cannot hold an entity either.

### `identity`

An entity's `identity` line ([ADR 0010](0010-security.md)) can name a navigation field whose far end has the cardinality `1`, so that an entity can be identified by what it is related to. A navigation field that may be empty or may hold several entities cannot be part of an identity. [ADR 0010](0010-security.md)'s `Membership` is written like this:

```cant
model MembershipRecord
    joined: DATE_TIME

entity Membership
    identity organization, user
    models
        MembershipRecord
    expose
        @all

relation Organization[memberships] 1 --- 0..* Membership[organization]
relation User[memberships] 1 --- 0..* Membership[user]
```

### Exports and keywords

- A relation cannot be exported ([ADR 0006](0006-imports.md)), since nothing refers to it by name. Like triggers and `permissions` declarations, it is a top-level construct that a module cannot export.
- `relation` starts a top-level construct, so it is a keyword reserved everywhere.

Earlier ADRs also apply:

- An entity is a faceted type with two facets, its identifier `@id` and its contents. Two entities are equal when they have the same type and `@id` ([ADR 0017](0017-faceted-types.md), [ADR 0022](0022-entities.md)).
- Each entity type is its own type, so a navigation field of type `User` can only hold a `User` ([ADR 0022](0022-entities.md)).
- `@id` cannot be read in Cant code ([ADR 0024](0024-built-in-values.md)), so a program links entities through navigation fields, never through identifiers.

## Deferred

- **Entities from other modules.** Whether a relation can name an imported entity, such as `accounts::User`, and so add a navigation field to an entity declared in another module, and whether an imported module's relations take effect, as its `permissions` declarations do ([ADR 0006](0006-imports.md)), are to be decided later.

## Consequences

- Relationships are declared in one place, with both ends and both cardinalities, so a reader sees the whole relationship at once, and neither entity's models need to mention it.
- Navigation fields are typed from the cardinality, so a program reading `task.owner` gets a `User` and one reading `user.tasks` gets a `[Task]`, without declaring either.
- Both ends change together, so a relationship is never seen from one end but not the other.
- Cardinality is checked at compile time where the compiler can tell, and always at runtime, so a stored relationship never breaks it. The cost is that many changes to relationships, and many deletes, can raise `CardinalityViolation`, which actions must list or ignore.
- Far ends are loaded when read, so obtaining an entity stays cheap, but each navigation field read can fail with `FacetUnavailable`.
- Model fields cannot hold entities, so relationships are the only way to link entities, and models used outside entities cannot refer to stored records.
- `relation` becomes a keyword reserved everywhere, and the parser needs to support relations.
