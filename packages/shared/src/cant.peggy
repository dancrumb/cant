// Grammar for Cant. `peggy` compiles this into src/generated/parser.js; see ./parse.ts
// for the typed entry point and ./ast.ts for the shape of the tree it builds.
// The language is described in docs/adr; each section below names the ADR it follows.

{{
  import { u } from 'unist-builder';

  // Peggy's locations are unist positions plus a `source` field, which we leave out.
  function toPosition({ start, end }) {
    return {
      start: { line: start.line, column: start.column, offset: start.offset },
      end: { line: end.line, column: end.column, offset: end.offset },
    };
  }

  // A block node spans its statements, not the line breaks and indentation around them.
  function toBlock(statements) {
    return u(
      'block',
      {
        position: {
          start: statements[0].position.start,
          end: statements[statements.length - 1].position.end,
        },
      },
      statements,
    );
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

{
  // The indentation of each enclosing block, innermost last. `Indent` pushes a level and
  // `Dedent` pops it; every rule that uses `Indent` reaches its `Dedent` even when its contents
  // fail to parse, so that backtracking never leaves a stale level on the stack.
  const indents = [0];
  const currentIndent = () => indents[indents.length - 1];
}

Program
  = BlankLines children:DeclarationList? BlankLines _ {
      return u('program', { position: toPosition(location()) }, children ?? []);
    }

// Top-level declarations start in the first column, one after another.
DeclarationList
  = head:Declaration tail:(Newline Samedent @Declaration)* { return [head, ...tail]; }

Declaration
  = Import
  / Namespace
  / Action
  / Trigger

// ----- Namespaces: docs/adr/0005-module-namespaces.md -----

Namespace
  = NamespaceKeyword __ name:Identifier {
      return u('namespace', { name, position: toPosition(location()) });
    }

// ----- Imports: docs/adr/0006-imports.md -----

// `into` and `as` are only special here, so they stay usable as identifiers elsewhere.
Import
  = ImportKeyword __ module:ModuleIdentifier
    namespace:(__ IntoKeyword __ @Identifier)?
    moduleType:(__ AsKeyword __ @ConstantStringLiteral)? {
      return u('import', {
        module,
        ...(namespace && { namespace }),
        ...(moduleType && { moduleType }),
        position: toPosition(location()),
      });
    }

// A URL identifier is a string; a symbolic identifier is `[<scope>::]<name>`.
ModuleIdentifier
  = ConstantStringLiteral
  / scope:(@Identifier "::")? name:Identifier {
      return u('moduleName', { ...(scope && { scope }), name, position: toPosition(location()) });
    }

// ----- Actions: docs/adr/0007-actions.md -----

Action
  = ActionKeyword __ signature:ActionSignature
    Newline Indent body:(Samedent BodyKeyword @Block)? Dedent &{ return body !== null; } {
      return u('action', { ...signature, position: toPosition(location()) }, body);
    }

ActionSignature
  = name:Identifier _ "(" _ parameters:ParameterList? _ ")" _ ":" _ returnType:TypeRef
    nullable:(_ "?")? {
      return { name, parameters: parameters ?? [], returnType, nullable: nullable !== null };
    }

ParameterList
  = head:Parameter tail:(_ "," _ @Parameter)* { return [head, ...tail]; }

Parameter
  = name:Identifier optional:(_ "?")? _ ":" _ valueType:TypeRef defaultValue:DefaultValue? {
      return u('parameter', {
        name,
        optional: optional !== null,
        valueType,
        ...(defaultValue && { defaultValue }),
        position: toPosition(location()),
      });
    }

DefaultValue
  = _ ":=" _ @Value

// Values are not defined by an ADR yet; strings are the only kind so far.
Value
  = StringLiteral

// A built-in type is written as an identifier, so it parses as one.
TypeRef
  = Enum
  / QualifiedIdentifier
  / Identifier

Enum "enum"
  = EnumKeyword _ "(" _ head:ConstantStringLiteral tail:(_ "," _ @ConstantStringLiteral)* _ ")" {
      return u('enum', { values: [head, ...tail], position: toPosition(location()) });
    }

// An indented run of statements, one per line. Returns the statements.
Block
  = Newline Indent first:(Samedent @Statement)? rest:(Newline Samedent @Statement)* Dedent
    &{ return first !== null; } {
      return [first, ...rest];
    }

Statement
  = ReturnStatement
  / BreakStatement
  / ContinueStatement
  / ForStatement
  / WhileStatement
  / IfStatement
  / ExpressionStatement

ExpressionStatement
  = expression:Expression {
      return u('expressionStatement', { expression, position: toPosition(location()) });
    }

ReturnStatement
  = ReturnKeyword __ argument:Expression {
      return u('return', { argument, position: toPosition(location()) });
    }

BreakStatement
  = BreakKeyword { return u('break', { position: toPosition(location()) }); }

ContinueStatement
  = ContinueKeyword { return u('continue', { position: toPosition(location()) }); }

ForStatement
  = ForKeyword __ variable:Identifier __ InKeyword __ iterable:Expression body:Block {
      return u('for', { variable, iterable, position: toPosition(location()) }, body);
    }

WhileStatement
  = WhileKeyword __ test:Expression body:Block {
      return u('while', { test, position: toPosition(location()) }, body);
    }

// The branches are `block` nodes: the consequent first, then the alternate if there is one.
// `else if` makes the alternate another `if` node.
IfStatement
  = IfKeyword __ test:Expression consequent:Block
    alternate:(Newline Samedent ElseKeyword @(__ @IfStatement / Block))? {
      const branches = [toBlock(consequent)];
      if (alternate !== null) {
        branches.push(Array.isArray(alternate) ? toBlock(alternate) : alternate);
      }
      return u('if', { test, position: toPosition(location()) }, branches);
    }

// ----- Triggers -----

Trigger
  = TriggerKeyword __ action:Identifier __ OnKeyword __ event:Identifier {
      return u('trigger', { action, event, position: toPosition(location()) });
    }

// ----- Expressions (not yet described by an ADR) -----

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

// ----- Strings: docs/adr/0008-strings.md -----

StringLiteral "string"
  = '"' parts:(Text / Interpolation)* '"' {
      return u('string', { parts, position: toPosition(location()) });
    }

// A string whose value must be known without evaluating anything, so it cannot interpolate.
ConstantStringLiteral "string without interpolation"
  = '"' text:Text? '"' {
      return u('string', { parts: text ? [text] : [], position: toPosition(location()) });
    }

// A run of characters and escapes, holding the text they stand for.
Text
  = chars:(StringCharacter / EscapeSequence)+ {
      return u('text', { value: chars.join(''), position: toPosition(location()) });
    }

StringCharacter
  = [^"\\$\r\n]
  / "$" !"{" { return '$'; }

EscapeSequence "escape sequence"
  = "\\" @(
      '"'
    / "\\"
    / "$"
    / "n" { return '\n'; }
    / "t" { return '\t'; }
    / "u{" digits:$([0-9A-Fa-f]|1..6|) "}" &{ return parseInt(digits, 16) <= 0x10ffff; } {
        return String.fromCodePoint(parseInt(digits, 16));
      }
    )

Interpolation
  = "${" _ expression:Expression _ "}" {
      return u('interpolation', { expression, position: toPosition(location()) });
    }

// ----- Lexical -----

Identifier "identifier"
  = !Keyword value:$([A-Za-z_] IdentifierPart*) {
      return u('identifier', { value, position: toPosition(location()) });
    }

IdentifierPart
  = [A-Za-z0-9_]

Keyword
  = ImportKeyword
  / NamespaceKeyword
  / ActionKeyword
  / BodyKeyword
  / TriggerKeyword
  / OnKeyword
  / ReturnKeyword
  / BreakKeyword
  / ContinueKeyword
  / ForKeyword
  / InKeyword
  / WhileKeyword
  / IfKeyword
  / ElseKeyword
  / EnumKeyword

ImportKeyword    = "import"    !IdentifierPart
NamespaceKeyword = "namespace" !IdentifierPart
ActionKeyword    = "action"    !IdentifierPart
BodyKeyword      = "body"      !IdentifierPart
TriggerKeyword   = "trigger"   !IdentifierPart
OnKeyword        = "on"        !IdentifierPart
ReturnKeyword    = "return"    !IdentifierPart
BreakKeyword     = "break"     !IdentifierPart
ContinueKeyword  = "continue"  !IdentifierPart
ForKeyword       = "for"       !IdentifierPart
InKeyword        = "in"        !IdentifierPart
WhileKeyword     = "while"     !IdentifierPart
IfKeyword        = "if"        !IdentifierPart
ElseKeyword      = "else"      !IdentifierPart
EnumKeyword      = "enum"      !IdentifierPart

// Contextual keywords: reserved only inside `import`, so not listed in Keyword.
IntoKeyword      = "into"      !IdentifierPart
AsKeyword        = "as"        !IdentifierPart

// ----- Whitespace and indentation -----

// Spaces and tabs within a line.
_  "whitespace" = [ \t]*
__ "whitespace" = [ \t]+

LineBreak
  = "\r\n"
  / "\n"

// The end of a line, after any trailing whitespace.
EndOfLine
  = _ LineBreak

BlankLines
  = EndOfLine*

// One or more line breaks, ending at the start of the next line that has content.
Newline "line break"
  = EndOfLine BlankLines

// Indentation equal to the current block's. Each space or tab counts as one column.
Samedent "indentation"
  = indent:$[ \t]* &{ return indent.length === currentIndent(); }

// Starts a deeper block, without consuming anything: the indentation ahead must be greater
// than the current block's.
Indent
  = &(indent:$[ \t]* &{
      if (indent.length <= currentIndent()) return false;
      indents.push(indent.length);
      return true;
    })

Dedent
  = &{ indents.pop(); return true; }
