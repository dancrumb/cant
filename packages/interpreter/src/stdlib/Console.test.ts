import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { STANDARD_ACTIONS } from './index.ts';

/** Call a cant::Console action, and give what it wrote to standard output and standard error. */
const call = async (name: string, args: Record<string, unknown>, stderr = new PassThrough()): Promise<{ stdout: string; stderr: string }> => {
  const action = STANDARD_ACTIONS.get(`cant::Console#${name}`);
  assert.ok(action, `cant::Console#${name} is implemented`);
  const stdout = new PassThrough();
  await action(args, { signal: new AbortController().signal, streams: { stdin: new PassThrough(), stdout, stderr } });
  const read = (stream: PassThrough): string => (stream.read() as Buffer | null)?.toString('utf8') ?? '';
  return { stdout: read(stdout), stderr: read(stderr) };
};

test('writes one line to @stderr for each level, with the labels padded so messages line up', async () => {
  const lines = await Promise.all(['error', 'warn', 'info', 'debug', 'trace'].map(async (name) => (await call(name, { message: 'hi' })).stderr));
  assert.deepEqual(lines, ['ERROR hi\n', 'WARN  hi\n', 'INFO  hi\n', 'DEBUG hi\n', 'TRACE hi\n']);
  assert.deepEqual(await call('info', { message: 'hi' }), { stdout: '', stderr: 'INFO  hi\n' });
});

test('logs at the level log is given', async () => {
  assert.equal((await call('log', { level: 'Warn', message: 'careful' })).stderr, 'WARN  careful\n');
  assert.equal((await call('log', { level: 'Trace', message: 'step' })).stderr, 'TRACE step\n');
});

test('writes data after the message, as a map is converted to text, and nothing for an empty map', async () => {
  const data = new Map<string, unknown>([['free', 3], ['path', '/tmp'], ['tags', ['a', 'b']]]);
  assert.equal((await call('warn', { message: 'Disk is nearly full', data })).stderr, 'WARN  Disk is nearly full  free: 3, path: /tmp, tags: a, b\n');
  assert.equal((await call('info', { message: 'Quiet', data: new Map() })).stderr, 'INFO  Quiet\n');
});

test('drops a line it cannot write, rather than failing', async () => {
  const closed = new PassThrough();
  closed.destroy();
  await assert.doesNotReject(call('error', { message: 'late' }, closed));
});
