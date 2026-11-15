import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionDeclaration } from './ast.ts';
import { parse, ParseError } from './parse.ts';

/** Copy a tree without its `position` fields, so tests can compare just its shape. */
const withoutPositions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutPositions);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'position')
      .map(([key, child]) => [key, withoutPositions(child)]),
  );
};

const identifier = (value: string) => ({ type: 'identifier', value });
const moduleName = (name: string) => ({
  type: 'moduleName',
  name: identifier(name),
});
const string = (value: string) => ({
  type: 'string',
  parts: value === '' ? [] : [{ type: 'text', value }],
});

/** Parse a single action and return it. */
const parseAction = (source: string): ActionDeclaration => {
  const [action] = parse(source).children;
  assert.equal(action?.type, 'action');
  return action;
};

/** Parse statements as the body of an action, and return them without positions. */
const parseBody = (...lines: string[]): unknown =>
  withoutPositions(
    parseAction(['action A():VOID', '  body', ...lines.map((line) => `    ${line}`)].join('\n'))
      .children,
  );

const statement = (expression: unknown) => ({
  type: 'expressionStatement',
  expression,
});

test('parses the hello world example', () => {
  const source = [
    'import IO',
    '',
    'action SayHello():VOID',
    '    body',
    '        IO::stdout.write("Hello World!")',
    '',
    'trigger SayHello on Start',
  ].join('\n');

  assert.deepEqual(withoutPositions(parse(source)), {
    type: 'program',
    children: [
      { type: 'import', module: moduleName('IO') },
      {
        type: 'action',
        name: identifier('SayHello'),
        parameters: [],
        returnType: identifier('VOID'),
        nullable: false,
        children: [
          statement({
            type: 'call',
            callee: {
              type: 'member',
              object: {
                type: 'qualifiedIdentifier',
                namespace: identifier('IO'),
                name: identifier('stdout'),
              },
              property: identifier('write'),
            },
            arguments: [string('Hello World!')],
          }),
        ],
      },
      {
        type: 'trigger',
        action: identifier('SayHello'),
        event: identifier('Start'),
      },
    ],
  });
});

test('parses an empty program', () => {
  assert.deepEqual(withoutPositions(parse('  \n ')), {
    type: 'program',
    children: [],
  });
});

test('allows blank lines and trailing whitespace anywhere', () => {
  const program = parse('\n\nimport IO  \n\n  \naction A():VOID\n\n  body  \n\n    f()\n\n');
  assert.deepEqual(
    program.children.map((declaration) => declaration.type),
    ['import', 'action'],
  );
});

test('requires top-level declarations to start in the first column', () => {
  assert.throws(() => parse('  import IO'), ParseError);
  assert.throws(() => parse('import IO\n  import Other'), ParseError);
});

// ----- Actions -----

test('parses action signatures', () => {
  const action = parseAction(
    [
      'action Greet(name: String, greeting?: String := "Hello, ", tone: enum("warm", "dry")): accounts::Greeting?',
      '  body',
      '    return greeting',
    ].join('\n'),
  );

  assert.deepEqual(withoutPositions({ ...action, children: [] }), {
    type: 'action',
    name: identifier('Greet'),
    parameters: [
      {
        type: 'parameter',
        name: identifier('name'),
        optional: false,
        valueType: identifier('String'),
      },
      {
        type: 'parameter',
        name: identifier('greeting'),
        optional: true,
        valueType: identifier('String'),
        defaultValue: string('Hello, '),
      },
      {
        type: 'parameter',
        name: identifier('tone'),
        optional: false,
        valueType: { type: 'enum', values: [string('warm'), string('dry')] },
      },
    ],
    returnType: {
      type: 'qualifiedIdentifier',
      namespace: identifier('accounts'),
      name: identifier('Greeting'),
    },
    nullable: true,
    children: [],
  });
});

test('requires an action to have an indented body', () => {
  assert.throws(() => parse('action A():VOID'), ParseError);
  assert.throws(() => parse('action A():VOID\nbody\n  f()'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n  f()'), ParseError);
});

test('rejects statements that are not indented consistently', () => {
  assert.throws(() => parse('action A():VOID\n  body\n    f()\n      g()'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    f()\n   g()'), ParseError);
});

test('rejects blocks delimited by braces', () => {
  assert.throws(() => parse('action A():VOID { f() }'), ParseError);
  assert.throws(() => parse('action A():VOID {\n  f()\n}'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body {\n    f()\n  }'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    if a {\n      f()\n    }'), ParseError);
});

test('parses calls with several arguments and chained calls', () => {
  assert.deepEqual(parseBody('f("a", b)(c)'), [
    statement({
      type: 'call',
      callee: {
        type: 'call',
        callee: identifier('f'),
        arguments: [string('a'), identifier('b')],
      },
      arguments: [identifier('c')],
    }),
  ]);
});

test('parses return, break and continue', () => {
  assert.deepEqual(parseBody('return x', 'break', 'continue'), [
    { type: 'return', argument: identifier('x') },
    { type: 'break' },
    { type: 'continue' },
  ]);
});

test('parses for and while loops with nested blocks', () => {
  assert.deepEqual(parseBody('for item in items', '  while ready', '    f(item)', '  g()', 'h()'), [
    {
      type: 'for',
      variable: identifier('item'),
      iterable: identifier('items'),
      children: [
        {
          type: 'while',
          test: identifier('ready'),
          children: [
            statement({
              type: 'call',
              callee: identifier('f'),
              arguments: [identifier('item')],
            }),
          ],
        },
        statement({ type: 'call', callee: identifier('g'), arguments: [] }),
      ],
    },
    statement({ type: 'call', callee: identifier('h'), arguments: [] }),
  ]);
});

test('parses if, else if and else', () => {
  const call = (name: string) =>
    statement({ type: 'call', callee: identifier(name), arguments: [] });
  const block = (...children: unknown[]) => ({ type: 'block', children });

  assert.deepEqual(parseBody('if a', '  f()', 'else if b', '  g()', 'else', '  h()'), [
    {
      type: 'if',
      test: identifier('a'),
      children: [
        block(call('f')),
        {
          type: 'if',
          test: identifier('b'),
          children: [block(call('g')), block(call('h'))],
        },
      ],
    },
  ]);
  assert.deepEqual(parseBody('if a', '  f()', 'g()'), [
    { type: 'if', test: identifier('a'), children: [block(call('f'))] },
    call('g'),
  ]);
});

test('spans a block from its first statement to its last', () => {
  const [ifStatement] = parseAction(
    'action A():VOID\n  body\n    if a\n      f()\n      g()',
  ).children;
  assert.equal(ifStatement?.type, 'if');
  assert.deepEqual(ifStatement.children[0].position, {
    start: { line: 4, column: 7, offset: 38 },
    end: { line: 5, column: 10, offset: 51 },
  });
});

test('gives every node a unist position', () => {
  const program = parse('import IO\ntrigger Go on Start');
  const [, trigger] = program.children;

  assert.deepEqual(program.position, {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 2, column: 20, offset: 29 },
  });
  assert.equal(trigger?.type, 'trigger');
  assert.deepEqual(trigger.position, {
    start: { line: 2, column: 1, offset: 10 },
    end: { line: 2, column: 20, offset: 29 },
  });
  assert.deepEqual(trigger.event.position, {
    start: { line: 2, column: 15, offset: 24 },
    end: { line: 2, column: 20, offset: 29 },
  });
});

test('spans a member expression from its object to its property', () => {
  const [statement] = parseAction('action A():VOID\n  body\n    user.email').children;
  assert.equal(statement?.type, 'expressionStatement');
  assert.deepEqual(statement.expression.position, {
    start: { line: 3, column: 5, offset: 27 },
    end: { line: 3, column: 15, offset: 37 },
  });
});

// ----- Keywords -----

test('accepts identifiers that start with a keyword', () => {
  assert.deepEqual(withoutPositions(parse('import onStart').children), [
    { type: 'import', module: moduleName('onStart') },
  ]);
});

test('rejects a keyword used as an identifier, reporting where', () => {
  assert.throws(
    () => parse('import IO\ntrigger on on Start'),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.deepEqual(error.location.start, {
        line: 2,
        column: 9,
        offset: 18,
      });
      return true;
    },
  );
});

// ----- Imports and namespaces -----

test('parses symbolic imports with and without a scope', () => {
  assert.deepEqual(withoutPositions(parse('import IO\nimport acme::Http').children), [
    { type: 'import', module: moduleName('IO') },
    {
      type: 'import',
      module: {
        type: 'moduleName',
        scope: identifier('acme'),
        name: identifier('Http'),
      },
    },
  ]);
});

test('parses URL imports with into and as', () => {
  assert.deepEqual(
    withoutPositions(parse('import "./config.json" into config as "json"').children),
    [
      {
        type: 'import',
        module: string('./config.json'),
        namespace: identifier('config'),
        moduleType: string('json'),
      },
    ],
  );
  assert.deepEqual(withoutPositions(parse('import IO as "cant"').children), [
    { type: 'import', module: moduleName('IO'), moduleType: string('cant') },
  ]);
});

test('rejects interpolation in strings that must be constant', () => {
  assert.throws(() => parse('import "./${name}.cant"'), ParseError);
  assert.throws(() => parse('import IO as "${kind}"'), ParseError);
});

test('lets into and as be identifiers outside imports', () => {
  assert.deepEqual(withoutPositions(parse('import into into as').children), [
    { type: 'import', module: moduleName('into'), namespace: identifier('as') },
  ]);
});

test('parses namespace declarations', () => {
  assert.deepEqual(withoutPositions(parse('namespace Greetings\nnamespace __main__').children), [
    { type: 'namespace', name: identifier('Greetings') },
    { type: 'namespace', name: identifier('__main__') },
  ]);
  assert.throws(() => parse('namespace namespace'), ParseError);
});

test('parses namespace-qualified references in expressions', () => {
  assert.deepEqual(parseBody('io::write("hi")'), [
    statement({
      type: 'call',
      callee: {
        type: 'qualifiedIdentifier',
        namespace: identifier('io'),
        name: identifier('write'),
      },
      arguments: [string('hi')],
    }),
  ]);
});

// ----- Strings -----

/** Parse a string literal as the argument of a call, and return it without positions. */
const parseString = (literal: string): unknown => {
  const [statement] = parseAction(`action A():VOID\n  body\n    f(${literal})`).children;
  assert.equal(statement?.type, 'expressionStatement');
  assert.equal(statement.expression.type, 'call');
  return withoutPositions(statement.expression.arguments[0]);
};

test('parses an empty string', () => {
  assert.deepEqual(parseString('""'), string(''));
});

test('decodes escape sequences', () => {
  assert.deepEqual(
    parseString(String.raw`"a\"b\\c\$d\ne\tf\u{1F600}"`),
    string('a"b\\c$d\ne\tf\u{1F600}'),
  );
  assert.deepEqual(parseString(String.raw`"\${not interpolated}"`), string('${not interpolated}'));
});

test('treats a $ that does not start an interpolation as text', () => {
  assert.deepEqual(parseString('"costs $5 or $"'), string('costs $5 or $'));
});

test('rejects unknown escapes and out-of-range code points', () => {
  assert.throws(() => parseString(String.raw`"\q"`), ParseError);
  assert.throws(() => parseString(String.raw`"\u{110000}"`), ParseError);
});

test('parses interpolations, including strings inside them', () => {
  assert.deepEqual(parseString('"Hello, ${name}! ${greet("you")}"'), {
    type: 'string',
    parts: [
      { type: 'text', value: 'Hello, ' },
      { type: 'interpolation', expression: identifier('name') },
      { type: 'text', value: '! ' },
      {
        type: 'interpolation',
        expression: {
          type: 'call',
          callee: identifier('greet'),
          arguments: [string('you')],
        },
      },
    ],
  });
});

test('rejects unterminated strings and interpolations', () => {
  assert.throws(() => parseString('"oops'), ParseError);
  assert.throws(() => parseString('"a ${b"'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    f("one\ntwo")'), ParseError);
});
