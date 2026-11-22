import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CantError, CantFile } from '@dancrumb/cant-native';
import { STANDARD_ACTIONS } from './index.ts';

const call = (name: string, args: Record<string, unknown>): Promise<unknown> => {
  const action = STANDARD_ACTIONS.get(`cant::IO#${name}`);
  assert.ok(action, `cant::IO#${name} is implemented`);
  return Promise.resolve(action(args, { signal: new AbortController().signal, streams: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() } }));
};
const isStreamError = (caught: unknown): boolean => CantError.is(caught) && caught.error === 'StreamError' && typeof (caught.data as { reason?: unknown }).reason === 'string';

test('writes each message whole, as UTF-8, in order, with nothing added', async () => {
  const written: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      written.push(chunk);
      done();
    },
  });
  await Promise.all([call('write', { message: 'Hello, ', stream }), call('write', { message: 'wörld', stream })]);
  assert.equal(Buffer.concat(written).toString('utf8'), 'Hello, wörld');
});

test('raises StreamError when writing to a stream that is closed', async () => {
  const stream = new PassThrough();
  stream.destroy();
  await assert.rejects(call('write', { message: 'late', stream }), isStreamError);
});

test('reads a stream to its end as bytes, and gives [] once it has ended', async () => {
  const stream = new PassThrough();
  const reading = call('read', { stream });
  stream.end(Buffer.from('hé'));
  assert.deepEqual(await reading, [0x68, 0xc3, 0xa9]);
  assert.deepEqual(await call('read', { stream }), []);
});

test('reads a FILE from the start each time, and raises StreamError for one that is gone', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cant-io-'));
  const path = join(directory, 'note.txt');
  writeFileSync(path, 'hi');
  const file = CantFile.fromUrl(pathToFileURL(path));
  assert.deepEqual(await call('read', { stream: file }), [0x68, 0x69]);
  assert.deepEqual(await call('read', { stream: file }), [0x68, 0x69]);
  const fromBlob = await CantFile.fromBlob(new Blob(['ok']));
  assert.deepEqual(await call('read', { stream: fromBlob }), [0x6f, 0x6b]);
  await assert.rejects(call('read', { stream: CantFile.fromUrl(pathToFileURL(join(directory, 'missing.txt'))) }), isStreamError);
});

test('reads a line at a time, without its line break, leaving the rest for later reads', async () => {
  const stream = new PassThrough();
  const first = call('readline', { stream });
  const second = call('readline', { stream });
  stream.write('héllo\r\nwor');
  stream.write(Buffer.from([0x6c, 0x64, 0x0a, 0xc3]));
  stream.end(Buffer.from([0xa9, 0x0a, 0x0a, 0x6c, 0x61, 0x73, 0x74]));
  assert.equal(await first, 'héllo');
  assert.equal(await second, 'world');
  // A character split between chunks is decoded whole, and an empty line is "".
  assert.equal(await call('readline', { stream }), 'é');
  assert.equal(await call('readline', { stream }), '');
  // The last line needs no line break, and then the stream has ended.
  assert.equal(await call('readline', { stream }), 'last');
  assert.equal(await call('readline', { stream }), undefined);
});

test('leaves what follows a line for read', async () => {
  const stream = new PassThrough();
  stream.end('name\nrest');
  assert.equal(await call('readline', { stream }), 'name');
  assert.deepEqual(await call('read', { stream }), [0x72, 0x65, 0x73, 0x74]);
});

test("reads a FILE's first line, and raises StreamError for a stream that fails", async () => {
  assert.equal(await call('readline', { stream: await CantFile.fromBlob(new Blob(['one\ntwo'])) }), 'one');
  assert.equal(await call('readline', { stream: await CantFile.fromBlob(new Blob([])) }), undefined);
  const stream = new PassThrough();
  const reading = call('readline', { stream });
  // It fails while the read waits for a line.
  setImmediate(() => stream.destroy(new Error('broken')));
  await assert.rejects(reading, isStreamError);
});
