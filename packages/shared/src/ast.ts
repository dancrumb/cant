import type { Literal, Node, Parent, Position } from 'unist';

/**
 * The syntax tree for Cant source. Every node is a unist node with a `position`.
 *
 * Nodes that contain statements keep them in `children`; other sub-nodes are held in named
 * fields, so `unist-util-visit` and friends only walk the statement structure.
 *
 * The tree records what the source says, not whether it makes sense: type checking, name
 * resolution and the other compile-time rules in docs/adr are left to later passes.
 */

export interface Identifier extends Literal {
  type: 'identifier';
  position: Position;
  value: string;
}

/** `nameSpace::symbolName`: a symbol in a named namespace (docs/adr/0005-module-namespaces.md). */
export interface QualifiedIdentifier extends Node {
  type: 'qualifiedIdentifier';
  position: Position;
  namespace: Identifier;
  name: Identifier;
}

/** A name that may be in another namespace, such as a type, an action or an error. */
export type Name = Identifier | QualifiedIdentifier;

/** `@subject`, `@all`: a built-in value (docs/adr/0009-triggers.md). `name` is without the `@`. */
export interface BuiltIn extends Node {
  type: 'builtIn';
  position: Position;
  name: string;
}

// ----- Literals: docs/adr/0008-strings.md, docs/adr/0019-operators.md -----

/** Literal text in a string, with its escape sequences already decoded. */
export interface Text extends Literal {
  type: 'text';
  position: Position;
  value: string;
}

/** `${expression}` inside a string. */
export interface Interpolation extends Node {
  type: 'interpolation';
  position: Position;
  expression: Expression;
}

/**
 * `"Hello, ${name}!"`. Every string is a template: its parts are runs of text and
 * interpolations, in order. Adjacent text is always merged into one `text` part, so a string
 * with no interpolations has at most one part.
 */
export interface StringLiteral extends Node {
  type: 'string';
  position: Position;
  parts: (Text | Interpolation)[];
}

/** `42`, `0xFF`, `1_000.5e3`. A number literal is never negative: `-1` is a unary `-`. */
export interface NumberLiteral extends Literal {
  type: 'number';
  position: Position;
  value: number;
}

/** `true` or `false`. */
export interface BooleanLiteral extends Literal {
  type: 'boolean';
  position: Position;
  value: boolean;
}

/** A literal whose value is known at compile time, as in an enum (docs/adr/0013-enums.md). */
export type ConstantValue = StringLiteral | NumberLiteral | BooleanLiteral;

/** `NOTHING`, which can only be written in a `return` (docs/adr/0012-base-types.md). */
export interface Nothing extends Node {
  type: 'nothing';
  position: Position;
}

// ----- Types: docs/adr/0007-actions.md -----

/** `TEXT`, `NUMBER`, `BOOLEAN`, `DATE_TIME` or `FILE` (docs/adr/0012-base-types.md). */
export interface BaseType extends Node {
  type: 'baseType';
  position: Position;
  name: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE_TIME' | 'FILE';
}

/** `VOID`, which can only be a return type (docs/adr/0012-base-types.md). */
export interface VoidType extends Node {
  type: 'voidType';
  position: Position;
}

/** `UNKNOWN` (docs/adr/0033-unknown-type.md). */
export interface UnknownType extends Node {
  type: 'unknownType';
  position: Position;
}

/** `enum("draft", "published")`: an inline enum (docs/adr/0013-enums.md). */
export interface EnumType extends Node {
  type: 'enum';
  position: Position;
  values: ConstantValue[];
}

/** `[T]` (docs/adr/0021-collections.md). */
export interface ArrayType extends Node {
  type: 'arrayType';
  position: Position;
  elementType: TypeRef;
}

/** `{T}` (docs/adr/0021-collections.md). */
export interface MapType extends Node {
  type: 'mapType';
  position: Position;
  valueType: TypeRef;
}

/** `SET(T)` (docs/adr/0021-collections.md). */
export interface SetType extends Node {
  type: 'setType';
  position: Position;
  elementType: TypeRef;
}

/** A type: a base type, `UNKNOWN`, an inline enum, a collection type, or a named type. */
export type TypeRef = BaseType | UnknownType | EnumType | ArrayType | MapType | SetType | Name;

/** `ERROR`, the type of every error, on the right of `instanceOf` (docs/adr/0023-error-handling.md). */
export interface ErrorType extends Node {
  type: 'errorType';
  position: Position;
}

// ----- Expressions: docs/adr/0019-operators.md -----

/** `name := value` or `value` in a call (docs/adr/0020-action-parameters.md). */
export interface Argument extends Node {
  type: 'argument';
  position: Position;
  /** Missing for an unnamed argument, including the matching-identifier form `f(name)`. */
  name?: Identifier;
  value: Expression;
}

/** `value.name`. The name can be a keyword, as in `request.body`. */
export interface MemberExpression extends Node {
  type: 'member';
  position: Position;
  object: Expression;
  property: Identifier;
}

/** `value[index]` (docs/adr/0021-collections.md). */
export interface IndexExpression extends Node {
  type: 'index';
  position: Position;
  object: Expression;
  index: Expression;
}

export interface CallExpression extends Node {
  type: 'call';
  position: Position;
  callee: Expression;
  arguments: Argument[];
}

export type UnaryOperator = '!' | '-' | 'isEmpty' | 'ignore';

/** `!a`, `-a`, `isEmpty a`, `ignore a`. */
export interface UnaryExpression extends Node {
  type: 'unary';
  position: Position;
  operator: UnaryOperator;
  argument: Expression;
}

export type BinaryOperator =
  | 'orElse'
  | '**'
  | '*'
  | '/'
  | '%'
  | '+'
  | '-'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'and'
  | 'or';

export interface BinaryExpression extends Node {
  type: 'binary';
  position: Position;
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

/** `value instanceOf T`, `value instanceOf T?` or `value instanceOf ERROR`. */
export interface InstanceOfExpression extends Node {
  type: 'instanceOf';
  position: Position;
  value: Expression;
  target: TypeRef | ErrorType;
  /** Whether the type is followed by `?`. */
  optional: boolean;
}

/**
 * `@subject can "permission"`, optionally `within group`, where the group is an expression
 * (docs/adr/0010-security.md).
 */
export interface CanPredicate extends Node {
  type: 'canPredicate';
  position: Position;
  subject: BuiltIn;
  permission: StringLiteral;
  group?: Expression;
}

/** `@subject is User` or `@subject is @anonymous` (docs/adr/0010-security.md). */
export interface IsPredicate extends Node {
  type: 'isPredicate';
  position: Position;
  subject: BuiltIn;
  subjectType: Identifier | BuiltIn;
}

/** `@subject is admin within org`, where the group is an expression (docs/adr/0010-security.md). */
export interface RolePredicate extends Node {
  type: 'rolePredicate';
  position: Position;
  subject: BuiltIn;
  role: Identifier;
  group: Expression;
}

/** `[a, b, c]` (docs/adr/0021-collections.md). */
export interface ArrayValue extends Node {
  type: 'array';
  position: Position;
  elements: Expression[];
}

/** `name := value` in an object value. */
export interface ObjectItem extends Node {
  type: 'objectItem';
  position: Position;
  /** An identifier, which can be a keyword, or a string for names that are not identifiers. */
  name: Identifier | StringLiteral;
  value: Expression;
}

/** `{ name := value, ... }`: an anonymous model (docs/adr/0027-object-shapes.md). */
export interface ObjectValue extends Node {
  type: 'object';
  position: Position;
  items: ObjectItem[];
}

/** `SET(a, b)` (docs/adr/0021-collections.md). */
export interface SetValue extends Node {
  type: 'set';
  position: Position;
  elements: Expression[];
}

export type Expression =
  | Identifier
  | QualifiedIdentifier
  | BuiltIn
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | ArrayValue
  | ObjectValue
  | SetValue
  | MemberExpression
  | IndexExpression
  | CallExpression
  | UnaryExpression
  | BinaryExpression
  | InstanceOfExpression
  | CanPredicate
  | IsPredicate
  | RolePredicate;

// ----- Statements: docs/adr/0007-actions.md, docs/adr/0023-error-handling.md -----

export interface ExpressionStatement extends Node {
  type: 'expressionStatement';
  position: Position;
  expression: Expression;
}

/** `target := value`. The target is an identifier, or ends in a member or an index. */
export interface AssignmentStatement extends Node {
  type: 'assignment';
  position: Position;
  target: Identifier | MemberExpression | IndexExpression;
  value: Expression;
}

/** `delete target`, where the target ends in a member or an index. */
export interface DeleteStatement extends Node {
  type: 'delete';
  position: Position;
  target: MemberExpression | IndexExpression;
}

/** `ignore` before an assignment or a `delete`. */
export interface IgnoredStatement extends Node {
  type: 'ignoredStatement';
  position: Position;
  statement: AssignmentStatement | DeleteStatement;
}

/** `return`, `return value` or `return NOTHING`. */
export interface ReturnStatement extends Node {
  type: 'return';
  position: Position;
  argument?: Expression | Nothing;
}

/** `raise Error`, `raise Error(field := value)` or `raise Error with value`. */
export interface RaiseStatement extends Node {
  type: 'raise';
  position: Position;
  error: Name;
  /** The `data` model's fields, when they are given in parentheses. */
  arguments?: Argument[];
  /** The whole `data`, when it is given with `with`. */
  data?: Expression;
}

/** `pass value` */
export interface PassStatement extends Node {
  type: 'pass';
  position: Position;
  argument: Expression;
}

/** `assert condition` or `assert condition, message` */
export interface AssertStatement extends Node {
  type: 'assert';
  position: Position;
  test: Expression;
  message?: Expression;
}

export interface BreakStatement extends Node {
  type: 'break';
  position: Position;
}

export interface ContinueStatement extends Node {
  type: 'continue';
  position: Position;
}

/** `for item in items` followed by a block, which is held in `children`. */
export interface ForStatement extends Parent {
  type: 'for';
  position: Position;
  variable: Identifier;
  iterable: Expression;
  children: Statement[];
}

/** `while test` followed by a block, which is held in `children`. */
export interface WhileStatement extends Parent {
  type: 'while';
  position: Position;
  test: Expression;
  children: Statement[];
}

/** The statements of one branch of an `if`. */
export interface Block extends Parent {
  type: 'block';
  position: Position;
  children: Statement[];
}

/**
 * `if test` followed by a block, and optionally `else` with a block or another `if`.
 * `children` holds the consequent block, then the alternate if there is one.
 */
export interface IfStatement extends Parent {
  type: 'if';
  position: Position;
  test: Expression;
  children: [Block] | [Block, Block | IfStatement];
}

export type Statement =
  | ExpressionStatement
  | AssignmentStatement
  | DeleteStatement
  | IgnoredStatement
  | ReturnStatement
  | RaiseStatement
  | PassStatement
  | AssertStatement
  | BreakStatement
  | ContinueStatement
  | ForStatement
  | WhileStatement
  | IfStatement;

// ----- Imports and namespaces: docs/adr/0005-module-namespaces.md, docs/adr/0006-imports.md -----

/**
 * A symbolic module identifier, `[<scope>::]<name>`. A missing scope means `cant`; the parser
 * leaves it out rather than filling it in.
 */
export interface ModuleName extends Node {
  type: 'moduleName';
  position: Position;
  scope?: Identifier;
  name: Identifier;
}

/** `import IO`, `import "./lib.cant" into lib`, `import "./config.json" as "json"` */
export interface ImportDeclaration extends Node {
  type: 'import';
  position: Position;
  /**
   * A symbolic identifier, or a string holding a URL relative to the importing module. The
   * string never contains interpolations.
   */
  module: ModuleName | StringLiteral;
  /** The namespace from `into`; without it, symbols go into the current namespace. */
  namespace?: Identifier;
  /** The module type from `as`; without it, the module is Cant source. */
  moduleType?: StringLiteral;
}

/**
 * `export accounts::FindUser`: a symbol the module imports, exported under its own name, or
 * under `alias` with `as LookupUser`.
 */
export interface ReExport extends Node {
  type: 'reExport';
  position: Position;
  name: Identifier | QualifiedIdentifier;
  alias?: Identifier;
}

/** `namespace Greetings` */
export interface NamespaceDeclaration extends Node {
  type: 'namespace';
  position: Position;
  name: Identifier;
}

// ----- Actions: docs/adr/0007-actions.md, docs/adr/0020-action-parameters.md -----

/** `name?: Type := default` in an action's signature. */
export interface Parameter extends Node {
  type: 'parameter';
  position: Position;
  name: Identifier;
  /** Whether the name is followed by `?`. */
  optional: boolean;
  valueType: TypeRef;
  defaultValue?: Expression;
}

/**
 * An action, `action Name(parameters): ReturnType? raises A passes B` with an indented `body`
 * block. The body's statements are held in `children`.
 */
export interface ActionDeclaration extends Parent {
  type: 'action';
  position: Position;
  /** Whether the declaration starts with `export` (docs/adr/0006-imports.md). */
  exported?: true;
  name: Identifier;
  parameters: Parameter[];
  returnType: TypeRef | VoidType;
  /** Whether the return type is followed by `?`, so the action may return `NOTHING`. */
  optional: boolean;
  /** The errors in the `raises` clause (docs/adr/0023-error-handling.md). */
  raises: Name[];
  /** The errors in the `passes` clause, which can include `@all`. */
  passes: (Name | BuiltIn)[];
  children: Statement[];
}

// ----- Triggers: docs/adr/0009-triggers.md, docs/adr/0025-trigger-sources.md -----

/** `name := value` in a trigger's `arguments` or `parameters` block. */
export interface NamedValue extends Node {
  type: 'namedValue';
  position: Position;
  name: Identifier;
  value: Expression;
}

/** `trigger SayHello on Start`, with optional `auth`, `arguments` and `parameters` blocks. */
export interface TriggerDeclaration extends Node {
  type: 'trigger';
  position: Position;
  action: Name;
  source: Identifier;
  /** The rule in the `auth` block. */
  auth?: Expression;
  arguments?: NamedValue[];
  parameters?: NamedValue[];
}

// ----- Security: docs/adr/0010-security.md -----

/** `permissions group` or `permissions group has role`, with a block of permissions. */
export interface PermissionsDeclaration extends Node {
  type: 'permissions';
  position: Position;
  group: Identifier;
  role?: Identifier;
  permissions: StringLiteral[];
}

// ----- Relations: docs/adr/0035-entity-relationships.md -----

/** How many of an end's entity each entity at the other end is related to. */
export type Cardinality = '1' | '0..1' | '0..*' | '1..*';

/** One end of a relation: `User[tasks]` and the cardinality written beside it. */
export interface RelationEnd {
  entity: Name;
  /** The navigation field the relation adds to `entity`, reaching the other end. */
  field: Identifier;
  cardinality: Cardinality;
}

/** `relation User[tasks] 1 --- 0..* Task[owner]` */
export interface RelationDeclaration extends Node {
  type: 'relation';
  position: Position;
  left: RelationEnd;
  right: RelationEnd;
}

// ----- Enums: docs/adr/0013-enums.md -----

/** `Name` or `Name := value` in an enum declaration. */
export interface EnumMember extends Node {
  type: 'enumMember';
  position: Position;
  name: Identifier;
  value?: ConstantValue;
}

export interface EnumDeclaration extends Node {
  type: 'enumDeclaration';
  position: Position;
  exported?: true;
  name: Identifier;
  members: EnumMember[];
}

// ----- Models: docs/adr/0027-object-shapes.md -----

/** `name?: Type := default` in a model, or in an error's anonymous `data`. */
export interface Field extends Node {
  type: 'field';
  position: Position;
  name: Identifier;
  optional: boolean;
  valueType: TypeRef;
  defaultValue?: Expression;
}

export interface ModelDeclaration extends Node {
  type: 'model';
  position: Position;
  exported?: true;
  name: Identifier;
  fields: Field[];
}

// ----- Entities: docs/adr/0022-entities.md, docs/adr/0010-security.md -----

export interface SubjectLine extends Node {
  type: 'subjectLine';
  position: Position;
}

export interface IdentityLine extends Node {
  type: 'identityLine';
  position: Position;
  fields: Identifier[];
}

export interface GroupLine extends Node {
  type: 'groupLine';
  position: Position;
  name: Identifier;
}

export interface RoleLine extends Node {
  type: 'roleLine';
  position: Position;
  name: Identifier;
}

export interface ModelsBlock extends Node {
  type: 'modelsBlock';
  position: Position;
  models: Name[];
}

/** `field` or `field as name` in an `expose` block. */
export interface ExposedField extends Node {
  type: 'exposedField';
  position: Position;
  field: Identifier;
  as?: Identifier;
}

export interface ExposeBlock extends Node {
  type: 'exposeBlock';
  position: Position;
  items: (ExposedField | BuiltIn)[];
}

export interface HideBlock extends Node {
  type: 'hideBlock';
  position: Position;
  items: (Identifier | BuiltIn)[];
}

export type EntityLine =
  | SubjectLine
  | IdentityLine
  | GroupLine
  | RoleLine
  | ModelsBlock
  | ExposeBlock
  | HideBlock;

/** An entity, whose lines are held in source order in `lines`. */
export interface EntityDeclaration extends Node {
  type: 'entity';
  position: Position;
  exported?: true;
  name: Identifier;
  lines: EntityLine[];
}

// ----- Errors: docs/adr/0023-error-handling.md -----

export interface ErrorDeclaration extends Node {
  type: 'errorDeclaration';
  position: Position;
  exported?: true;
  name: Identifier;
  /** A named `data` model, or the fields of an anonymous one. */
  data?: Name | Field[];
}

// ----- Constants: docs/adr/0034-top-level-constants.md -----

export interface ConstDeclaration extends Node {
  type: 'const';
  position: Position;
  exported?: true;
  name: Identifier;
  valueType?: TypeRef;
  value: Expression;
}

// ----- Programs -----

export type Declaration =
  | ImportDeclaration
  | ReExport
  | NamespaceDeclaration
  | ActionDeclaration
  | TriggerDeclaration
  | PermissionsDeclaration
  | RelationDeclaration
  | EnumDeclaration
  | ModelDeclaration
  | EntityDeclaration
  | ErrorDeclaration
  | ConstDeclaration;

export interface Program extends Parent {
  type: 'program';
  position: Position;
  children: Declaration[];
}

export type CantNode =
  | Program
  | Declaration
  | Parameter
  | NamedValue
  | EnumMember
  | Field
  | EntityLine
  | ExposedField
  | Block
  | Statement
  | Expression
  | Argument
  | ObjectItem
  | Nothing
  | Text
  | Interpolation
  | TypeRef
  | VoidType
  | ErrorType;
