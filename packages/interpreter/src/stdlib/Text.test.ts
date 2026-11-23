import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { STANDARD_ACTIONS } from './index.ts';

const call = (name: string, args: Record<string, unknown>): unknown => {
  const action = STANDARD_ACTIONS.get(`cant::Text#${name}`);
  assert.ok(action, `cant::Text#${name} is implemented`);
  return action(args, { signal: new AbortController().signal, streams: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() } });
};

test('counts characters as code points', () => {
  assert.equal(call('length', { text: '' }), 0);
  assert.equal(call('length', { text: 'héllo' }), 5);
  // One code point outside the BMP, which is two UTF-16 code units.
  assert.equal(call('length', { text: 'a😀b' }), 3);
});

test('splits on a delimiter, or into characters', () => {
  assert.deepEqual(call('split', { text: 'a b  c', delim: ' ' }), ['a', 'b', '', 'c']);
  assert.deepEqual(call('split', { text: 'a, b', delim: ', ' }), ['a', 'b']);
  assert.deepEqual(call('split', { text: 'abc', delim: '-' }), ['abc']);
  assert.deepEqual(call('split', { text: '', delim: ' ' }), ['']);
  assert.deepEqual(call('split', { text: 'a😀', delim: '' }), ['a', '😀']);
  assert.deepEqual(call('split', { text: '', delim: '' }), []);
});

test('trims white space and line breaks from either end, or both', () => {
  assert.equal(call('trimLeft', { text: ' \t a b \n' }), 'a b \n');
  assert.equal(call('trimRight', { text: ' \t a b \n' }), ' \t a b');
  assert.equal(call('trim', { text: '  42\r\n' }), '42');
});

test('slices by character, as arrays index, clamping to the ends', () => {
  const text = 'a😀cde';
  assert.equal(call('slice', { text, start: 1, end: 3 }), '😀c');
  assert.equal(call('slice', { text, start: 2 }), 'cde');
  assert.equal(call('slice', { text, start: -2 }), 'de');
  assert.equal(call('slice', { text, start: 0, end: -1 }), 'a😀cd');
  assert.equal(call('slice', { text, start: 1.9, end: 2.9 }), '😀');
  assert.equal(call('slice', { text, start: -10, end: 10 }), text);
  assert.equal(call('slice', { text, start: 3, end: 1 }), '');
});

test('gives the character at an index, or NOTHING past either end', () => {
  const text = 'a😀c';
  assert.equal(call('charAt', { text, index: 1 }), '😀');
  assert.equal(call('charAt', { text, index: -1 }), 'c');
  assert.equal(call('charAt', { text, index: 1.7 }), '😀');
  assert.equal(call('charAt', { text, index: 3 }), undefined);
  assert.equal(call('charAt', { text, index: -4 }), undefined);
  assert.equal(call('charAt', { text: '', index: 0 }), undefined);
});

test('repeats text a whole number of times, or none', () => {
  assert.equal(call('repeat', { text: 'ab', times: 3 }), 'ababab');
  assert.equal(call('repeat', { text: 'ab', times: 2.9 }), 'abab');
  assert.equal(call('repeat', { text: 'ab', times: 0 }), '');
  assert.equal(call('repeat', { text: 'ab', times: -2 }), '');
});
