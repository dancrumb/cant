import type { Literal, Node, Parent, Position } from 'unist';

/**
 * The syntax tree for Cant source. Every node is a unist node with a `position`.
 *
 * Nodes that contain statements keep them in `children`; other sub-nodes are held in named
 * fields, so `unist-util-visit` and friends only walk the statement structure.
 */

export interface Identifier extends Literal {
  type: 'identifier';
  position: Position;
  value: string;
}

/** `nameSpace::symbolName`: a symbol in a named namespace. */
export interface QualifiedIdentifier extends Node {
  type: 'qualifiedIdentifier';
  position: Position;
  namespace: Identifier;
  name: Identifier;
}

// ----- Strings: docs/adr/0008-strings.md -----

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

// ----- Expressions -----

export interface MemberExpression extends Node {
  type: 'member';
  position: Position;
  object: Expression;
  property: Identifier;
}

export interface CallExpression extends Node {
  type: 'call';
  position: Position;
  callee: Expression;
  arguments: Expression[];
}

export type Expression =
  Identifier | QualifiedIdentifier | StringLiteral | MemberExpression | CallExpression;

/** Values are not defined by an ADR yet; strings are the only kind so far. */
export type Value = StringLiteral;

// ----- Types -----

/** `enum("draft", "published")`: one of a fixed set of strings. */
export interface EnumType extends Node {
  type: 'enum';
  position: Position;
  values: StringLiteral[];
}

/** A built-in or named type (`String`), a namespaced type (`accounts::User`) or an inline enum. */
export type TypeRef = Identifier | QualifiedIdentifier | EnumType;

// ----- Statements -----

export interface ExpressionStatement extends Node {
  type: 'expressionStatement';
  position: Position;
  expression: Expression;
}

/** `return value` */
export interface ReturnStatement extends Node {
  type: 'return';
  position: Position;
  argument: Expression;
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

/** `enqueue queue with message` */
export interface EnqueueStatement extends Node {
  type: 'enqueue';
  position: Position;
  queue: Identifier;
  message: Identifier;
}

export type Statement =
  | ExpressionStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | ForStatement
  | WhileStatement
  | IfStatement
  | EnqueueStatement;

// ----- Declarations -----

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

/** `namespace Greetings` */
export interface NamespaceDeclaration extends Node {
  type: 'namespace';
  position: Position;
  name: Identifier;
}

/** `name?: Type := default` in an action's signature. */
export interface Parameter extends Node {
  type: 'parameter';
  position: Position;
  name: Identifier;
  /** Whether the name is followed by `?`. */
  optional: boolean;
  valueType: TypeRef;
  defaultValue?: Value;
}

/**
 * An action, `action Name(parameters): ReturnType?` with an indented `body` block. The body's
 * statements are held in `children`.
 */
export interface ActionDeclaration extends Parent {
  type: 'action';
  position: Position;
  name: Identifier;
  parameters: Parameter[];
  returnType: TypeRef;
  /** Whether the return type is followed by `?`, so the action may return `null`. */
  nullable: boolean;
  children: Statement[];
}

/** `trigger SayHello on Start` */
export interface TriggerDeclaration extends Node {
  type: 'trigger';
  position: Position;
  action: Identifier;
  event: Identifier;
}

export type Declaration =
  ImportDeclaration | NamespaceDeclaration | ActionDeclaration | TriggerDeclaration;

export interface Program extends Parent {
  type: 'program';
  position: Position;
  children: Declaration[];
}

export type CantNode =
  | Program
  | Declaration
  | Parameter
  | Block
  | Statement
  | Expression
  | Text
  | Interpolation
  | EnumType;
