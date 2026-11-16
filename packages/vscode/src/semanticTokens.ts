import { tokenize } from '@dancrumb/cant-shared';
import type { TokenKind } from '@dancrumb/cant-shared';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

/** The semantic token types this extension reports, in legend order. */
export const TOKEN_TYPES = ['keyword', 'string', 'variable', 'operator', 'number'] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export interface SemanticToken {
  type: TokenType;
  /** Offset of the token's first character in the document. */
  start: number;
  length: number;
}

/** Markdown code block languages whose contents are highlighted as Cant. */
const CANT_BLOCK_LANGUAGES = new Set(['cant', 'cant-example']);

const CLOSING_FENCE = /^\s*(`{3,}|~{3,})\s*$/;

// Punctuation is left to the editor's default colouring.
const TOKEN_TYPE_BY_KIND: Partial<Record<TokenKind, TokenType>> = {
  keyword: 'keyword',
  string: 'string',
  identifier: 'variable',
  operator: 'operator',
  number: 'number',
  // Built-in values, such as `@subject`, are values the language provides.
  builtin: 'variable',
};

const cantTokens = (source: string, sourceOffset: number): SemanticToken[] =>
  tokenize(source).flatMap((token) => {
    const type = TOKEN_TYPE_BY_KIND[token.kind];
    const { start, end } = token.position;
    if (type === undefined || start.offset === undefined || end.offset === undefined) return [];
    return [{ type, start: sourceOffset + start.offset, length: end.offset - start.offset }];
  });

interface Region {
  start: number;
  end: number;
}

/** Find the contents (without the fences) of each Cant code block in a Markdown document. */
const cantBlocks = (markdown: string): Region[] => {
  const regions: Region[] = [];

  visit(unified().use(remarkParse).parse(markdown), 'code', (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (node.lang == null || !CANT_BLOCK_LANGUAGES.has(node.lang)) return;

    const block = markdown.slice(start, end);
    const openingFenceEnd = block.indexOf('\n');
    if (openingFenceEnd === -1) return;

    // A block that runs to the end of the document has no closing fence to leave out.
    const lastLineStart = block.lastIndexOf('\n') + 1;
    const isClosed = CLOSING_FENCE.test(block.slice(lastLineStart));

    regions.push({
      start: start + openingFenceEnd + 1,
      end: isClosed ? start + lastLineStart : end,
    });
  });

  return regions;
};

/**
 * The semantic tokens for a document: the whole document for Cant, or just the
 * `cant` and `cant-example` code blocks for Markdown.
 */
export function semanticTokens(text: string, languageId: string): SemanticToken[] {
  if (languageId === 'markdown') {
    return cantBlocks(text).flatMap((region) =>
      cantTokens(text.slice(region.start, region.end), region.start),
    );
  }
  return cantTokens(text, 0);
}
