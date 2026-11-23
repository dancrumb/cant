import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { test } from 'node:test';
import { COMPILED_FORMAT, type CompiledAction, type CompiledExpression, type CompiledProgram, type CompiledStatement, type CompiledTrigger, type SourcePosition } from '@dancrumb/cant-shared';
import { Panic, run } from './run.ts';

const at = (line: number): SourcePosition => ({ module: 'main.cant', start: { line, column: 1 }, end: { line, column: 2 } });
const text = (value: string, line = 1): CompiledExpression => ({ type: 'value', value: { kind: 'text', value }, position: at(line) });

/** `cant::IO#write`, as a compiled program records it (packages/compiler/stdlib/IO.cant). */
const WRITE: CompiledAction = {
  parameters: [
    { name: 'message', type: { kind: 'base', name: 'TEXT' }, optional: false },
    { name: 'stream', type: { kind: 'stream', direction: 'output' }, optional: true, default: { type: 'builtIn', name: 'stdout', position: at(1) } },
  ],
  returns: { kind: 'void' },
  optional: false,
  raises: ['cant::IO#StreamError'],
  passes: [],
  defaultOrder: [1],
  implementation: { kind: 'standard' },
  position: at(1),
};

const program = (actions: Record<string, CompiledAction>, triggers: Partial<CompiledTrigger>[]): CompiledProgram => ({
  format: COMPILED_FORMAT,
  build: 'test',
  entry: 'main.cant',
  types: {},
  actions: { 'cant::IO#write': WRITE, ...actions },
  constants: {},
  relations: [],
  permissions: [],
  triggers: triggers.map((trigger) => ({ action: 'main.cant#Main', source: 'Start', parameters: {}, arguments: {}, assertions: [], position: at(1), ...trigger })),
});

const body = (parameters: CompiledAction['parameters'], locals: number, statements: CompiledAction['implementation'] & { kind: 'body' } extends { body: infer B } ? B : never): CompiledAction => ({
  parameters,
  returns: { kind: 'void' },
  optional: false,
  raises: [],
  passes: [],
  defaultOrder: parameters.flatMap((parameter, index) => (parameter.default === undefined ? [] : [index])),
  implementation: { kind: 'body', locals, body: statements },
  position: at(1),
});

const write = (message: CompiledExpression, stream?: string): CompiledExpression => ({
  type: 'call',
  action: 'cant::IO#write',
  arguments: [message, stream === undefined ? { type: 'omitted' } : { type: 'builtIn', name: stream, position: at(1) }],
  position: at(1),
});

/** Run a program, with `stdin` as its standard input, and give what it wrote to standard output and standard error. */
const output = async (compiled: CompiledProgram, stdin: Readable = new PassThrough()): Promise<{ stdout: string; stderr: string }> => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const read = (stream: PassThrough): string => (stream.read() as Buffer | null)?.toString('utf8') ?? '';
  await run(compiled, { root: '/app', streams: { stdin, stdout, stderr } });
  return { stdout: read(stdout), stderr: read(stderr) };
};

test('runs hello world: a Start trigger whose action writes to @stdout', async () => {
  const hello = program({ 'main.cant#Main': body([], 0, [{ type: 'expression', expression: write(text('Hello World'), 'stdout'), position: at(5) }]) }, [{}]);
  assert.deepEqual(await output(hello), { stdout: 'Hello World', stderr: '' });
});

test('gives arguments, defaults and locals, interpolates, and leaves write to default to @stdout', async () => {
  const greet = body(
    [
      { name: 'name', type: { kind: 'base', name: 'TEXT' }, optional: false },
      { name: 'greeting', type: { kind: 'base', name: 'TEXT' }, optional: true, default: text('Hello') },
    ],
    3,
    [
      {
        type: 'let',
        slot: 2,
        value: { type: 'template', parts: [{ type: 'local', slot: 1, position: at(1) }, ', ', { type: 'local', slot: 0, position: at(1) }, '!'], position: at(1) },
        position: at(1),
      },
      { type: 'expression', expression: write({ type: 'local', slot: 2, position: at(1) }), position: at(1) },
      { type: 'expression', expression: write(text('oops'), 'stderr'), position: at(1) },
    ],
  );
  assert.deepEqual(await output(program({ 'main.cant#Main': greet }, [{ arguments: { name: text('Ada') } }])), { stdout: 'Hello, Ada!', stderr: 'oops' });
});

test('gives a map literal to native code, and lets cant::Console write to the program\'s @stderr', async () => {
  const info: CompiledAction = {
    parameters: [
      { name: 'message', type: { kind: 'base', name: 'TEXT' }, optional: false },
      { name: 'data', type: { kind: 'map', value: { kind: 'unknown' } }, optional: true },
    ],
    returns: { kind: 'void' },
    optional: false,
    raises: [],
    passes: [],
    defaultOrder: [],
    implementation: { kind: 'standard' },
    position: at(1),
  };
  const data: CompiledExpression = {
    type: 'map',
    value: { kind: 'unknown' },
    members: [
      ['user', text('ada')],
      ['tries', { type: 'value', value: { kind: 'number', value: 2 }, position: at(1) }],
    ],
    position: at(1),
  };
  const main = body([], 0, [
    { type: 'expression', expression: { type: 'call', action: 'cant::Console#info', arguments: [text('Signed in'), data], position: at(1) }, position: at(1) },
    { type: 'expression', expression: write({ type: 'template', parts: ['Saw ', data], position: at(1) }), position: at(1) },
  ]);
  assert.deepEqual(await output(program({ 'cant::Console#info': info, 'main.cant#Main': main }, [{}])), {
    stdout: 'Saw user: ada, tries: 2',
    stderr: 'INFO  Signed in  user: ada, tries: 2\n',
  });
});

test('copies an object of a named model into a map', async () => {
  const show = body([{ name: 'customer', type: { kind: 'named', symbol: 'main.cant#Customer' }, optional: false }], 1, [
    {
      type: 'expression',
      expression: write({ type: 'template', parts: [{ type: 'copyToMap', value: { type: 'local', slot: 0, position: at(1) }, position: at(1) }], position: at(1) }),
      position: at(1),
    },
  ]);
  const customer: CompiledExpression = {
    type: 'value',
    value: { kind: 'object', model: 'main.cant#Customer', members: [['name', { kind: 'text', value: 'Ada' }], ['age', { kind: 'number', value: 36 }]] },
    position: at(1),
  };
  assert.deepEqual(await output(program({ 'main.cant#Main': show }, [{ arguments: { customer } }])), { stdout: 'name: Ada, age: 36', stderr: '' });
});

test('constructs an object of a model: given fields, then defaults that use other fields, in the model\'s order', async () => {
  const program_ = (given: [string, CompiledExpression][]): CompiledProgram => {
    const compiled = program(
      {
        'main.cant#Main': body([{ name: 'disk', type: { kind: 'named', symbol: 'main.cant#Disk' }, optional: false }], 1, [
          { type: 'expression', expression: write({ type: 'template', parts: [{ type: 'local', slot: 0, position: at(1) }], position: at(1) }), position: at(1) },
        ]),
      },
      [{ arguments: { disk: { type: 'construct', model: 'main.cant#Disk', value: { type: 'object', members: given, position: at(9) }, position: at(9) } } }],
    );
    compiled.types['main.cant#Disk'] = {
      kind: 'model',
      fields: [
        { name: 'path', type: { kind: 'base', name: 'TEXT' }, optional: false },
        { name: 'free', type: { kind: 'base', name: 'NUMBER' }, optional: false },
        { name: 'label', type: { kind: 'base', name: 'TEXT' }, optional: true, default: { type: 'template', parts: ['Disk at ', { type: 'field', name: 'path', position: at(1) }], position: at(1) } },
        { name: 'owner', type: { kind: 'base', name: 'TEXT' }, optional: true },
      ],
      defaultOrder: [2],
    };
    return compiled;
  };
  const number = (value: number): CompiledExpression => ({ type: 'value', value: { kind: 'number', value }, position: at(1) });

  assert.deepEqual(await output(program_([['free', number(3)], ['path', text('/tmp')]])), { stdout: 'path: /tmp, free: 3, label: Disk at /tmp', stderr: '' });
  assert.deepEqual(await output(program_([['path', text('/tmp')], ['free', number(3)], ['label', text('Scratch')], ['owner', text('ada')]])), {
    stdout: 'path: /tmp, free: 3, label: Scratch, owner: ada',
    stderr: '',
  });
  await assert.rejects(output(program_([['path', text('/tmp')]])), (caught: unknown) => {
    assert.ok(caught instanceof Panic);
    assert.equal(caught.message, 'An object of Disk has no value for its field free.');
    assert.equal(caught.position?.start.line, 9);
    return true;
  });
});

/** `cant::IO#read`, as a compiled program records it (packages/compiler/stdlib/IO.cant). */
const READ: CompiledAction = {
  parameters: [{ name: 'stream', type: { kind: 'stream', direction: 'input', file: true }, optional: true, default: { type: 'builtIn', name: 'stdin', position: at(1) } }],
  returns: { kind: 'array', element: { kind: 'base', name: 'NUMBER' } },
  optional: false,
  raises: ['cant::IO#StreamError'],
  passes: [],
  defaultOrder: [0],
  implementation: { kind: 'standard' },
  position: at(1),
};

/** `bytes := IO::read()`, then `if bytes instanceOf IO::StreamError`, writing the error, or else the bytes. */
const readOrOops = (): CompiledProgram => {
  const bytes: CompiledExpression = { type: 'local', slot: 0, position: at(1) };
  const compiled = program(
    {
      'cant::IO#read': READ,
      'main.cant#Main': body([], 1, [
        { type: 'let', slot: 0, value: { type: 'call', action: 'cant::IO#read', arguments: [{ type: 'omitted' }], position: at(1) }, position: at(1) },
        {
          type: 'if',
          test: { type: 'instanceOf', value: bytes, target: { kind: 'named', symbol: 'cant::IO#StreamError' }, position: at(1) },
          then: [
            { type: 'expression', expression: write({ type: 'template', parts: ['OOPS: ', bytes], position: at(1) }), position: at(1) },
            { type: 'return', value: { type: 'unary', operator: '-', argument: { type: 'value', value: { kind: 'number', value: 1 }, position: at(1) }, position: at(1) }, position: at(1) },
          ],
          else: [{ type: 'expression', expression: write({ type: 'template', parts: ['Read ', bytes], position: at(1) }), position: at(1) }],
          position: at(1),
        },
      ]),
    },
    [{}],
  );
  compiled.types['cant::IO#StreamError'] = { kind: 'error', data: { fields: [{ name: 'reason', type: { kind: 'base', name: 'TEXT' }, optional: false }], defaultOrder: [] } };
  return compiled;
};

test('takes an array from native code, and checks a result with instanceOf in an if', async () => {
  assert.deepEqual(await output(readOrOops(), Readable.from([Buffer.from('hi')])), { stdout: 'Read 104, 105', stderr: '' });
  const broken = new Readable({
    read() {
      this.destroy(new Error('broken'));
    },
  });
  assert.deepEqual(await output(readOrOops(), broken), { stdout: 'OOPS: StreamError: reason: broken', stderr: '' });
});

test('makes arrays and sets, applies prefix operators, and checks base types with instanceOf', async () => {
  const value = (held: Extract<CompiledExpression, { type: 'value' }>['value']): CompiledExpression => ({ type: 'value', value: held, position: at(1) });
  const one = value({ kind: 'number', value: 1 });
  const show = (expression: CompiledExpression): CompiledStatement => ({ type: 'expression', expression: write({ type: 'template', parts: [expression, ';'], position: at(1) }), position: at(1) });
  const compiled = program(
    {
      'main.cant#Main': body([], 0, [
        show({ type: 'array', element: { kind: 'base', name: 'NUMBER' }, elements: [one, value({ kind: 'number', value: 2 }), one], position: at(1) }),
        show({ type: 'set', element: { kind: 'base', name: 'NUMBER' }, elements: [one, value({ kind: 'number', value: 2 }), one], position: at(1) }),
        show({ type: 'unary', operator: '-', argument: one, position: at(1) }),
        show({ type: 'unary', operator: '!', argument: value({ kind: 'boolean', value: true }), position: at(1) }),
        show({ type: 'instanceOf', value: one, target: { kind: 'base', name: 'NUMBER' }, position: at(1) }),
        show({ type: 'instanceOf', value: one, target: { kind: 'base', name: 'TEXT' }, position: at(1) }),
        show({ type: 'instanceOf', value: one, target: { kind: 'anyError' }, position: at(1) }),
      ]),
    },
    [{}],
  );
  assert.deepEqual(await output(compiled), { stdout: '1, 2, 1;1, 2;-1;false;true;false;false;', stderr: '' });
});

test('applies binary operators, short-circuiting and, or and orElse', async () => {
  const value = (held: Extract<CompiledExpression, { type: 'value' }>['value']): CompiledExpression => ({ type: 'value', value: held, position: at(1) });
  const n = (held: number): CompiledExpression => value({ kind: 'number', value: held });
  const yes = value({ kind: 'boolean', value: true });
  const no = value({ kind: 'boolean', value: false });
  // A local with no value, which panics if it is evaluated.
  const unset: CompiledExpression = { type: 'local', slot: 0, position: at(1) };
  const binary = (operator: Extract<CompiledExpression, { type: 'binary' }>['operator'], left: CompiledExpression, right: CompiledExpression): CompiledExpression => ({
    type: 'binary',
    operator,
    left,
    right,
    position: at(1),
  });
  const show = (expression: CompiledExpression): CompiledStatement => ({ type: 'expression', expression: write({ type: 'template', parts: [expression, ';'], position: at(1) }), position: at(1) });
  const empty: CompiledExpression = { type: 'unwrap', value: { type: 'call', action: 'main.cant#Nothing', arguments: [], position: at(1) }, position: at(1) };
  const compiled = program(
    {
      'main.cant#Nothing': { ...body([], 0, [{ type: 'return', value: { type: 'nothing' }, position: at(1) }]), returns: { kind: 'base', name: 'TEXT' }, optional: true },
      'main.cant#Main': body([], 1, [
        show(binary('+', n(2), binary('*', n(3), n(4)))),
        show(binary('%', n(-7), n(3))),
        show(binary('==', value({ kind: 'text', value: 'a' }), value({ kind: 'text', value: 'a' }))),
        show(binary('!=', n(1), n(1))),
        show(binary('<', value({ kind: 'text', value: 'a' }), value({ kind: 'text', value: 'b' }))),
        show(binary('>=', n(1), n(2))),
        show(binary('or', yes, unset)),
        show(binary('and', no, unset)),
        show(binary('and', yes, no)),
        show(binary('orElse', empty, value({ kind: 'text', value: 'fallback' }))),
        show(binary('orElse', value({ kind: 'text', value: 'held' }), unset)),
        show(binary('in', n(2), { type: 'array', element: { kind: 'base', name: 'NUMBER' }, elements: [n(1), n(2)], position: at(1) })),
        show(binary('in', value({ kind: 'text', value: 'b' }), { type: 'map', value: { kind: 'base', name: 'NUMBER' }, members: [['a', n(1)]], position: at(1) })),
        show({ type: 'instanceOf', value: binary('/', n(1), n(0)), target: { kind: 'named', symbol: 'cant::Errors#DivisionByZero' }, position: at(1) }),
      ]),
    },
    [{}],
  );
  compiled.types['cant::Errors#DivisionByZero'] = { kind: 'error' };
  assert.deepEqual(await output(compiled), { stdout: '14;2;true;false;true;false;true;false;false;fallback;held;true;false;true;', stderr: '' });
});

test("reads an object's fields, and an error's data", async () => {
  const bytes: CompiledExpression = { type: 'local', slot: 0, position: at(1) };
  const compiled = readOrOops();
  const main = compiled.actions['main.cant#Main'];
  assert.ok(main?.implementation.kind === 'body');
  const check = main.implementation.body[1];
  assert.ok(check?.type === 'if');
  // `IO::write("OOPS: ${bytes.data.reason}")`
  check.then[0] = {
    type: 'expression',
    expression: write({
      type: 'template',
      parts: ['OOPS: ', { type: 'member', object: { type: 'member', object: bytes, name: 'data', position: at(1) }, name: 'reason', position: at(1) }],
      position: at(1),
    }),
    position: at(1),
  };
  const broken = new Readable({
    read() {
      this.destroy(new Error('broken'));
    },
  });
  assert.deepEqual(await output(compiled, broken), { stdout: 'OOPS: broken', stderr: '' });
});

test('skips test cases, and runs Start triggers in order', async () => {
  const say = (word: string): CompiledAction => body([], 0, [{ type: 'expression', expression: write(text(word)), position: at(1) }]);
  const compiled = program({ 'main.cant#One': say('one '), 'main.cant#Two': say('two') }, [
    { action: 'main.cant#One' },
    { action: 'main.cant#Two', source: 'TestCase' },
    { action: 'main.cant#Two' },
  ]);
  assert.deepEqual(await output(compiled), { stdout: 'one two', stderr: '' });
});

test("panics, at the statement's position, for what it can't run yet", async () => {
  const loop = body([], 1, [{ type: 'for', slot: 0, iterable: text('x'), body: [], position: at(7) }]);
  await assert.rejects(output(program({ 'main.cant#Main': loop }, [{}])), (caught: unknown) => {
    assert.ok(caught instanceof Panic);
    assert.equal(caught.message, "The interpreter can't run for statements yet.");
    assert.equal(caught.position?.start.line, 7);
    return true;
  });
  await assert.rejects(output(program({ 'main.cant#Main': body([], 0, []) }, [{ source: 'Schedule' }])), Panic);
});

test('refuses a compiled program in another format', async () => {
  const other = { ...program({}, []), format: 0 } as unknown as CompiledProgram;
  await assert.rejects(output(other), /format 0/);
});
