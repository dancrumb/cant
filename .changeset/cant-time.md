---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-lsp": minor
"cant-vscode": minor
---

Declare `cant::Time` in Cant (ADR 0026). The compiler ships `stdlib/Time.cant`, with `addDays`, `addMonths`, `addYears`, `format` and `parse`, and the errors `UnknownTimeZone`, `NotWholeNumber` and `InvalidDateTime`, and checks calls to them: arguments of the wrong type, a `style` that isn't `"date"`, `"time"` or `"dateTime"`, and results whose errors are never handled. Hovering over a `cant::Time` action shows its declaration.
