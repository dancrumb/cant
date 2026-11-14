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

export interface StringLiteral extends Literal {
  type: 'string';
  position: Position;
  /** The string's contents, without the quotes. */
  value: string;
}

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

/** `nameSpace::symbolName`: a symbol in a named namespace. */
export interface QualifiedIdentifier extends Node {
  type: 'qualifiedIdentifier';
  position: Position;
  namespace: Identifier;
  name: Identifier;
}

export type Expression =
  | Identifier
  | QualifiedIdentifier
  | StringLiteral
  | MemberExpression
  | CallExpression;

export interface ExpressionStatement extends Node {
  type: 'expressionStatement';
  position: Position;
  expression: Expression;
}

export type Statement = ExpressionStatement;

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
  /** A symbolic identifier, or a string holding a URL relative to the importing module. */
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

/** `action SayHello():VOID { ... }` */
export interface ActionDeclaration extends Parent {
  type: 'action';
  position: Position;
  name: Identifier;
  returnType: Identifier;
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
  | ImportDeclaration
  | NamespaceDeclaration
  | ActionDeclaration
  | TriggerDeclaration;

export interface Program extends Parent {
  type: 'program';
  position: Position;
  children: Declaration[];
}

export type CantNode = Program | Declaration | Statement | Expression;
