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

const KEYWORDS = new Set([
  'import',
  'namespace',
  'action',
  'body',
  'trigger',
  'on',
  'return',
  'break',
  'continue',
  'for',
  'in',
  'while',
  'if',
  'else',
  'enqueue',
  'with',
  'enum',
]);

/** Words that are keywords only inside an `import` (docs/adr/0006-imports.md). */
const IMPORT_KEYWORDS = /(?:into|as)(?![A-Za-z0-9_])/;

/** Operators spelled as words; they are matched as whole words only. */
const WORD_OPERATORS = new Set(['and', 'or']);

/** Operators spelled with symbols. Multi-character operators come first so they win over their prefixes. */
const SYMBOL_OPERATORS = /::|:=|<=|>=|==|!=|[<>+*\-\\!.]/;

/**
 * One piece of a string's text (docs/adr/0008-strings.md): an ordinary character, an escape, or
 * a `$` that does not start an interpolation. A `\` at the end of a line is allowed so that an
 * unfinished escape still belongs to the string; anywhere else it takes the next character with it.
 */
const TEXT = String.raw`(?:[^"\\$\r\n]|\\(?:[^\r\n]|(?=[\r\n]|$))|\$(?!\{))`;

const wordKind = (word: string): TokenKind => {
  if (KEYWORDS.has(word)) return 'keyword';
  if (WORD_OPERATORS.has(word)) return 'operator';
  return 'identifier';
};

/** Abandon any strings and interpolations that a line break has left unfinished. */
const resetAtLineBreak = (ctx: { state(): string; pop(): string; untag(tag: string): unknown }) => {
  while (ctx.state() !== 'default') ctx.pop();
  ctx.untag('import');
};

// Tokenizing uses a stack of states:
// - `default` is ordinary code;
// - `string` is the text of a template string after an interpolation has started;
// - `interpolation` is the code inside `${ ... }`, which may itself contain strings.
// The `import` tag is set from an `import` keyword to the end of its line.
// Rules are tried in order, and the first one that matches wins.
const CODE = 'default, default #import, interpolation, interpolation #import';
const lexer = new Tokenizr()
  .rule(CODE, /[ \t]+/, (ctx) => {
    ctx.ignore();
  })
  .rule(CODE, /\s+/, (ctx) => {
    resetAtLineBreak(ctx);
    ctx.ignore();
  })
  .rule('default #import, interpolation #import', IMPORT_KEYWORDS, (ctx) => {
    ctx.accept('keyword');
  })
  .rule(CODE, /[A-Za-z_][A-Za-z0-9_]*/, (ctx, match) => {
    if (match[0] === 'import') ctx.tag('import');
    ctx.accept(wordKind(match[0]));
  })
  // A string that is interrupted by an interpolation continues in the `string` state.
  .rule(CODE, new RegExp(`"${TEXT}*(?=\\$\\{)`), (ctx) => {
    ctx.accept('string');
    ctx.push('string');
  })
  // A string ends at its closing quote or, if that is missing, at the end of the line.
  .rule(CODE, new RegExp(`"${TEXT}*"?`), (ctx) => {
    ctx.accept('string');
  })
  .rule('interpolation, interpolation #import', /\}/, (ctx) => {
    ctx.accept('punctuation');
    ctx.pop();
  })
  .rule(CODE, SYMBOL_OPERATORS, (ctx) => {
    ctx.accept('operator');
  })
  // Anything else is a single character of punctuation, so tokenizing never fails.
  .rule(CODE, /./, (ctx) => {
    ctx.accept('punctuation');
  })
  .rule('string, string #import', /\$\{/, (ctx) => {
    ctx.accept('punctuation');
    ctx.push('interpolation');
  })
  .rule('string, string #import', new RegExp(`${TEXT}+(?=\\$\\{)`), (ctx) => {
    ctx.accept('string');
  })
  .rule('string, string #import', new RegExp(`${TEXT}*"|${TEXT}+`), (ctx) => {
    ctx.accept('string');
    ctx.pop();
  })
  .rule('string, string #import', /\r?\n/, (ctx) => {
    resetAtLineBreak(ctx);
    ctx.ignore();
  });

/**
 * Split Cant source into tokens. Whitespace is skipped, and no token spans a line break.
 *
 * A template string is split around its interpolations: `"a ${b} c"` is the string `"a `, the
 * punctuation `${`, the identifier `b`, the punctuation `}` and the string ` c"`.
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
