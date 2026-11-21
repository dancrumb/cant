import type { Point } from 'unist';
import type { Program } from './ast.ts';
import { parse as parseGenerated, SyntaxError } from './generated/parser.js';

/**
 * The error `parse` throws when the source is not valid Cant. It is Peggy's `SyntaxError`, typed
 * here because the package's declarations are built from the generated JavaScript, which has no
 * types of its own.
 */
export interface ParseError extends globalThis.SyntaxError {
  /** Where the problem is. Lines and columns are 1-based and offsets are 0-based, as in unist. */
  location: { start: Point & { offset: number }; end: Point & { offset: number } };
  /** What the parser could have accepted where it stopped, if it stopped on a syntax error. */
  expected: unknown[] | null;
  /** The text it found there instead, or `null` at the end of the source. */
  found: string | null | undefined;
}

export const ParseError = SyntaxError as unknown as new (
  message: string,
  expected: unknown[] | null,
  found: string | null,
  location: ParseError['location'],
) => ParseError;

/**
 * Parse Cant source into a syntax tree.
 *
 * @throws {ParseError} if the source is not valid Cant; its `location` says where.
 */
export function parse(source: string): Program {
  return parseGenerated(source) as Program;
}
