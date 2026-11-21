// Grammar for Cant. `peggy` compiles this into src/generated/parser.js; see ./parse.ts
// for the typed entry point and ./ast.ts for the shape of the tree it builds.
// The language is described in docs/adr; each section below names the ADR it follows.
//
// The parser checks syntax only. Rules that need types or names, such as which errors an
// action may raise, are left to later passes.

{{
  import { u } from 'unist-builder';

  // Peggy's locations are unist positions plus a `source` field, which we leave out.
  function toPosition({ start, end }) {
    return {
      start: { line: start.line, column: start.column, offset: start.offset },
      end: { line: end.line, column: end.column, offset: end.offset },
    };
  }

  // The position from the start of one node to the end of another.
  function span(first, last) {
    return { start: first.position.start, end: last.position.end };
  }

  // A block node spans its statements, not the line breaks and indentation around them.
  function toBlock(statements) {
    return u('block', { position: span(statements[0], statements.at(-1)) }, statements);
  }

  // Fold a primary expression and its `.member`, `(arguments)` and `[index]` suffixes into a tree.
  function applySuffixes(head, suffixes) {
    return suffixes.reduce((object, { suffix, position }) => {
      const spanned = { start: object.position.start, end: position.end };
      if (suffix.kind === 'member') {
        return u('member', { object, property: suffix.property, position: spanned });
      }
      if (suffix.kind === 'index') {
        return u('index', { object, index: suffix.index, position: spanned });
      }
      return u('call', { callee: object, arguments: suffix.arguments, position: spanned });
    }, head);
  }

  // Fold `head op right op right ...` into left-associative binary expressions.
  function leftAssociative(head, tail) {
    return tail.reduce(
      (left, [operator, right]) =>
        u('binary', { operator, left, right, position: span(left, right) }),
      head,
    );
  }

  // A `DATE_TIME` literal's string: an ISO 8601 date and time with a `Z` or an offset
  // (docs/adr/0026-dates-and-times.md).
  const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  // Whether a `DATE_TIME` literal's string names a real instant.
  function isDateTime(text) {
    const match = DATE_TIME.exec(text);
    if (match === null) return false;
    // Unmatched groups are `undefined`, so they take these defaults.
    const [year, month, day, hour, minute, second = '0', offsetHours = '0', offsetMinutes = '0'] = match.slice(1);
    const daysInMonth = [31, isLeapYear(Number(year)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (
      Number(month) >= 1 && Number(month) <= 12 &&
      Number(day) >= 1 && Number(day) <= daysInMonth[Number(month) - 1] &&
      Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 &&
      Number(offsetHours) <= 23 && Number(offsetMinutes) <= 59
    );
  }

  // A `DURATION` literal's string: days, then optionally `T` and hours, minutes and seconds,
  // with at least one part (docs/adr/0026-dates-and-times.md).
  const DURATION = /^P(?=\d|T\d)(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d{1,3})?S)?)?$/;

  // The text of a string literal with no interpolations.
  const textOf = (literal) => literal.parts.map((part) => part.value).join('');

  const ASSIGNABLE = new Set(['identifier', 'member', 'index']);
  const MEMBER_OR_INDEX = new Set(['member', 'index']);
}}

{
  // The indentation of each enclosing block, innermost last. `Indent` pushes a level and
  // `Dedent` pops it; every rule that uses `Indent` reaches its `Dedent` even when its contents
  // fail to parse, so that backtracking never leaves a stale level on the stack.
  const indents = [0];
  const currentIndent = () => indents[indents.length - 1];
}

// ----- Programs: docs/adr/0006-imports.md -----

Program
  = BlankLines children:TopLevelList? BlankLines _ Comment? {
      return u('program', { position: toPosition(location()) }, children ?? []);
    }

// Top-level constructs start in the first column, one after another.
TopLevelList
  = head:TopLevel tail:(Newline Samedent @TopLevel)* { return [head, ...tail]; }

TopLevel
  = Import
  / Namespace
  / Trigger
  / Permissions
  / Relation
  / ExportableDeclaration
  / ReExport

// Triggers, `permissions` declarations and relations cannot be exported.
ExportableDeclaration
  = exported:(@ExportKeyword __)?
    declaration:(Action / EnumDeclaration / ModelDeclaration / Entity / ErrorDeclaration / ConstDeclaration) {
      return exported === null
        ? declaration
        : { ...declaration, exported: true, position: toPosition(location()) };
    }

// `export accounts::FindUser`, optionally `as LookupUser`: export a symbol the module imports
// (docs/adr/0006-imports.md).
ReExport
  = ExportKeyword __ name:Name alias:(__ AsKeyword __ @Identifier)? {
      return u('reExport', { name, ...(alias && { alias }), position: toPosition(location()) });
    }

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

// The action's statements follow `body`, or `native` names the module that implements it
// (docs/adr/0036-native-modules.md).
Action
  = ActionKeyword __ signature:ActionSignature
    Newline Indent implementation:(Samedent @ActionImplementation)? Dedent
    &{ return implementation !== null; } {
      return u(
        'action',
        { ...signature, ...(implementation.native && { native: implementation.native }), position: toPosition(location()) },
        implementation.body ?? [],
      );
    }

ActionImplementation
  = BodyKeyword body:Block { return { body }; }
  / NativeKeyword __ native:ConstantStringLiteral { return { native }; }

// `VOID?` is a syntax error (docs/adr/0014-optionals.md).
ActionSignature
  = name:Identifier _ "(" _ parameters:ParameterList? _ ")" _ ":" _ returnType:ReturnType
    optional:(_ @"?")? &{ return !(returnType.type === 'voidType' && optional !== null); }
    clauses:ErrorClauses? {
      return {
        name,
        parameters: parameters ?? [],
        returnType,
        optional: optional !== null,
        raises: clauses?.raises ?? [],
        passes: clauses?.passes ?? [],
      };
    }

ReturnType
  = VoidType
  / TypeRef

ParameterList
  = head:Parameter tail:(_ "," _ @Parameter)* { return [head, ...tail]; }

Parameter
  = name:Identifier optional:(_ "?")? _ ":" !"=" _ valueType:TypeRef defaultValue:DefaultValue? {
      return u('parameter', {
        name,
        optional: optional !== null,
        valueType,
        ...(defaultValue && { defaultValue }),
        position: toPosition(location()),
      });
    }

DefaultValue
  = _ ":=" _ @Expression

// `raises` and `passes`, in either order, each at most once (docs/adr/0023-error-handling.md).
ErrorClauses
  = __ first:ErrorClause second:(__ @ErrorClause)?
    &{ return second === null || second.kind !== first.kind; } {
      const clauses = { raises: [], passes: [] };
      for (const clause of [first, second]) if (clause) clauses[clause.kind] = clause.names;
      return clauses;
    }

ErrorClause
  = RaisesKeyword __ names:NameList { return { kind: 'raises', names }; }
  / PassesKeyword __ names:PassedErrorList { return { kind: 'passes', names }; }

NameList
  = head:Name tail:(_ "," _ @Name)* { return [head, ...tail]; }

PassedErrorList
  = head:PassedError tail:(_ "," _ @PassedError)* { return [head, ...tail]; }

PassedError
  = AllBuiltIn
  / Name

// ----- Types: docs/adr/0007-actions.md, docs/adr/0012-base-types.md, docs/adr/0021-collections.md -----

TypeRef
  = BaseType
  / UnknownType
  / SetType
  / Enum
  / ArrayType
  / MapType
  / Name

BaseType "type"
  = name:$("TEXT" / "NUMBER" / "BOOLEAN" / "DATE_TIME" / "DURATION" / "FILE") !IdentifierPart {
      return u('baseType', { name, position: toPosition(location()) });
    }

VoidType
  = VoidKeyword { return u('voidType', { position: toPosition(location()) }); }

UnknownType
  = UnknownKeyword { return u('unknownType', { position: toPosition(location()) }); }

ArrayType
  = "[" _ elementType:TypeRef _ "]" {
      return u('arrayType', { elementType, position: toPosition(location()) });
    }

MapType
  = "{" _ valueType:TypeRef _ "}" {
      return u('mapType', { valueType, position: toPosition(location()) });
    }

SetType
  = SetKeyword _ "(" _ elementType:TypeRef _ ")" {
      return u('setType', { elementType, position: toPosition(location()) });
    }

// An inline enum (docs/adr/0013-enums.md).
Enum "enum"
  = EnumKeyword _ "(" _ head:ConstantValue tail:(_ "," _ @ConstantValue)* _ ")" {
      return u('enum', { values: [head, ...tail], position: toPosition(location()) });
    }

ConstantValue
  = ConstantStringLiteral
  / NumberLiteral
  / BooleanLiteral
  / DateTimeLiteral
  / DurationLiteral

Name
  = QualifiedIdentifier
  / Identifier

// ----- Statements: docs/adr/0007-actions.md -----

// An indented run of statements, one per line. Returns the statements. A block can hold
// only comments, as in `// ...`, and then it has no statements.
Block
  = Newline Indent first:(Samedent @Statement)? rest:(Newline Samedent @Statement)* Dedent
    &{ return first !== null; } {
      return [first, ...rest];
    }
  / CommentBlock

// Lines that are blank or hold only a comment, at least one of them a comment indented
// further than the enclosing block. It stops before the line break that ends its last line.
CommentBlock
  = _ Comment? lines:(LineBreak @CommentOnlyLine)+ &{ return lines.some(Boolean); } {
      return [];
    }

// Whether the line holds a comment indented further than the enclosing block.
CommentOnlyLine
  = indent:$[ \t]* comment:Comment? &(LineBreak / !.) {
      return comment !== null && indent.length > currentIndent();
    }

// A branch of an `if`, as a `block` node.
Branch
  = statements:Block {
      return statements.length > 0
        ? toBlock(statements)
        : u('block', { position: toPosition(location()) }, []);
    }

Statement
  = ReturnStatement
  / RaiseStatement
  / PassStatement
  / AssertStatement
  / BreakStatement
  / ContinueStatement
  / ForStatement
  / WhileStatement
  / IfStatement
  / DeleteStatement
  / IgnoredStatement
  / AssignmentStatement
  / ExpressionStatement

ExpressionStatement
  = expression:Expression {
      return u('expressionStatement', { expression, position: toPosition(location()) });
    }

// The target is an identifier, or ends in a member or an index.
AssignmentStatement
  = target:Postfix &{ return ASSIGNABLE.has(target.type); } _ ":=" _ value:Expression {
      return u('assignment', { target, value, position: toPosition(location()) });
    }

DeleteStatement
  = DeleteKeyword __ target:Postfix &{ return MEMBER_OR_INDEX.has(target.type); } {
      return u('delete', { target, position: toPosition(location()) });
    }

// `ignore` before an assignment or a `delete` (docs/adr/0023-error-handling.md). Before
// anything else, `ignore` is the prefix operator in an expression statement.
IgnoredStatement
  = IgnoreKeyword __ statement:(DeleteStatement / AssignmentStatement) {
      return u('ignoredStatement', { statement, position: toPosition(location()) });
    }

// A bare `return` is for actions that return `VOID`; `NOTHING` can only be written here.
ReturnStatement
  = ReturnKeyword argument:(__ @(Nothing / Expression))? {
      return u('return', { ...(argument && { argument }), position: toPosition(location()) });
    }

RaiseStatement
  = RaiseKeyword __ error:Name
    data:(
      _ "(" _ args:ArgumentList? _ ")" { return { arguments: args ?? [] }; }
      / __ WithKeyword __ value:Expression { return { data: value }; }
    )? {
      return u('raise', { error, ...data, position: toPosition(location()) });
    }

PassStatement
  = PassKeyword __ argument:Expression {
      return u('pass', { argument, position: toPosition(location()) });
    }

AssertStatement
  = AssertKeyword __ test:Expression message:(_ "," _ @Expression)? {
      return u('assert', { test, ...(message && { message }), position: toPosition(location()) });
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
  = IfKeyword __ test:Expression consequent:Branch
    alternate:(Newline Samedent ElseKeyword @(__ @IfStatement / Branch))? {
      return u('if', { test, position: toPosition(location()) }, alternate === null ? [consequent] : [consequent, alternate]);
    }

// ----- Triggers: docs/adr/0009-triggers.md, docs/adr/0025-trigger-sources.md -----

Trigger
  = TriggerKeyword __ action:Name __ OnKeyword __ source:Identifier
    settings:(
      Newline Indent first:(Samedent @TriggerSetting)? rest:(Newline Samedent @TriggerSetting)* Dedent
      &{ return first !== null; } { return [first, ...rest]; }
    )? {
      const fields = {};
      for (const { kind, value } of settings ?? []) {
        if (kind in fields) error(`A trigger can only have one \`${kind}\` block.`);
        fields[kind] = value;
      }
      return u('trigger', { action, source, ...fields, position: toPosition(location()) });
    }

TriggerSetting
  = AuthKeyword Newline Indent rule:(Samedent @Expression)? Dedent &{ return rule !== null; } {
      return { kind: 'auth', value: rule };
    }
  / ArgumentsKeyword value:NamedValueBlock { return { kind: 'arguments', value }; }
  / ParametersKeyword value:NamedValueBlock { return { kind: 'parameters', value }; }
  / AssertionsKeyword value:AssertionBlock { return { kind: 'assertions', value }; }

// A `TestCase` trigger's assertions, each a condition and a message
// (docs/adr/0037-test-case-trigger-source.md). That only a `TestCase` trigger can have them is
// left to later passes.
AssertionBlock
  = Newline Indent first:(Samedent @Assertion)? rest:(Newline Samedent @Assertion)* Dedent
    &{ return first !== null; } {
      return [first, ...rest];
    }

Assertion
  = test:Expression _ "," _ message:Expression {
      return u('assertion', { test, message, position: toPosition(location()) });
    }

NamedValueBlock
  = Newline Indent first:(Samedent @NamedValue)? rest:(Newline Samedent @NamedValue)* Dedent
    &{ return first !== null; } {
      return [first, ...rest];
    }

NamedValue
  = name:Identifier _ ":=" _ value:Expression {
      return u('namedValue', { name, value, position: toPosition(location()) });
    }

// ----- Permissions: docs/adr/0010-security.md -----

Permissions
  = PermissionsKeyword __ group:Identifier role:(__ HasKeyword __ @Identifier)?
    permissions:(
      Newline Indent first:(Samedent @ConstantStringLiteral)?
      rest:(Newline Samedent @ConstantStringLiteral)* Dedent
      &{ return first !== null; } { return [first, ...rest]; }
    )? {
      return u('permissions', {
        group,
        ...(role && { role }),
        permissions: permissions ?? [],
        position: toPosition(location()),
      });
    }

// ----- Relations: docs/adr/0035-entity-relationships.md -----

// `relation User[tasks] 1 --- 0..* Task[owner]`
Relation
  = RelationKeyword __ left:RelationEnd __ leftCardinality:Cardinality __ "---"
    __ rightCardinality:Cardinality __ right:RelationEnd {
      return u('relation', {
        left: { ...left, cardinality: leftCardinality },
        right: { ...right, cardinality: rightCardinality },
        position: toPosition(location()),
      });
    }

RelationEnd
  = entity:Name _ "[" _ field:Identifier _ "]" { return { entity, field }; }

Cardinality
  = value:$("0..1" / "0..*" / "1..*" / "1") !IdentifierPart { return value; }

// ----- Enums: docs/adr/0013-enums.md -----

// An enum has at least one member.
EnumDeclaration
  = EnumKeyword __ name:Identifier
    Newline Indent first:(Samedent @EnumMember)? rest:(Newline Samedent @EnumMember)* Dedent
    &{ return first !== null; } {
      return u('enumDeclaration', { name, members: [first, ...rest], position: toPosition(location()) });
    }

EnumMember
  = name:Identifier value:(_ ":=" _ @ConstantValue)? {
      return u('enumMember', { name, ...(value && { value }), position: toPosition(location()) });
    }

// ----- Models: docs/adr/0027-object-shapes.md -----

ModelDeclaration
  = ModelKeyword __ name:Identifier fields:FieldBlock? {
      return u('model', { name, fields: fields ?? [], position: toPosition(location()) });
    }

FieldBlock
  = Newline Indent first:(Samedent @Field)? rest:(Newline Samedent @Field)* Dedent
    &{ return first !== null; } {
      return [first, ...rest];
    }

Field
  = name:Identifier optional:(_ "?")? _ ":" !"=" _ valueType:TypeRef defaultValue:DefaultValue? {
      return u('field', {
        name,
        optional: optional !== null,
        valueType,
        ...(defaultValue && { defaultValue }),
        position: toPosition(location()),
      });
    }

// ----- Entities: docs/adr/0022-entities.md, docs/adr/0010-security.md -----

Entity
  = EntityKeyword __ name:Identifier
    lines:(
      Newline Indent first:(Samedent @EntityLine)? rest:(Newline Samedent @EntityLine)* Dedent
      &{ return first !== null; } { return [first, ...rest]; }
    )? {
      return u('entity', { name, lines: lines ?? [], position: toPosition(location()) });
    }

EntityLine
  = SubjectLine
  / IdentityLine
  / GroupLine
  / RoleLine
  / MembershipLine
  / ModelsBlock
  / ExposeBlock
  / HideBlock

SubjectLine
  = "subject" !IdentifierPart { return u('subjectLine', { position: toPosition(location()) }); }

IdentityLine
  = "identity" !IdentifierPart __ head:Identifier tail:(_ "," _ @Identifier)* {
      return u('identityLine', { fields: [head, ...tail], position: toPosition(location()) });
    }

GroupLine
  = "group" !IdentifierPart __ name:Identifier {
      return u('groupLine', { name, position: toPosition(location()) });
    }

RoleLine
  = "role" !IdentifierPart __ name:Identifier {
      return u('roleLine', { name, position: toPosition(location()) });
    }

// `membership user in organization with roles` (docs/adr/0032-authentication.md).
MembershipLine
  = "membership" !IdentifierPart __ member:Identifier __ InKeyword __ group:Identifier
    roles:(__ WithKeyword __ @Identifier)? {
      return u('membershipLine', { member, group, ...(roles && { roles }), position: toPosition(location()) });
    }

ModelsBlock
  = "models" !IdentifierPart
    Newline Indent first:(Samedent @Name)? rest:(Newline Samedent @Name)* Dedent
    &{ return first !== null; } {
      return u('modelsBlock', { models: [first, ...rest], position: toPosition(location()) });
    }

ExposeBlock
  = "expose" !IdentifierPart
    Newline Indent first:(Samedent @ExposeItem)? rest:(Newline Samedent @ExposeItem)* Dedent
    &{ return first !== null; } {
      return u('exposeBlock', { items: [first, ...rest], position: toPosition(location()) });
    }

ExposeItem
  = AllBuiltIn
  / field:Identifier as:(__ AsKeyword __ @Identifier)? {
      return u('exposedField', { field, ...(as && { as }), position: toPosition(location()) });
    }

HideBlock
  = "hide" !IdentifierPart
    Newline Indent first:(Samedent @HideItem)? rest:(Newline Samedent @HideItem)* Dedent
    &{ return first !== null; } {
      return u('hideBlock', { items: [first, ...rest], position: toPosition(location()) });
    }

HideItem
  = AllBuiltIn
  / Identifier

// ----- Errors: docs/adr/0023-error-handling.md -----

ErrorDeclaration
  = ErrorKeyword __ name:Identifier
    data:(Newline Indent item:(Samedent @ErrorData)? Dedent &{ return item !== null; } { return item; })? {
      return u('errorDeclaration', { name, ...(data && { data }), position: toPosition(location()) });
    }

// A named `data` model on the same line, or an anonymous one as an indented block of fields.
ErrorData
  = DataKeyword __ @Name
  / DataKeyword @FieldBlock

// ----- Constants: docs/adr/0034-top-level-constants.md -----

ConstDeclaration
  = ConstKeyword __ name:Identifier valueType:(_ ":" !"=" _ @TypeRef)? _ ":=" _ value:Expression {
      return u('const', { name, ...(valueType && { valueType }), value, position: toPosition(location()) });
    }

// ----- Expressions: docs/adr/0019-operators.md -----

// One rule per level of precedence, from the loosest to the tightest.
Expression
  = OrExpression

OrExpression
  = head:AndExpression tail:(_ OrKeyword _ right:AndExpression { return ['or', right]; })* {
      return leftAssociative(head, tail);
    }

AndExpression
  = head:Comparison tail:(_ AndKeyword _ right:Comparison { return ['and', right]; })* {
      return leftAssociative(head, tail);
    }

// Comparisons have at most one operator, so they are not associative.
Comparison
  = AuthPredicate
  / value:Additive _ InstanceOfKeyword _ target:InstanceOfType {
      return u('instanceOf', { value, ...target, position: toPosition(location()) });
    }
  / head:Additive tail:(_ @ComparisonOperator _ @Additive)? {
      return tail === null ? head : leftAssociative(head, [tail]);
    }

// `instanceOf` takes a type, optionally marked `?`, or `ERROR`.
InstanceOfType
  = ErrorTypeKeyword {
      return { target: u('errorType', { position: toPosition(location()) }), optional: false };
    }
  / target:TypeRef optional:(_ "?")? { return { target, optional: optional !== null }; }

ComparisonOperator
  = $("==" / "!=" / "<=" / ">=" / "<" / ">")
  / InKeyword { return 'in'; }

Additive
  = head:Multiplicative tail:(_ @$("+" / "-") _ @Multiplicative)* {
      return leftAssociative(head, tail);
    }

// `//` starts a comment, so it is never two `/` operators.
Multiplicative
  = head:Power tail:(_ @$("*" !"*" / "/" !"/" / "%") _ @Power)* {
      return leftAssociative(head, tail);
    }

// `**` is right-associative, and its operands are prefix expressions, so `-2 ** 2` is `(-2) ** 2`.
Power
  = base:Prefix exponent:(_ "**" _ @Power)? {
      return exponent === null ? base : leftAssociative(base, [['**', exponent]]);
    }

Prefix
  = operator:PrefixOperator _ argument:Prefix {
      return u('unary', { operator, argument, position: toPosition(location()) });
    }
  / Fallback

PrefixOperator
  = IsEmptyKeyword { return 'isEmpty'; }
  / IgnoreKeyword { return 'ignore'; }
  / "!" !"=" { return '!'; }
  / "-" { return '-'; }

// `orElse` binds more tightly than the prefix operators. Its right operand can be negated.
Fallback
  = head:Postfix tail:(_ OrElseKeyword _ right:FallbackOperand { return ['orElse', right]; })* {
      return leftAssociative(head, tail);
    }

FallbackOperand
  = "-" _ argument:Postfix {
      return u('unary', { operator: '-', argument, position: toPosition(location()) });
    }
  / Postfix

Postfix
  = head:Primary suffixes:(_ @Suffix)* { return applySuffixes(head, suffixes); }

Suffix
  = suffix:(MemberSuffix / CallSuffix / IndexSuffix) {
      return { suffix, position: toPosition(location()) };
    }

// A member's name can be a keyword, as in `request.body`.
MemberSuffix
  = "." _ property:MemberName { return { kind: 'member', property }; }

CallSuffix
  = "(" _ args:ArgumentList? _ ")" { return { kind: 'call', arguments: args ?? [] }; }

IndexSuffix
  = "[" _ index:Expression _ "]" { return { kind: 'index', index }; }

// Arguments are named, except in the short forms of docs/adr/0020-action-parameters.md.
ArgumentList
  = head:Argument tail:(_ "," _ @Argument)* { return [head, ...tail]; }

Argument
  = name:Identifier _ ":=" _ value:Expression {
      return u('argument', { name, value, position: toPosition(location()) });
    }
  / value:Expression {
      return u('argument', { value, position: toPosition(location()) });
    }

Primary
  = NumberLiteral
  / BooleanLiteral
  / StringLiteral
  / DateTimeLiteral
  / DurationLiteral
  / BuiltIn
  / ArrayValue
  / ObjectValue
  / SetValue
  / "(" _ @Expression _ ")"
  / QualifiedIdentifier
  / Identifier

// `nameSpace::symbolName`
QualifiedIdentifier
  = namespace:Identifier "::" name:Identifier {
      return u('qualifiedIdentifier', { namespace, name, position: toPosition(location()) });
    }

Nothing
  = NothingKeyword { return u('nothing', { position: toPosition(location()) }); }

// ----- Security predicates: docs/adr/0010-security.md -----

AuthPredicate
  = subject:SubjectBuiltIn __ CanKeyword __ permission:ConstantStringLiteral
    group:(__ WithinKeyword __ @Group)? {
      return u('canPredicate', {
        subject,
        permission,
        ...(group && { group }),
        position: toPosition(location()),
      });
    }
  / subject:SubjectBuiltIn __ IsKeyword __ role:Identifier __ WithinKeyword __ group:Group {
      return u('rolePredicate', { subject, role, group, position: toPosition(location()) });
    }
  / subject:SubjectBuiltIn __ IsKeyword __ subjectType:(BuiltIn / Identifier) {
      return u('isPredicate', { subject, subjectType, position: toPosition(location()) });
    }

// The group named by `within`: a name, member or call, binding more tightly than any operator.
Group
  = Postfix

SubjectBuiltIn
  = "@subject" !IdentifierPart { return u('builtIn', { name: 'subject', position: toPosition(location()) }); }

// ----- Built-in values: docs/adr/0009-triggers.md -----

BuiltIn "built-in value"
  = "@" name:$([A-Za-z_] IdentifierPart*) {
      return u('builtIn', { name, position: toPosition(location()) });
    }

AllBuiltIn
  = "@all" !IdentifierPart { return u('builtIn', { name: 'all', position: toPosition(location()) }); }

// ----- Collections: docs/adr/0021-collections.md -----

// Inside brackets, braces and a set's parentheses, layout is free: line breaks, indentation
// and comments do not open or close blocks.
ArrayValue
  = "[" Layout elements:ExpressionItems? Layout "]" {
      return u('array', { elements: elements ?? [], position: toPosition(location()) });
    }

SetValue
  = SetKeyword _ "(" Layout elements:ExpressionItems? Layout ")" {
      return u('set', { elements: elements ?? [], position: toPosition(location()) });
    }

ExpressionItems
  = head:Expression tail:(Layout "," Layout @Expression)* (Layout ",")? { return [head, ...tail]; }

ObjectValue
  = "{" Layout items:ObjectItems? Layout "}" {
      return u('object', { items: items ?? [], position: toPosition(location()) });
    }

ObjectItems
  = head:ObjectItem tail:(Layout "," Layout @ObjectItem)* (Layout ",")? { return [head, ...tail]; }

// A member's name can be an identifier, a keyword such as `body`, or a string. It can also be a
// built-in name, as `@entity` is in a test case's `subject`; which built-in names are allowed
// where is left to later passes (docs/adr/0021-collections.md, docs/adr/0037-test-case-trigger-source.md).
ObjectItem
  = name:(MemberName / StringLiteral / BuiltIn) _ ":=" _ value:Expression {
      return u('objectItem', { name, value, position: toPosition(location()) });
    }

Layout
  = ([ \t] / LineBreak / Comment)*

// ----- Numbers and booleans: docs/adr/0019-operators.md -----

NumberLiteral "number"
  = raw:$(HexLiteral / OctalLiteral / BinaryLiteral / DecimalLiteral) !IdentifierPart {
      return u('number', { value: Number(raw.replaceAll('_', '')), position: toPosition(location()) });
    }

DecimalLiteral
  = (DecimalInteger ("." Digits?)? / "." Digits) Exponent?

// A decimal literal cannot start with `0` followed by another digit.
DecimalInteger
  = "0" ![0-9_]
  / [1-9] ("_"? Digits)?

Digits
  = [0-9] ("_"? [0-9])*

Exponent
  = [eE] [+-]? Digits

HexLiteral
  = "0" [xX] [0-9A-Fa-f] ("_"? [0-9A-Fa-f])*

OctalLiteral
  = "0" [oO] [0-7] ("_"? [0-7])*

BinaryLiteral
  = "0" [bB] [01] ("_"? [01])*

BooleanLiteral
  = TrueKeyword { return u('boolean', { value: true, position: toPosition(location()) }); }
  / FalseKeyword { return u('boolean', { value: false, position: toPosition(location()) }); }

// ----- Dates and times: docs/adr/0026-dates-and-times.md -----

// `DATE_TIME("2026-11-21T09:30:00Z")`, which must name a real instant with a `Z` or an offset.
DateTimeLiteral "date and time"
  = DateTimeKeyword _ "(" _ literal:ConstantStringLiteral _ ")" {
      const value = textOf(literal);
      if (!isDateTime(value)) {
        error(`"${value}" is not a valid DATE_TIME: write an ISO 8601 date and time ending in Z or an offset, such as "2026-11-21T09:30:00Z".`);
      }
      return u('dateTime', { value, position: toPosition(location()) });
    }

// `DURATION("PT1H30M")`, in days, hours, minutes and seconds.
DurationLiteral "duration"
  = DurationKeyword _ "(" _ literal:ConstantStringLiteral _ ")" {
      const value = textOf(literal);
      if (!DURATION.test(value)) {
        error(`"${value}" is not a valid DURATION: write an ISO 8601 duration in days, hours, minutes and seconds, such as "PT1H30M".`);
      }
      return u('duration', { value, position: toPosition(location()) });
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

// A name after `.`, or in an object value, which can be a keyword.
MemberName "name"
  = value:$([A-Za-z_] IdentifierPart*) {
      return u('identifier', { value, position: toPosition(location()) });
    }

IdentifierPart
  = [A-Za-z0-9_]

// Words reserved everywhere, so they cannot be identifiers.
Keyword
  = ImportKeyword
  / NamespaceKeyword
  / ExportKeyword
  / ActionKeyword
  / BodyKeyword
  / ReturnKeyword
  / BreakKeyword
  / ContinueKeyword
  / ForKeyword
  / InKeyword
  / WhileKeyword
  / IfKeyword
  / ElseKeyword
  / TriggerKeyword
  / OnKeyword
  / EntityKeyword
  / PermissionsKeyword
  / BaseType
  / VoidKeyword
  / NothingKeyword
  / TrueKeyword
  / FalseKeyword
  / EnumKeyword
  / SetKeyword
  / DeleteKeyword
  / ErrorKeyword
  / ErrorTypeKeyword
  / RaiseKeyword
  / PassKeyword
  / AssertKeyword
  / ModelKeyword
  / UnknownKeyword
  / ConstKeyword
  / RelationKeyword
  / AndKeyword
  / OrKeyword
  / OrElseKeyword
  / IsEmptyKeyword
  / InstanceOfKeyword
  / IgnoreKeyword

ImportKeyword      = "import"      !IdentifierPart
NamespaceKeyword   = "namespace"   !IdentifierPart
ExportKeyword      = "export"      !IdentifierPart
ActionKeyword      = "action"      !IdentifierPart
BodyKeyword        = "body"        !IdentifierPart
ReturnKeyword      = "return"      !IdentifierPart
BreakKeyword       = "break"       !IdentifierPart
ContinueKeyword    = "continue"    !IdentifierPart
ForKeyword         = "for"         !IdentifierPart
InKeyword          = "in"          !IdentifierPart
WhileKeyword       = "while"       !IdentifierPart
IfKeyword          = "if"          !IdentifierPart
ElseKeyword        = "else"        !IdentifierPart
TriggerKeyword     = "trigger"     !IdentifierPart
OnKeyword          = "on"          !IdentifierPart
EntityKeyword      = "entity"      !IdentifierPart
PermissionsKeyword = "permissions" !IdentifierPart
VoidKeyword        = "VOID"        !IdentifierPart
DateTimeKeyword    = "DATE_TIME"   !IdentifierPart
DurationKeyword    = "DURATION"    !IdentifierPart
NothingKeyword     = "NOTHING"     !IdentifierPart
TrueKeyword        = "true"        !IdentifierPart
FalseKeyword       = "false"       !IdentifierPart
EnumKeyword        = "enum"        !IdentifierPart
SetKeyword         = "SET"         !IdentifierPart
DeleteKeyword      = "delete"      !IdentifierPart
ErrorKeyword       = "error"       !IdentifierPart
ErrorTypeKeyword   = "ERROR"       !IdentifierPart
RaiseKeyword       = "raise"       !IdentifierPart
PassKeyword        = "pass"        !IdentifierPart
AssertKeyword      = "assert"      !IdentifierPart
ModelKeyword       = "model"       !IdentifierPart
UnknownKeyword     = "UNKNOWN"     !IdentifierPart
ConstKeyword       = "const"       !IdentifierPart
RelationKeyword    = "relation"    !IdentifierPart
AndKeyword         = "and"         !IdentifierPart
OrKeyword          = "or"          !IdentifierPart
OrElseKeyword      = "orElse"      !IdentifierPart
IsEmptyKeyword     = "isEmpty"     !IdentifierPart
InstanceOfKeyword  = "instanceOf"  !IdentifierPart
IgnoreKeyword      = "ignore"      !IdentifierPart

// Contextual keywords: special only where they are used, so not listed in Keyword.
IntoKeyword        = "into"        !IdentifierPart  // in an import
AsKeyword          = "as"          !IdentifierPart  // in an import, a re-export and an entity's expose block
RaisesKeyword      = "raises"      !IdentifierPart  // in an action's signature
PassesKeyword      = "passes"      !IdentifierPart  // in an action's signature
WithKeyword        = "with"        !IdentifierPart  // in a raise statement and a membership line
DataKeyword        = "data"        !IdentifierPart  // in an error declaration
AuthKeyword        = "auth"        !IdentifierPart  // in a trigger's block
ArgumentsKeyword   = "arguments"   !IdentifierPart  // in a trigger's block
ParametersKeyword  = "parameters"  !IdentifierPart  // in a trigger's block
HasKeyword         = "has"         !IdentifierPart  // in a permissions declaration
NativeKeyword      = "native"      !IdentifierPart  // in an action's block
AssertionsKeyword  = "assertions"  !IdentifierPart  // in a trigger's block
CanKeyword         = "can"         !IdentifierPart  // in a predicate
IsKeyword          = "is"          !IdentifierPart  // in a predicate
WithinKeyword      = "within"      !IdentifierPart  // in a predicate

// ----- Whitespace, comments and indentation -----

// Spaces and tabs within a line.
_  "whitespace" = [ \t]*
__ "whitespace" = [ \t]+

// A comment runs from `//` to the end of the line (docs/adr/0007-actions.md).
Comment "comment"
  = "//" [^\r\n]*

LineBreak
  = "\r\n"
  / "\n"

// The end of a line, after any trailing whitespace and comment.
EndOfLine
  = _ Comment? LineBreak

// Lines that are empty or hold only a comment.
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
