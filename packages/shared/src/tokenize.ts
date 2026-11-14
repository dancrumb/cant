import { Tokenizr } from 'tokenizr';
import type { Position } from 'unist';

export type TokenKind = 'keyword' | 'identifier' | 'operator' | 'string' | 'punctuation';

export interface Token {
  kind: TokenKind;
  /**
   * Where the token is in the source. Lines and columns are 1-based and offsets are 0-based,
   * as in unist; `end` is just past the token's last character.
   */
  position: Position;
}

const KEYWORDS = new Set(['import', 'action', 'trigger', 'on']);

/** Operators spelled as words; they are matched as whole words only. */
const WORD_OPERATORS = new Set(['and', 'or']);

/** Operators spelled with symbols. Multi-character operators come first so they win over their prefixes. */
const SYMBOL_OPERATORS = /:=|<=|=>|==|[<>+*\-\\!.]/;

const wordKind = (word: string): TokenKind => {
  if (KEYWORDS.has(word)) return 'keyword';
  if (WORD_OPERATORS.has(word)) return 'operator';
  return 'identifier';
};

// Rules are tried in order, and the first one that matches wins.
const lexer = new Tokenizr()
  .rule(/\s+/, (ctx) => {
    ctx.ignore();
  })
  .rule(/[A-Za-z_][A-Za-z0-9_]*/, (ctx, match) => {
    ctx.accept(wordKind(match[0]));
  })
  // A string ends at its closing quote or, if that is missing, at the end of the line.
  .rule(/"[^"\n]*"?/, (ctx) => {
    ctx.accept('string');
  })
  .rule(SYMBOL_OPERATORS, (ctx) => {
    ctx.accept('operator');
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
      // No token spans a line break, so the token ends on the line it starts on.
      position: {
        start: { line: token.line, column: token.column, offset: token.pos },
        end: {
          line: token.line,
          column: token.column + token.text.length,
          offset: token.pos + token.text.length,
        },
      },
    }));
}
