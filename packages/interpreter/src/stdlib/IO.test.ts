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
  return Promise.resolve(action(args, { signal: new AbortController().signal }));
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
