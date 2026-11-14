import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenize } from './tokenize.ts';

const describeTokens = (source: string): string[] =>
  tokenize(source).map(
    (token) =>
      `${token.kind}:${source.slice(token.position.start.offset, token.position.end.offset)}`,
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

test('reports positions in the source', () => {
  assert.deepEqual(tokenize('  import IO\nx'), [
    {
      kind: 'keyword',
      position: {
        start: { line: 1, column: 3, offset: 2 },
        end: { line: 1, column: 9, offset: 8 },
      },
    },
    {
      kind: 'identifier',
      position: {
        start: { line: 1, column: 10, offset: 9 },
        end: { line: 1, column: 12, offset: 11 },
      },
    },
    {
      kind: 'identifier',
      position: {
        start: { line: 2, column: 1, offset: 12 },
        end: { line: 2, column: 2, offset: 13 },
      },
    },
  ]);
});

test('tokenizes symbol operators, preferring the longest match', () => {
  assert.deepEqual(describeTokens(':= < > <= => + == * - \\ ! .'), [
    'operator::=',
    'operator:<',
    'operator:>',
    'operator:<=',
    'operator:=>',
    'operator:+',
    'operator:==',
    'operator:*',
    'operator:-',
    'operator:\\',
    'operator:!',
    'operator:.',
  ]);
  assert.deepEqual(describeTokens('x:=a.b<=c'), [
    'identifier:x',
    'operator::=',
    'identifier:a',
    'operator:.',
    'identifier:b',
    'operator:<=',
    'identifier:c',
  ]);
});

test('tokenizes and and or as operators only when they are whole words', () => {
  assert.deepEqual(describeTokens('a and b or !c; android order'), [
    'identifier:a',
    'operator:and',
    'identifier:b',
    'operator:or',
    'operator:!',
    'identifier:c',
    'punctuation:;',
    'identifier:android',
    'identifier:order',
  ]);
});

test('tokenizes the namespace keyword and the :: scope operator', () => {
  assert.deepEqual(describeTokens('namespace __main__\nnameSpace::symbolName'), [
    'keyword:namespace',
    'identifier:__main__',
    'identifier:nameSpace',
    'operator:::',
    'identifier:symbolName',
  ]);
  assert.deepEqual(describeTokens('a:::=b'), [
    'identifier:a',
    'operator:::',
    'operator::=',
    'identifier:b',
  ]);
});

test('leaves a lone colon or equals sign as punctuation', () => {
  assert.deepEqual(describeTokens('a: b = c'), [
    'identifier:a',
    'punctuation::',
    'identifier:b',
    'punctuation:=',
    'identifier:c',
  ]);
});

test('tokenizes the keywords from the actions ADR', () => {
  assert.deepEqual(
    describeTokens(
      'action body return break continue for in while if else enqueue queue with enum',
    ),
    [
      'keyword:action',
      'keyword:body',
      'keyword:return',
      'keyword:break',
      'keyword:continue',
      'keyword:for',
      'keyword:in',
      'keyword:while',
      'keyword:if',
      'keyword:else',
      'keyword:enqueue',
      'keyword:queue',
      'keyword:with',
      'keyword:enum',
    ],
  );
});

test('tokenizes into and as as keywords only on an import line', () => {
  assert.deepEqual(describeTokens('import "./a.json" into a as "json"\ninto as'), [
    'keyword:import',
    'string:"./a.json"',
    'keyword:into',
    'identifier:a',
    'keyword:as',
    'string:"json"',
    'identifier:into',
    'identifier:as',
  ]);
});

test('keeps escapes and lone dollar signs inside strings', () => {
  assert.deepEqual(describeTokens(String.raw`"a\"b\${c} $5" x`), [
    String.raw`string:"a\"b\${c} $5"`,
    'identifier:x',
  ]);
});

test('splits template strings around their interpolations', () => {
  assert.deepEqual(describeTokens('"Hello, ${name}! ${greet("you")}" x'), [
    'string:"Hello, ',
    'punctuation:${',
    'identifier:name',
    'punctuation:}',
    'string:! ',
    'punctuation:${',
    'identifier:greet',
    'punctuation:(',
    'string:"you"',
    'punctuation:)',
    'punctuation:}',
    'string:"',
    'identifier:x',
  ]);
  assert.deepEqual(describeTokens('"${a}${b}"'), [
    'string:"',
    'punctuation:${',
    'identifier:a',
    'punctuation:}',
    'punctuation:${',
    'identifier:b',
    'punctuation:}',
    'string:"',
  ]);
});

test('ends unfinished template strings and interpolations at the end of the line', () => {
  assert.deepEqual(describeTokens('"a ${b} c\nimport x\n"d ${e\nf'), [
    'string:"a ',
    'punctuation:${',
    'identifier:b',
    'punctuation:}',
    'string: c',
    'keyword:import',
    'identifier:x',
    'string:"d ',
    'punctuation:${',
    'identifier:e',
    'identifier:f',
  ]);
  assert.deepEqual(describeTokens('"a ${b}\nc'), [
    'string:"a ',
    'punctuation:${',
    'identifier:b',
    'punctuation:}',
    'identifier:c',
  ]);
});
