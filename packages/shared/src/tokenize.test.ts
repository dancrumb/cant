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
    'keyword:VOID',
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
  assert.deepEqual(describeTokens(':= < > <= >= + == != * / % - ! . **'), [
    'operator::=',
    'operator:<',
    'operator:>',
    'operator:<=',
    'operator:>=',
    'operator:+',
    'operator:==',
    'operator:!=',
    'operator:*',
    'operator:/',
    'operator:%',
    'operator:-',
    'operator:!',
    'operator:.',
    'operator:**',
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

test('skips comments, without reading // as two division operators', () => {
  assert.deepEqual(describeTokens('a / b // half of a\nc'), [
    'identifier:a',
    'operator:/',
    'identifier:b',
    'identifier:c',
  ]);
  assert.deepEqual(describeTokens('"a // b" // c'), ['string:"a // b"']);
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

test('tokenizes the keywords reserved by the ADRs', () => {
  const keywords = [
    'import', 'namespace', 'export', 'action', 'body', 'return', 'break', 'continue', 'for', 'in',
    'while', 'if', 'else', 'trigger', 'on', 'entity', 'permissions', 'TEXT', 'NUMBER', 'BOOLEAN',
    'DATE_TIME', 'FILE', 'VOID', 'NOTHING', 'true', 'false', 'enum', 'SET', 'delete', 'error',
    'ERROR', 'raise', 'pass', 'assert', 'model', 'UNKNOWN', 'const', 'relation', 'DURATION',
  ];
  assert.deepEqual(
    describeTokens(keywords.join(' ')),
    keywords.map((keyword) => `keyword:${keyword}`),
  );
});

test('tokenizes word operators', () => {
  assert.deepEqual(describeTokens('a orElse b; isEmpty c; d instanceOf T; ignore e; orElsewhere'), [
    'identifier:a',
    'operator:orElse',
    'identifier:b',
    'punctuation:;',
    'operator:isEmpty',
    'identifier:c',
    'punctuation:;',
    'identifier:d',
    'operator:instanceOf',
    'identifier:T',
    'punctuation:;',
    'operator:ignore',
    'identifier:e',
    'punctuation:;',
    'identifier:orElsewhere',
  ]);
});

test('tokenizes number literals', () => {
  assert.deepEqual(describeTokens('42 3.14 .5 5. 1e3 2.5E-4 1_000 0xFF 0o17 0b1010 -1 a[0]'), [
    'number:42',
    'number:3.14',
    'number:.5',
    'number:5.',
    'number:1e3',
    'number:2.5E-4',
    'number:1_000',
    'number:0xFF',
    'number:0o17',
    'number:0b1010',
    'operator:-',
    'number:1',
    'identifier:a',
    'punctuation:[',
    'number:0',
    'punctuation:]',
  ]);
});

test('tokenizes relations, with their cardinalities and ---', () => {
  assert.deepEqual(describeTokens('relation User[tasks] 1 --- 0..* Task[owner] 0..1 1..*'), [
    'keyword:relation',
    'identifier:User',
    'punctuation:[',
    'identifier:tasks',
    'punctuation:]',
    'number:1',
    'operator:---',
    'number:0..*',
    'identifier:Task',
    'punctuation:[',
    'identifier:owner',
    'punctuation:]',
    'number:0..1',
    'number:1..*',
  ]);
});

test('tokenizes built-in values', () => {
  assert.deepEqual(describeTokens('@subject is @anonymous; @message.user'), [
    'builtin:@subject',
    'keyword:is',
    'builtin:@anonymous',
    'punctuation:;',
    'builtin:@message',
    'operator:.',
    'identifier:user',
  ]);
});

test('tokenizes contextual keywords only where they are special', () => {
  const source = [
    'action A(raises: TEXT): VOID raises X passes @all',
    '    body',
    '        raise X with data',
    '        with := auth',
    'trigger A on Start',
    '    auth',
    '        @subject can "a" within org or @subject is admin within org',
    '    arguments',
    '        parameters := 1',
    '    parameters',
    '        auth := 2',
    'permissions org has admin',
    '    "a"',
    'entity User',
    '    subject',
    '    identity email',
    '    group org',
    '    role admin',
    '    models',
    '        models',
    '    expose',
    '        email as contactEmail',
    '    hide',
    '        passwordHash',
    'error E',
    '    data',
    '        data: TEXT',
    'error F',
    '    data FData',
    'action N(): VOID',
    '    native "./n.js"',
    'trigger N on TestCase',
    '    assertions',
    '        native, "assertions"',
    'entity Membership',
    '    membership user in organization with roles',
  ].join('\n');

  const keywords = describeTokens(source).filter((token) => token.startsWith('keyword:'));
  assert.deepEqual(keywords, [
    'keyword:action',
    'keyword:TEXT',
    'keyword:VOID',
    'keyword:raises',
    'keyword:passes',
    'keyword:body',
    'keyword:raise',
    'keyword:with',
    'keyword:trigger',
    'keyword:on',
    'keyword:auth',
    'keyword:can',
    'keyword:within',
    'keyword:is',
    'keyword:within',
    'keyword:arguments',
    'keyword:parameters',
    'keyword:permissions',
    'keyword:has',
    'keyword:entity',
    'keyword:subject',
    'keyword:identity',
    'keyword:group',
    'keyword:role',
    'keyword:models',
    'keyword:expose',
    'keyword:as',
    'keyword:hide',
    'keyword:error',
    'keyword:data',
    'keyword:TEXT',
    'keyword:error',
    'keyword:data',
    'keyword:action',
    'keyword:VOID',
    'keyword:native',
    'keyword:trigger',
    'keyword:on',
    'keyword:assertions',
    'keyword:entity',
    'keyword:membership',
    'keyword:in',
    'keyword:with',
  ]);
});

test('tokenizes DATE_TIME and DURATION literals', () => {
  assert.deepEqual(describeTokens('DATE_TIME("2026-11-21T09:30:00Z") + DURATION("PT1H")'), [
    'keyword:DATE_TIME',
    'punctuation:(',
    'string:"2026-11-21T09:30:00Z"',
    'punctuation:)',
    'operator:+',
    'keyword:DURATION',
    'punctuation:(',
    'string:"PT1H"',
    'punctuation:)',
  ]);
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
  assert.deepEqual(describeTokens('export a::F as G'), [
    'keyword:export',
    'identifier:a',
    'operator:::',
    'identifier:F',
    'keyword:as',
    'identifier:G',
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

test('ends an interpolation at its own closing brace, not one inside it', () => {
  assert.deepEqual(describeTokens('"a ${f({ b: { c: "${d}" } })} e" x'), [
    'string:"a ',
    'punctuation:${',
    'identifier:f',
    'punctuation:(',
    'punctuation:{',
    'identifier:b',
    'punctuation::',
    'punctuation:{',
    'identifier:c',
    'punctuation::',
    'string:"',
    'punctuation:${',
    'identifier:d',
    'punctuation:}',
    'string:"',
    'punctuation:}',
    'punctuation:}',
    'punctuation:)',
    'punctuation:}',
    'string: e"',
    'identifier:x',
  ]);
  assert.deepEqual(describeTokens('"${ { a: 1 }"\nx'), [
    'string:"',
    'punctuation:${',
    'punctuation:{',
    'identifier:a',
    'punctuation::',
    'number:1',
    'punctuation:}',
    'string:"',
    'identifier:x',
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
