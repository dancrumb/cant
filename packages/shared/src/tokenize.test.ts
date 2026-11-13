import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenize } from './tokenize.ts';

const describeTokens = (source: string): string[] =>
  tokenize(source).map(
    (token) => `${token.kind}:${source.slice(token.start, token.start + token.length)}`,
  );

test('tokenizes keywords, identifiers and punctuation', () => {
  assert.deepEqual(describeTokens('trigger SayHello on Start'), [
    'keyword:trigger',
    'identifier:SayHello',
    'keyword:on',
    'identifier:Start',
  ]);
  assert.deepEqual(describeTokens('action Say():VOID {}'), [
    'keyword:action',
    'identifier:Say',
    'punctuation:(',
    'punctuation:)',
    'punctuation::',
    'identifier:VOID',
    'punctuation:{',
    'punctuation:}',
  ]);
});

test('does not treat keywords inside strings or identifiers as keywords', () => {
  assert.deepEqual(describeTokens('write("on import"); onStart'), [
    'identifier:write',
    'punctuation:(',
    'string:"on import"',
    'punctuation:)',
    'punctuation:;',
    'identifier:onStart',
  ]);
});

test('ends an unterminated string at the end of the line', () => {
  assert.deepEqual(describeTokens('"open\nimport IO'), [
    'string:"open',
    'keyword:import',
    'identifier:IO',
  ]);
});

test('reports offsets into the source', () => {
  assert.deepEqual(tokenize('  import IO'), [
    { kind: 'keyword', start: 2, length: 6 },
    { kind: 'identifier', start: 9, length: 2 },
  ]);
});
