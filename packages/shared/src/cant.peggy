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

Import
  = ImportKeyword __ module:Identifier {
      return u('import', { module, position: toPosition(location()) });
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
  / Identifier

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

ImportKeyword  = "import"  !IdentifierPart
ActionKeyword  = "action"  !IdentifierPart
TriggerKeyword = "trigger" !IdentifierPart
OnKeyword      = "on"      !IdentifierPart

// Optional and required whitespace.
_  "whitespace" = [ \t\r\n]*
__ "whitespace" = [ \t\r\n]+
