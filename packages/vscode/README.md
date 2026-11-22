# Cant for Visual Studio Code

Language support for [Cant](https://github.com/dancrumb/cant).

## Features

In `.cant` files:

- **Problems**: every problem `cant check` finds, as you type, in the file and in the modules it imports.
- **Go to definition** and **find references**, for top-level names across files and for parameters and locals.
- **Hover**: what a name is, and its declaration.
- **Outline**: the file's declarations, with their parameters, fields and enum members.
- **Completion**: keywords, the names the module can see, and locals declared earlier.
- **Highlighting**.
- **Formatting**: **Format Document**, and format on save if you turn on `editor.formatOnSave`, lay the file out as `cant fmt` does. A file with a syntax error is left as it is.

In Markdown, `cant` and `cant-example` code blocks are highlighted.

## Commands

- **Cant: Restart Language Server**: stops the Cant language server and starts it again, for when problems or completions stop updating.

## Requirements

None: the language server is bundled with the extension.
