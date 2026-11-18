---
"@dancrumb/cant-shared": minor
---

Parse `relation` declarations, such as `relation User[tasks] 1 --- 0..* Task[owner]`, into `relation` nodes with an entity, navigation field and cardinality at each end. The tokenizer reserves `relation` and recognises cardinalities and `---`.
