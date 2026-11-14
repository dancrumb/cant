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

export type Expression = Identifier | StringLiteral | MemberExpression | CallExpression;

export interface ExpressionStatement extends Node {
  type: 'expressionStatement';
  position: Position;
  expression: Expression;
}

export type Statement = ExpressionStatement;

/** `import IO` */
export interface ImportDeclaration extends Node {
  type: 'import';
  position: Position;
  module: Identifier;
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

export type Declaration = ImportDeclaration | ActionDeclaration | TriggerDeclaration;

export interface Program extends Parent {
  type: 'program';
  position: Position;
  children: Declaration[];
}

export type CantNode = Program | Declaration | Statement | Expression;
