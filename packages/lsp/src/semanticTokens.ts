import type { CheckedProgram, Module } from '@dancrumb/cant-compiler';
import { comments, tokenize, type Identifier, type QualifiedIdentifier, type TokenKind } from '@dancrumb/cant-shared';
import type { Node } from 'unist';
import { SemanticTokensBuilder, type SemanticTokensLegend } from 'vscode-languageserver/node';
import { meaning, walk, type Meaning } from './names.ts';

/**
 * Semantic tokens for a Cant document. The tokenizer gives keywords, strings, numbers, operators
 * and comments; the checked program gives each name its role, such as an action, a type, a
 * parameter or a field, so a theme can colour them differently.
 */

const TOKEN_TYPES = [
  'namespace',
  'type',
  'class',
  'enum',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'function',
  'keyword',
  'comment',
  'string',
  'number',
  'operator',
] as const;

const TOKEN_MODIFIERS = ['declaration', 'readonly', 'defaultLibrary'] as const;

type TokenType = (typeof TOKEN_TYPES)[number];
type TokenModifier = (typeof TOKEN_MODIFIERS)[number];

export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [...TOKEN_MODIFIERS] };

interface Role {
  type: TokenType;
  modifiers?: readonly TokenModifier[];
}

// Punctuation is left to the editor's default colouring.
const ROLE_BY_KIND: Partial<Record<TokenKind, Role>> = {
  keyword: { type: 'keyword' },
  string: { type: 'string' },
  number: { type: 'number' },
  operator: { type: 'operator' },
  identifier: { type: 'variable' },
  // Built-in values, such as `@stdout`, are values the language provides.
  builtin: { type: 'variable', modifiers: ['readonly', 'defaultLibrary'] },
};

/** The role of a name that refers to, or declares, a top-level symbol or a local. */
function roleOfMeaning(found: Meaning, declares: boolean): Role {
  const modifiers: TokenModifier[] = declares ? ['declaration'] : [];
  if (found.kind === 'local') {
    switch (found.binding.kind) {
      case 'parameter':
        return { type: 'parameter', modifiers };
      case 'field':
        return { type: 'property', modifiers };
      default:
        return { type: 'variable', modifiers };
    }
  }
  const { symbol } = found;
  if (symbol.kind === 'action') return { type: 'function', modifiers };
  if (symbol.kind === 'const') return { type: 'variable', modifiers: [...modifiers, 'readonly'] };
  switch (symbol.typeKind) {
    case 'enum':
      return { type: 'enum', modifiers };
    case 'entity':
      return { type: 'class', modifiers };
    case 'internal':
      // A standard library type parameter or internal type (docs/adr/0043-standard-library-generics.md).
      return { type: symbol.internal?.kind === 'variable' ? 'typeParameter' : 'type', modifiers: [...modifiers, 'defaultLibrary'] };
    default:
      return { type: 'type', modifiers };
  }
}

/**
 * The role of a name from where it is, for names that don't refer to a symbol or a local: the
 * names that parameters, fields, members and arguments are given, and namespaces.
 */
function roleOfPlace(node: Identifier, parent: Node | undefined, enumMembers: ReadonlySet<Node>): Role | undefined {
  const at = parent as (Node & Record<string, unknown>) | undefined;
  switch (at?.type) {
    case 'parameter':
      return at.name === node ? { type: 'parameter', modifiers: ['declaration'] } : undefined;
    case 'field':
      return at.name === node ? { type: 'property', modifiers: ['declaration'] } : undefined;
    case 'enumMember':
      return at.name === node ? { type: 'enumMember', modifiers: ['declaration'] } : undefined;
    case 'typeParameter':
      return at.name === node ? { type: 'typeParameter', modifiers: ['declaration'] } : undefined;
    case 'genericType':
      // `Collection` in `Collection<T>`, which only the standard library writes (docs/adr/0043-standard-library-generics.md).
      return at.name === node ? { type: 'type', modifiers: ['defaultLibrary'] } : undefined;
    case 'member':
      if (at.property !== node) return undefined;
      return enumMembers.has(at) ? { type: 'enumMember' } : { type: 'property' };
    case 'objectItem':
      return at.name === node ? { type: 'property' } : undefined;
    case 'argument':
    case 'namedValue':
      return at.name === node ? { type: 'parameter' } : undefined;
    case 'namespace':
      return { type: 'namespace', modifiers: ['declaration'] };
    case 'import':
      return at.namespace === node ? { type: 'namespace', modifiers: ['declaration'] } : undefined;
    case 'moduleName':
      return { type: 'namespace' };
    case 'relation':
      // A relation's navigation fields; its entities are references.
      return { type: 'property', modifiers: ['declaration'] };
    case 'trigger':
      // A trigger source, such as `Start`, which the language provides (docs/adr/0025-trigger-sources.md).
      return at.source === node ? { type: 'type', modifiers: ['defaultLibrary'] } : undefined;
    case 'identityLine':
    case 'membershipLine':
    case 'exposedField':
    case 'hideBlock':
      return { type: 'property' };
    default:
      return undefined;
  }
}

/** The roles of the names in a module, by the offset each starts at. */
function nameRoles(module: Module, program: CheckedProgram): Map<number, Role> {
  const roles = new Map<number, Role>();
  if (module.program === undefined) return roles;

  // `Status.paid`: a member of an enum, rather than a field (docs/adr/0013-enums.md).
  const enumMembers = new Set<Node>();
  for (const { node } of walk(module.program)) {
    const member = node as Node & { type: string; object?: Node };
    if (member.type !== 'member' || member.object === undefined) continue;
    const object = member.object as Node & { type: string };
    if (object.type !== 'identifier' && object.type !== 'qualifiedIdentifier') continue;
    const found = program.references.get(object as Identifier | QualifiedIdentifier);
    if (found?.typeKind === 'enum') enumMembers.add(member);
  }

  const set = (node: Identifier, role: Role): void => {
    const offset = node.position.start.offset;
    if (offset !== undefined) roles.set(offset, role);
  };

  for (const { node, parent } of walk(module.program)) {
    if (node.type === 'qualifiedIdentifier') {
      // `IO::write`: the namespace, then the name, which means what the whole does.
      const qualified = node as QualifiedIdentifier;
      set(qualified.namespace, { type: 'namespace' });
      const found = meaning(module, program, { node: qualified, parent });
      if (found !== undefined) set(qualified.name, roleOfMeaning(found, false));
      continue;
    }
    if (node.type !== 'identifier' || parent?.type === 'qualifiedIdentifier') continue;
    const identifier = node as Identifier;
    const found = meaning(module, program, { node: identifier, parent });
    // A declaration's own name, or where a local is first given a value.
    const declares =
      (parent as { name?: unknown } | undefined)?.name === identifier || (found?.kind === 'local' && found.binding.declaration === identifier);
    const role = found === undefined ? roleOfPlace(identifier, parent, enumMembers) : roleOfMeaning(found, declares);
    if (role !== undefined) set(identifier, role);
  }
  return roles;
}

/**
 * Encode a document's semantic tokens, in the form the Language Server Protocol sends them. A
 * module with a syntax error still gets the tokenizer's tokens, with every name a variable.
 */
export function semanticTokens(source: string, module: Module | undefined, program: CheckedProgram | undefined): number[] {
  const roles = module === undefined || program === undefined ? new Map<number, Role>() : nameRoles(module, program);
  const tokens: { line: number; character: number; length: number; role: Role }[] = [];

  for (const token of tokenize(source)) {
    const { start, end } = token.position;
    const base = ROLE_BY_KIND[token.kind];
    if (base === undefined || start.offset === undefined || end.offset === undefined) continue;
    // A keyword can be a name too, as `body` is in `request.body`.
    const role = token.kind === 'identifier' || token.kind === 'keyword' ? (roles.get(start.offset) ?? base) : base;
    tokens.push({ line: start.line - 1, character: start.column - 1, length: end.offset - start.offset, role });
  }
  for (const { position } of comments(source)) {
    const { start, end } = position;
    if (start.offset === undefined || end.offset === undefined) continue;
    tokens.push({ line: start.line - 1, character: start.column - 1, length: end.offset - start.offset, role: { type: 'comment' } });
  }
  tokens.sort((a, b) => a.line - b.line || a.character - b.character);

  const builder = new SemanticTokensBuilder();
  for (const { line, character, length, role } of tokens) {
    const modifiers = (role.modifiers ?? []).reduce((bits, modifier) => bits | (1 << TOKEN_MODIFIERS.indexOf(modifier)), 0);
    builder.push(line, character, length, TOKEN_TYPES.indexOf(role.type), modifiers);
  }
  return builder.build().data;
}
