---
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Run object values and model construction (ADR 0027, ADR 0039). The interpreter evaluates object values, and makes an object value given where a model is expected into an object of that model: it takes the members it is given, then works out each missing field's default in the order the compiler gives, so that a default can use the model's other fields, and orders the members as the model's fields. An optional field with no value is left out, and a required field with no value panics. So a program can pass `{ … }` for a model, such as in a trigger's `arguments`, to `cant run`.
