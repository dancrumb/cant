import { Tokenizr } from 'tokenizr';
import type { Position } from 'unist';

export type TokenKind =
  | 'keyword'
  | 'identifier'
  | 'operator'
  | 'string'
  | 'number'
  | 'builtin'
  | 'punctuation';

export interface Token {
  kind: TokenKind;
  /**
   * Where the token is in the source. Lines and columns are 1-based and offsets are 0-based,
   * as in unist; `end` is just past the token's last character.
   */
  position: Position;
}

/**
 * Words reserved everywhere. A program cannot use them as names. Each comes from the ADR that
 * introduced it, in docs/adr.
 */
const KEYWORDS = new Set([
  // 0005, 0006
  'import',
  'namespace',
  'export',
  // 0007
  'action',
  'body',
  'return',
  'break',
  'continue',
  'for',
  'in',
  'while',
  'if',
  'else',
  // 0009
  'trigger',
  'on',
  // 0010
  'entity',
  'permissions',
  // 0012, 0019
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'DATE_TIME',
  'FILE',
  // 0026
  'DURATION',
  'VOID',
  'NOTHING',
  'true',
  'false',
  // 0013
  'enum',
  // 0021
  'SET',
  'delete',
  // 0023
  'error',
  'ERROR',
  'raise',
  'pass',
  'assert',
  // 0027
  'model',
  // 0033
  'UNKNOWN',
  // 0034
  'const',
  // 0035
  'relation',
]);

/** Operators spelled as words; they are matched as whole words only (0016, 0019, 0023, 0033). */
const WORD_OPERATORS = new Set(['and', 'or', 'orElse', 'isEmpty', 'instanceOf', 'ignore']);

/** Operators spelled with symbols. Multi-character operators come first so they win over their prefixes. */
const SYMBOL_OPERATORS = /---|::|:=|<=|>=|==|!=|\*\*|[<>+*\-/%!.]/;

/** A JavaScript number literal (docs/adr/0019-operators.md). It never starts with a sign. */
const NUMBER = new RegExp(
  [
    String.raw`0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*`,
    String.raw`0[oO][0-7](?:_?[0-7])*`,
    String.raw`0[bB][01](?:_?[01])*`,
    String.raw`(?:(?:0|[1-9](?:_?[0-9])*)(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?`,
  ]
    .map((alternative) => `(?:${alternative})`)
    .join('|') + '(?![A-Za-z0-9_])',
);

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
const resetAtLineBreak = (ctx: { state(): string; pop(): string }) => {
  while (ctx.state() !== 'default') ctx.pop();
};

// Tokenizing uses a stack of states:
// - `default` is ordinary code;
// - `string` is the text of a template string after an interpolation has started;
// - `interpolation` is the code inside `${ ... }`, which may itself contain strings;
// - `braces` is the code inside a `{ ... }` within an interpolation, such as an object value,
//   whose `}` closes the braces rather than the interpolation.
// Rules are tried in order, and the first one that matches wins.
const CODE = 'default, interpolation, braces';
const lexer = new Tokenizr()
  .rule(CODE, /[ \t]+/, (ctx) => {
    ctx.ignore();
  })
  .rule(CODE, /\s+/, (ctx) => {
    resetAtLineBreak(ctx);
    ctx.ignore();
  })
  // A comment runs from `//` to the end of the line (docs/adr/0007-actions.md). It comes before
  // the operators so that `//` is not read as two `/` operators.
  .rule(CODE, /\/\/[^\r\n]*/, (ctx) => {
    ctx.ignore();
  })
  .rule(CODE, /[A-Za-z_][A-Za-z0-9_]*/, (ctx, match) => {
    ctx.accept(wordKind(match[0]));
  })
  // A built-in value, such as `@subject` (docs/adr/0009-triggers.md).
  .rule(CODE, /@[A-Za-z_][A-Za-z0-9_]*/, (ctx) => {
    ctx.accept('builtin');
  })
  // A relation's cardinality, such as `0..*` (docs/adr/0035-entity-relationships.md). It comes
  // before numbers so that `0..1` is not read as the number `0.` and then `.1`.
  .rule(CODE, /[01]\.\.[1*]/, (ctx) => {
    ctx.accept('number');
  })
  .rule(CODE, NUMBER, (ctx) => {
    ctx.accept('number');
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
  // Inside an interpolation, braces nest, and only the `}` that matches `${` ends it.
  .rule('interpolation, braces', /\{/, (ctx) => {
    ctx.accept('punctuation');
    ctx.push('braces');
  })
  .rule('interpolation, braces', /\}/, (ctx) => {
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
  .rule('string', /\$\{/, (ctx) => {
    ctx.accept('punctuation');
    ctx.push('interpolation');
  })
  .rule('string', new RegExp(`${TEXT}+(?=\\$\\{)`), (ctx) => {
    ctx.accept('string');
  })
  .rule('string', new RegExp(`${TEXT}*"|${TEXT}+`), (ctx) => {
    ctx.accept('string');
    ctx.pop();
  })
  .rule('string', /\r?\n/, (ctx) => {
    resetAtLineBreak(ctx);
    ctx.ignore();
  });

interface RawToken {
  kind: TokenKind;
  text: string;
  line: number;
  column: number;
  offset: number;
}

/** Block headers that stand alone on their line, and the declaration whose block they are in. */
const BLOCK_HEADERS: Record<string, Set<string>> = {
  trigger: new Set(['arguments', 'auth', 'parameters', 'assertions']), // 0009, 0025, 0037
  entity: new Set(['subject', 'models', 'expose', 'hide']), // 0010, 0022
  error: new Set(['data']), // 0023
};

/** Lines inside a declaration's block that start with a contextual keyword followed by more. */
const LINE_STARTS: Record<string, Set<string>> = {
  action: new Set(['native']), // 0036
  entity: new Set(['identity', 'group', 'role', 'membership']), // 0010, 0032
  error: new Set(['data']), // 0023
};

const isWord = (token: RawToken | undefined, ...words: string[]): boolean =>
  token?.kind === 'identifier' && words.includes(token.text);

const markKeyword = (token: RawToken | undefined): void => {
  if (token !== undefined) token.kind = 'keyword';
};

/**
 * Mark the words that are keywords only in one place, such as `into` in an import or `auth` in
 * a trigger's block. Elsewhere they stay identifiers. Each line is looked at with the
 * declaration it belongs to: the one started by the last line that begins in the first column.
 */
const markContextualKeywords = (tokens: RawToken[]): void => {
  let declaration = '';
  // The column of the declaration's block: the indentation of its first indented line.
  let blockColumn: number | undefined;

  const lines = new Map<number, RawToken[]>();
  for (const token of tokens) {
    const line = lines.get(token.line);
    if (line === undefined) lines.set(token.line, [token]);
    else line.push(token);
  }

  for (const line of lines.values()) {
    const [first] = line;
    if (first === undefined) continue;

    if (first.column === 1) {
      const head = first.text === 'export' ? line[1] : first;
      declaration = head?.kind === 'keyword' ? head.text : '';
      blockColumn = undefined;
    } else {
      blockColumn ??= first.column;
    }

    // 0006: `into` and `as` on an import line.
    if (first.text === 'import' && first.kind === 'keyword') {
      for (const token of line.slice(1)) if (isWord(token, 'into', 'as')) markKeyword(token);
    }
    // 0006: `as` in a re-export, `export accounts::FindUser as LookupUser`.
    if (first.text === 'export' && first.kind === 'keyword') {
      for (const token of line.slice(2)) if (isWord(token, 'as')) markKeyword(token);
    }

    if (first.column === 1) {
      // 0023: `raises` and `passes` after an action's parameter list.
      if (declaration === 'action') {
        let depth = 0;
        let closed = false;
        for (const token of line) {
          if (token.text === '(') depth += 1;
          if (token.text === ')') {
            depth -= 1;
            if (depth === 0) closed = true;
          }
          if (closed && depth === 0 && isWord(token, 'raises', 'passes')) markKeyword(token);
        }
      }
      // 0010: `permissions <group> has <role>`.
      if (declaration === 'permissions' && isWord(line[2], 'has')) markKeyword(line[2]);
    } else if (first.column === blockColumn) {
      if (line.length === 1 && BLOCK_HEADERS[declaration]?.has(first.text) === true) {
        markKeyword(first);
      }
      if (line.length > 1 && LINE_STARTS[declaration]?.has(first.text) === true) {
        markKeyword(first);
        // 0032: `with` in `membership user in organization with roles`.
        if (first.text === 'membership' && isWord(line[4], 'with')) markKeyword(line[4]);
      }
    } else if (declaration === 'entity' && line.length === 3 && isWord(line[1], 'as')) {
      // 0022: `field as name` in an entity's `expose` block.
      markKeyword(line[1]);
    }

    for (const [index, token] of line.entries()) {
      // 0023: `raise <error> with <value>`.
      if (token.text === 'raise' && token.kind === 'keyword') {
        const name = line[index + 1]?.text === '::' ? index + 3 : index + 1;
        if (isWord(line[name + 1], 'with')) markKeyword(line[name + 1]);
      }
      // 0010: `@subject can ...` and `@subject is ...`, each with an optional `within`.
      if (token.text === '@subject' && isWord(line[index + 1], 'can', 'is')) {
        markKeyword(line[index + 1]);
        for (const later of line.slice(index + 2, index + 5)) {
          if (isWord(later, 'within')) markKeyword(later);
        }
      }
    }
  }
};

/**
 * Split Cant source into tokens. Whitespace and comments are skipped, and no token spans a line break.
 *
 * A template string is split around its interpolations: `"a ${b} c"` is the string `"a `, the
 * punctuation `${`, the identifier `b`, the punctuation `}` and the string ` c"`.
 *
 * Words that are keywords only in one place, such as `auth` in a trigger's block, are keywords
 * there and identifiers elsewhere.
 */
export function tokenize(source: string): Token[] {
  const tokens: RawToken[] = lexer
    .reset()
    .input(source)
    .tokens()
    .filter((token) => token.type !== 'EOF')
    .map((token) => ({
      kind: token.type as TokenKind,
      text: token.text,
      line: token.line,
      column: token.column,
      offset: token.pos,
    }));

  markContextualKeywords(tokens);

  return tokens.map(({ kind, text, line, column, offset }) => ({
    kind,
    // No token spans a line break, so the token ends on the line it starts on.
    position: {
      start: { line, column, offset },
      end: { line, column: column + text.length, offset: offset + text.length },
    },
  }));
}
