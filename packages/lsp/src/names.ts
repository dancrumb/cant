import { symbolOf, type CheckedProgram, type LocalBinding, type Module, type ModuleSymbol } from '@dancrumb/cant-compiler';
import type { Identifier, QualifiedIdentifier } from '@dancrumb/cant-shared';
import type { Node } from 'unist';

/** A name in a module's syntax tree, and the node it is part of. */
export interface NameAt {
  node: Identifier | QualifiedIdentifier;
  parent: Node | undefined;
}

/** Every node of a syntax tree, each with its parent, in source order. */
export function* walk(node: unknown, parent?: Node): Generator<{ node: Node; parent: Node | undefined }> {
  if (typeof node !== 'object' || node === null) {
return;
}
  if (Array.isArray(node)) {
    for (const child of node) {
yield* walk(child, parent);
}
    return;
  }
  const typed = node as Partial<Node>;
  const isNode = typeof typed.type === 'string';
  if (isNode) {
yield { node: node as Node, parent };
}
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'position') {
yield* walk(value, isNode ? (node as Node) : parent);
}
  }
}

/** What a name at a position means: a top-level symbol, or a local binding. */
export type Meaning = { kind: 'symbol'; symbol: ModuleSymbol } | { kind: 'local'; binding: LocalBinding };

/** What a name means: the symbol it refers to, the local it is, or the symbol it declares. */
export function meaning(module: Module, program: CheckedProgram, { node, parent }: NameAt): Meaning | undefined {
  const symbol = program.references.get(node);
  if (symbol !== undefined) {
return { kind: 'symbol', symbol };
}
  if (node.type === 'identifier') {
    const binding = program.locals.get(node);
    if (binding !== undefined) {
return { kind: 'local', binding };
}
  }
  // The name a top-level declaration declares.
  const declaration = module.program?.children.find((child) => child === parent);
  switch (declaration?.type) {
    case 'action':
    case 'const':
    case 'model':
    case 'entity':
    case 'enumDeclaration':
    case 'errorDeclaration':
      if (declaration.name === node) {
return { kind: 'symbol', symbol: symbolOf(module.path, declaration) };
}
      break;
    default:
      break;
  }
  return undefined;
}
