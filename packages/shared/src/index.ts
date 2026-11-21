export function cant(): string {
  return 'cant';
}

export { KEYWORDS, tokenize } from './tokenize.ts';
export type { Token, TokenKind } from './tokenize.ts';

export { parse, ParseError } from './parse.ts';
export type * from './ast.ts';
