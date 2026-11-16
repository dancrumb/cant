# 0022. Entities

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Several ADRs rely on **entities**, the records a Cant program stores and works with, but none defines them. [ADR 0010](0010-security.md) defines only the security lines of an entity declaration, and shows `fields` only to give its examples context. The source EBNF that Cant's grammar started from has an `entity` declaration with key-value metadata, `fields`, computed fields and relations between entities, and expressions to create, update, delete and query them.

## Decision

The grammar below uses ISO/IEC 14977 EBNF, following the conventions of [ADR 0007](0007-actions.md).

### Declaring an entity

An entity is declared with the top-level `entity` keyword, followed by the entity's name. Its block lists the models that make up the entity, and which of their fields the entity exposes or hides:

```ebnf
Entity          = EntityKeyword, Identifier, ?indent?, {EntityLine | ?comment?}, ?dedent? ;
EntityLine      = EntitySecurity | EntityModels | Visibility ;
EntityModels    = ModelsKeyword, ?indent?, {(Identifier | QualifiedIdentifier) | ?comment?}, ?dedent? ;
Visibility      = ExposeKeyword, ?indent?, {ExposedField | "@all" | ?comment?}, ?dedent?
                | HideKeyword, ?indent?, {Identifier | "@all" | ?comment?}, ?dedent? ;
ExposedField    = Identifier, [AsKeyword, Identifier] ;
```

```cant
model CustomerRecord
    name: TEXT
    email: TEXT
    passwordHash: TEXT

entity Customer
    models
        CustomerRecord
    expose
        @all
        email as contactEmail
    hide
        passwordHash
```

- **Models.** An entity is an aggregation of models ([ADR 0027](0027-object-shapes.md)). Its `models` block names them. For now, an entity is made of a single model; entities made of several models are deferred.
- **Exposing and hiding fields.** By default, all of the model's fields are hidden, so an entity exposes nothing it does not say it exposes. An `expose` or `hide` block lists fields by name, one per line, and each field listed is exposed or hidden as that block says. To expose every field, an entity lists `@all` in an `expose` block explicitly; `@all` can also be listed in a `hide` block, though there it only states the default. Fields listed by name override `@all`, so an `expose` block picks fields to expose from a hidden default, and a `hide` block picks fields to hide from `@all` in an `expose` block. `@all` is a built-in value ([ADR 0024](0024-built-in-values.md)), written with `@` so that it cannot be confused with a field called `all`, which an entity can still list by name.
- **One of each block.** An entity has at most one `expose` block and at most one `hide` block. A second of either is a compile-time error.
- **No `fields` block.** An entity's fields come from its models. An entity does not declare fields of its own, so it has no `fields` block.
- **Checking the lists.** Listing a field the model does not have, in an `expose` or a `hide` block, is a compile-time error. So is listing the same field, or `@all`, in both an `expose` block and a `hide` block.
- **What hiding means.** A hidden field is not part of the entity's type. Reading or assigning it through the entity, as in `customer.passwordHash`, is a compile-time error, just as for a field the entity does not have ([ADR 0027](0027-object-shapes.md)). The field may also be missing from the entity's value at runtime, so a program cannot rely on finding it, for example with `customer[key]`.
- **Field names.** An exposed field has the same name in the entity as in the model. To give it a different name, an `expose` block writes the model's field name, `as`, and the name the entity uses, as in `email as contactEmail`. The entity's field is then called `contactEmail`, and it holds the model's `email` field. An entity cannot have two fields with the same name, so a new name that clashes with another of the entity's fields is a compile-time error.
- **Renaming with `@all`.** `@all` in an `expose` block exposes each field under its own name. A field that `@all` exposes can also be listed by name in an `expose` block, and then the name on that line is used instead. In the example, `@all` exposes `email`, and `email as contactEmail` renames it, so the entity has a `contactEmail` field and no `email` field.
- **One name per field.** A model field can be exposed only once, under one name. Listing the same field twice in `expose` blocks, under different names, is a compile-time error.
- **Assigning to fields.** An entity's exposed fields can be changed by assignment, just as a model's fields can ([ADR 0027](0027-object-shapes.md)), as in `customer.contactEmail := "ada@example.com"`. The value must be of the field's type. Hidden fields are not part of the entity's type, so they cannot be assigned this way.
- **Deleting fields.** `delete` can be applied to an entity's exposed fields, as it can to a model's ([ADR 0027](0027-object-shapes.md)): it clears an optional field, or resets it to its default, and applying it to a required field is an error. Like an assignment, this changes the entity value the program holds, and is only stored when the entity is saved.
- **Saving changes.** Assigning to an entity's field changes the entity value the program holds, but does not store the change. A change is only stored when the program saves the entity with an explicit keyword, one of the keywords for creating, updating and deleting entities (see Deferred). Changes that are never saved are lost when the action ends, including when it fails before saving them.
- **`@id`.** Every entity has an `@id`, its identifier facet ([ADR 0017](0017-faceted-types.md)). The interpreter provides it: it gives each entity an `@id` when the entity is stored, and the program never sets it. Models have no ID of their own ([ADR 0027](0027-object-shapes.md)), so an entity's `@id` does not come from its model, and an entity declaration does not define it. An `@id` has a type of its own, `EntityId`, rather than `TEXT` or `NUMBER`. Like `Optional<T>` ([ADR 0014](0014-optionals.md)) and `Collection<T>` ([ADR 0021](0021-collections.md)), `EntityId` is an internal type: the compiler uses it, but a program cannot write it, so no parameter, field or return type can be declared as one. Under the covers, an `EntityId` is a `TEXT`, and a program cannot read it ([ADR 0024](0024-built-in-values.md)).
- **`identity`.** An entity's `identity` line ([ADR 0010](0010-security.md)) names fields of its model, by their names in the model, not by the names they are exposed under. Since it refers to the model, it can name a field that the entity hides.
- **Storage.** The interpreter stores entities. Where they are kept, and how, is up to the interpreter, not the program, as it is for files ([ADR 0015](0015-files.md)).
- **No metadata lines.** The source EBNF allows key-value metadata lines in an entity. Cant leaves them out: an entity's block holds only its security lines, its `models` block, and its `expose` and `hide` blocks.
- **Keywords.** `models`, `expose` and `hide` are only special inside an entity's block, like the security lines `subject`, `identity`, `group` and `role` ([ADR 0010](0010-security.md)), and stay usable as names elsewhere. So is `as` in an `expose` block, as it is in an import ([ADR 0006](0006-imports.md)). `@all` is a built-in value, and `entity` is reserved everywhere.
- **Security lines.** The `subject`, `identity`, `group` and `role` lines of [ADR 0010](0010-security.md) still go in an entity's block. `entity` starts a top-level declaration and is reserved everywhere ([ADR 0010](0010-security.md)).

Earlier ADRs already fix these:

- An entity is a faceted type with exactly two facets: its identifier, `@id`, and its contents ([ADR 0017](0017-faceted-types.md)).
- Each entity type is its own type: a `User` can only be used where a `User` is expected, and two entities are equal when they have the same type and `@id` ([ADR 0017](0017-faceted-types.md)). An entity's name is a type name, unique among the type names in its namespace ([ADR 0027](0027-object-shapes.md)).
- Entities convert to text as their `@id` ([ADR 0011](0011-converting-values-to-text.md)).

## Deferred

- **Membership and roles.** How subjects become members of groups, and how roles are assigned, is left to [ADR 0032](0032-authentication.md).
- **Creating, updating and deleting entities.** Entities will be created, updated and deleted with Cant keywords that are not specified yet. That includes how a program gives a hidden field a value, such as a password hash, and whether an object of the entity's model can be used to create or update an entity. `delete` is not one of them for now: it removes collection members ([ADR 0021](0021-collections.md)) and clears optional fields of models and entities ([ADR 0027](0027-object-shapes.md)), but does not delete a stored entity.
- **Querying entities.** Finding entities, by `@id`, by `identity` fields or by other conditions, and paging and ordering the results, will also be done with Cant keywords that are not specified yet.
- **Relationships.** How one entity refers to another, and how one-to-many and many-to-many relationships are declared, are left to [ADR 0035](0035-entity-relationships.md).
- **Entities made of several models.** How an entity aggregates more than one model, and how fields with the same name in different models are told apart, is left for later.

## Consequences

- An entity is declared from a model, so the fields and types that models already have, including optional fields, defaults and mutability, work the same way for entities.
- Fields are hidden unless the entity exposes them, so a field such as a password hash is not part of the entity's type unless the program chooses to make it so. The cost is that every entity has to list what it exposes, at least with `@all`.
- An entity can rename a model's fields, so the same model can be stored under names that suit the entity, and the compiler checks that the names it lists exist and do not clash.
- Changing an entity's fields by assignment does not store the change. A program has to save the entity explicitly, so it decides when changes are stored, but a forgotten save loses them.
- Storage and `@id` are the interpreter's responsibility, so programs do not choose identifiers or storage, and `@id` stays an internal type until [ADR 0024](0024-built-in-values.md) says how a program can use it.
- Entities made of several models, relations, and the keywords for creating, updating, deleting, saving and querying entities are still to come, so programs cannot yet create or find entities.
- `entity`, `models`, `expose` and `hide` need parser support, and the examples in [ADR 0010](0010-security.md) now declare a model for each entity.
