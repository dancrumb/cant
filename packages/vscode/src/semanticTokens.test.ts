import assert from 'node:assert/strict';
import { test } from 'node:test';
import { semanticTokens } from './semanticTokens.ts';

const describeTokens = (text: string, languageId: string): string[] =>
  semanticTokens(text, languageId).map(
    (token) => `${token.type}:${text.slice(token.start, token.start + token.length)}`,
  );

test('tokenizes a whole Cant document', () => {
  assert.deepEqual(describeTokens('import IO\nwrite("hi");', 'cant'), [
    'keyword:import',
    'variable:IO',
    'variable:write',
    'string:"hi"',
  ]);
});

test('tokenizes only cant and cant-example code blocks in Markdown', () => {
  const markdown = [
    '# Title',
    '',
    'Prose that mentions import.',
    '',
    '```cant',
    'import IO',
    '```',
    '',
    '```sh',
    'import ignored',
    '```',
    '',
    '~~~cant-example',
    'trigger Say on Start',
    '~~~',
  ].join('\n');

  assert.deepEqual(describeTokens(markdown, 'markdown'), [
    'keyword:import',
    'variable:IO',
    'keyword:trigger',
    'variable:Say',
    'keyword:on',
    'variable:Start',
  ]);
});

test('tokenizes indented and unclosed code blocks', () => {
  const markdown = ['- item', '', '  ```cant', '  import A', '  ```', '', '```cant', 'import B'].join(
    '\n',
  );

  assert.deepEqual(describeTokens(markdown, 'markdown'), [
    'keyword:import',
    'variable:A',
    'keyword:import',
    'variable:B',
  ]);
});

test('reports no tokens for an empty code block', () => {
  assert.deepEqual(describeTokens('```cant\n```', 'markdown'), []);
});

test('reports operators', () => {
  assert.deepEqual(describeTokens('x := a and b', 'cant'), [
    'variable:x',
    'operator::=',
    'variable:a',
    'operator:and',
    'variable:b',
  ]);
});

test('reports numbers and built-in values', () => {
  assert.deepEqual(describeTokens('total := 1.5 and @subject', 'cant'), [
    'variable:total',
    'operator::=',
    'number:1.5',
    'operator:and',
    'variable:@subject',
  ]);
});
