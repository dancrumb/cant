// Grammar for Cant. `peggy` compiles this into src/generated/parser.js; see ./parse.ts
// for the typed entry point and ./ast.ts for the shape of the tree it builds.

{{
  import { u } from 'unist-builder';

  // Peggy's locations are unist positions plus a `source` field, which we leave out.
  function toPosition({ start, end }) {
    return {
      start: { line: start.line, column: start.column, offset: start.offset },
      end: { line: end.line, column: end.column, offset: end.offset },
    };
  }

  // Fold a primary expression and its `.property` / `(args)` suffixes into a tree.
  function applySuffixes(head, suffixes) {
    return suffixes.reduce(
      (object, { suffix, position }) =>
        suffix.kind === 'member'
          ? u('member', {
              object,
              property: suffix.property,
              position: { start: object.position.start, end: position.end },
            })
          : u('call', {
              callee: object,
              arguments: suffix.arguments,
              position: { start: object.position.start, end: position.end },
            }),
      head,
    );
  }
}}

Program
  = _ children:(@Declaration _)* {
      return u('program', { position: toPosition(location()) }, children);
    }

Declaration
  = Import
  / Action
  / Trigger
  / Namespace

// `namespace Greetings`; see docs/adr/0005-module-namespaces.md
Namespace
  = NamespaceKeyword __ name:Identifier {
      return u('namespace', { name, position: toPosition(location()) });
    }

// `import IO into io as "cant"`; see docs/adr/0006-imports.md
// `into` and `as` are only special here, so they stay usable as identifiers elsewhere.
Import
  = ImportKeyword __ module:ModuleIdentifier
    namespace:(__ IntoKeyword __ @Identifier)?
    moduleType:(__ AsKeyword __ @StringLiteral)? {
      return u('import', {
        module,
        ...(namespace && { namespace }),
        ...(moduleType && { moduleType }),
        position: toPosition(location()),
      });
    }

// A URL identifier is a string; a symbolic identifier is `[<scope>::]<name>`.
ModuleIdentifier
  = StringLiteral
  / scope:(@Identifier "::")? name:Identifier {
      return u('moduleName', { ...(scope && { scope }), name, position: toPosition(location()) });
    }

Action
  = ActionKeyword __ name:Identifier _ "(" _ ")" _ ":" _ returnType:Identifier _ body:Block {
      return u('action', { name, returnType, position: toPosition(location()) }, body);
    }

Trigger
  = TriggerKeyword __ action:Identifier __ OnKeyword __ event:Identifier {
      return u('trigger', { action, event, position: toPosition(location()) });
    }

Block
  = "{" _ @(@Statement _)* "}"

Statement
  = ExpressionStatement

ExpressionStatement
  = expression:Expression _ ";" {
      return u('expressionStatement', { expression, position: toPosition(location()) });
    }

// ----- Expressions -----

Expression
  = head:Primary suffixes:(_ @Suffix)* { return applySuffixes(head, suffixes); }

Suffix
  = suffix:(MemberSuffix / CallSuffix) { return { suffix, position: toPosition(location()) }; }

MemberSuffix
  = "." _ property:Identifier { return { kind: 'member', property }; }

CallSuffix
  = "(" _ args:ArgumentList? _ ")" { return { kind: 'call', arguments: args ?? [] }; }

ArgumentList
  = head:Expression tail:(_ "," _ @Expression)* { return [head, ...tail]; }

Primary
  = StringLiteral
  / QualifiedIdentifier
  / Identifier

// `nameSpace::symbolName`
QualifiedIdentifier
  = namespace:Identifier "::" name:Identifier {
      return u('qualifiedIdentifier', { namespace, name, position: toPosition(location()) });
    }

// ----- Lexical -----

StringLiteral "string"
  = '"' value:$[^"\n]* '"' {
      return u('string', { value, position: toPosition(location()) });
    }

Identifier "identifier"
  = !Keyword value:$([A-Za-z_] IdentifierPart*) {
      return u('identifier', { value, position: toPosition(location()) });
    }

IdentifierPart
  = [A-Za-z0-9_]

Keyword
  = ImportKeyword
  / ActionKeyword
  / TriggerKeyword
  / OnKeyword
  / NamespaceKeyword

ImportKeyword     = "import"    !IdentifierPart
ActionKeyword     = "action"    !IdentifierPart
TriggerKeyword    = "trigger"   !IdentifierPart
OnKeyword         = "on"        !IdentifierPart
NamespaceKeyword  = "namespace" !IdentifierPart

// Contextual keywords: reserved only inside `import`, so not listed in Keyword.
IntoKeyword       = "into"      !IdentifierPart
AsKeyword         = "as"        !IdentifierPart

// Optional and required whitespace.
_  "whitespace" = [ \t\r\n]*
__ "whitespace" = [ \t\r\n]+
