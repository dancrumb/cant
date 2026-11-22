import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CantDuration, CantError, CantFile } from './index.ts';

test('recognises its values by brand, so that another copy of the package recognises them too', () => {
  const error = new CantError('PaymentDeclined', { reason: 'expired' });
  assert.ok(CantError.is(error));
  assert.deepEqual([error.error, error.data], ['PaymentDeclined', { reason: 'expired' }]);
  // What another copy's CantError looks like: the same brand, a different class.
  const elsewhere = { [Symbol.for('@dancrumb/cant-native:CantError')]: true };
  assert.ok(CantError.is(elsewhere));
  assert.ok(!CantError.is(new Error('plain')));
  assert.ok(CantDuration.is(new CantDuration(1000)));
  assert.throws(() => new CantDuration(1.5), RangeError);
});

test('makes a FILE from a blob, with a data: URL of its contents', async () => {
  const file = await CantFile.fromBlob(new Blob(['hi'], { type: 'text/plain' }));
  assert.equal(file.url().href, 'data:text/plain;base64,aGk=');
  assert.equal(await (await file.blob()).text(), 'hi');
  assert.equal(await new Response(file.stream()).text(), 'hi');
  // A FILE from a data: URL derives its contents from it.
  assert.equal(await (await CantFile.fromUrl(file.url()).blob()).text(), 'hi');
});

test('throws when a file a FILE points to is gone', () => {
  assert.throws(() => CantFile.fromUrl('file:///no/such/file.txt').stream());
});
