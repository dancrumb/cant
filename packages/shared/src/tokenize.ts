import { Tokenizr } from 'tokenizr';

export type TokenKind = 'keyword' | 'identifier' | 'string' | 'punctuation';

export interface Token {
  kind: TokenKind;
  /** Offset of the token's first character in the source. */
  start: number;
  length: number;
}

const KEYWORDS = new Set(['import', 'action', 'trigger', 'on']);

// Rules are tried in order, and the first one that matches wins.
const lexer = new Tokenizr()
  .rule(/\s+/, (ctx) => {
    ctx.ignore();
  })
  .rule(/[A-Za-z_][A-Za-z0-9_]*/, (ctx, match) => {
    ctx.accept(KEYWORDS.has(match[0]) ? 'keyword' : 'identifier');
  })
  // A string ends at its closing quote or, if that is missing, at the end of the line.
  .rule(/"[^"\n]*"?/, (ctx) => {
    ctx.accept('string');
  })
  // Anything else is a single character of punctuation, so tokenizing never fails.
  .rule(/./, (ctx) => {
    ctx.accept('punctuation');
  });

/**
 * Split Cant source into tokens. Whitespace is skipped, and no token spans a line break.
 */
export function tokenize(source: string): Token[] {
  return lexer
    .reset()
    .input(source)
    .tokens()
    .filter((token) => token.type !== 'EOF')
    .map((token) => ({
      kind: token.type as TokenKind,
      start: token.pos,
      length: token.text.length,
    }));
}
