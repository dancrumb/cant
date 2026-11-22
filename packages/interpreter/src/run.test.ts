import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { COMPILED_FORMAT, type CompiledAction, type CompiledExpression, type CompiledProgram, type CompiledTrigger, type SourcePosition } from '@dancrumb/cant-shared';
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

/** Run a program, and give what it wrote to standard output and standard error. */
const output = async (compiled: CompiledProgram): Promise<{ stdout: string; stderr: string }> => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const read = (stream: PassThrough): string => (stream.read() as Buffer | null)?.toString('utf8') ?? '';
  await run(compiled, { root: '/app', streams: { stdin: new PassThrough(), stdout, stderr } });
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
