import type { Program } from './ast.ts';
import { parse as parseGenerated, SyntaxError } from './generated/parser.js';

export { SyntaxError as ParseError };

/**
 * Parse Cant source into a syntax tree.
 *
 * @throws {ParseError} if the source is not valid Cant; its `location` says where.
 */
export function parse(source: string): Program {
  return parseGenerated(source) as Program;
}
