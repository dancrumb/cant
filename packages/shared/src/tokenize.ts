export type TokenKind = 'keyword' | 'identifier' | 'string' | 'punctuation';

export interface Token {
  kind: TokenKind;
  /** Offset of the token's first character in the source. */
  start: number;
  length: number;
}

const KEYWORDS = new Set(['import', 'action', 'trigger', 'on']);

const WHITESPACE = /\s+/y;
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/y;
// A string ends at its closing quote or, if that is missing, at the end of the line.
const STRING = /"[^"\n]*"?/y;

const matchAt = (pattern: RegExp, source: string, offset: number): string | undefined => {
  pattern.lastIndex = offset;
  return pattern.exec(source)?.[0];
};

/**
 * Split Cant source into tokens. Whitespace is skipped, and no token spans a line break.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < source.length) {
    const whitespace = matchAt(WHITESPACE, source, offset);
    if (whitespace !== undefined) {
      offset += whitespace.length;
      continue;
    }

    const identifier = matchAt(IDENTIFIER, source, offset);
    const text = identifier ?? matchAt(STRING, source, offset);
    const length = text?.length ?? 1;

    let kind: TokenKind = 'punctuation';
    if (identifier !== undefined) {
      kind = KEYWORDS.has(identifier) ? 'keyword' : 'identifier';
    } else if (text !== undefined) {
      kind = 'string';
    }

    tokens.push({ kind, start: offset, length });
    offset += length;
  }

  return tokens;
}
