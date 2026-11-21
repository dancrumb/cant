---
---

Accept ADR 0031 on module resolution: the `cant` scope is built into the interpreter, other scopes are mapped to directories by a `cant.json` manifest, `<scope>::<Name>` resolves to `Name.cant` there, every module must be a local file, and `as` accepts no module types yet. ADR 0006 is updated to match.
