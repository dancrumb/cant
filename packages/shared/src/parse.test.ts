import assert from 'node:assert/strict';
import { test } from 'node:test';
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
const moduleName = (name: string) => ({ type: 'moduleName', name: identifier(name) });

test('parses the hello world example', () => {
  const source = [
    'import IO',
    '',
    'action SayHello():VOID {',
    '    IO.stdout.write("Hello World!");',
    '}',
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
        returnType: identifier('VOID'),
        children: [
          {
            type: 'expressionStatement',
            expression: {
              type: 'call',
              callee: {
                type: 'member',
                object: {
                  type: 'member',
                  object: identifier('IO'),
                  property: identifier('stdout'),
                },
                property: identifier('write'),
              },
              arguments: [{ type: 'string', value: 'Hello World!' }],
            },
          },
        ],
      },
      { type: 'trigger', action: identifier('SayHello'), event: identifier('Start') },
    ],
  });
});

test('parses an empty program', () => {
  assert.deepEqual(withoutPositions(parse('  \n ')), { type: 'program', children: [] });
});

test('parses calls with several arguments and chained calls', () => {
  const program = parse('action A():VOID { f("a", b)(c); }');
  const [action] = program.children;
  assert.equal(action?.type, 'action');
  assert.deepEqual(withoutPositions(action.children), [
    {
      type: 'expressionStatement',
      expression: {
        type: 'call',
        callee: {
          type: 'call',
          callee: identifier('f'),
          arguments: [{ type: 'string', value: 'a' }, identifier('b')],
        },
        arguments: [identifier('c')],
      },
    },
  ]);
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
  const [action] = parse('action A():VOID {\n  IO.stdout;\n}').children;
  const statement = action?.type === 'action' ? action.children[0] : undefined;
  assert.deepEqual(statement?.expression.position, {
    start: { line: 2, column: 3, offset: 20 },
    end: { line: 2, column: 12, offset: 29 },
  });
});

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
      assert.deepEqual(error.location.start, { line: 2, column: 9, offset: 18 });
      return true;
    },
  );
});

test('rejects an unterminated string', () => {
  assert.throws(() => parse('action A():VOID { f("oops); }'), ParseError);
});

test('parses symbolic imports with and without a scope', () => {
  assert.deepEqual(withoutPositions(parse('import IO\nimport acme::Http').children), [
    { type: 'import', module: moduleName('IO') },
    {
      type: 'import',
      module: { type: 'moduleName', scope: identifier('acme'), name: identifier('Http') },
    },
  ]);
});

test('parses URL imports with into and as', () => {
  assert.deepEqual(
    withoutPositions(parse('import "./config.json" into config as "json"').children),
    [
      {
        type: 'import',
        module: { type: 'string', value: './config.json' },
        namespace: identifier('config'),
        moduleType: { type: 'string', value: 'json' },
      },
    ],
  );
  assert.deepEqual(withoutPositions(parse('import IO as "cant"').children), [
    { type: 'import', module: moduleName('IO'), moduleType: { type: 'string', value: 'cant' } },
  ]);
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
  const [action] = parse('action A():VOID { io::write("hi"); }').children;
  assert.equal(action?.type, 'action');
  assert.deepEqual(withoutPositions(action.children[0]?.expression), {
    type: 'call',
    callee: {
      type: 'qualifiedIdentifier',
      namespace: identifier('io'),
      name: identifier('write'),
    },
    arguments: [{ type: 'string', value: 'hi' }],
  });
});
