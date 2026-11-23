import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { CantError } from '@dancrumb/cant-native';
import { STANDARD_ACTIONS } from './index.ts';

const call = (name: string, args: Record<string, unknown>): unknown => {
  const action = STANDARD_ACTIONS.get(`cant::Conversion#${name}`);
  assert.ok(action, `cant::Conversion#${name} is implemented`);
  return action(args, { signal: new AbortController().signal, streams: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() } });
};
const raises = (error: string) => (caught: unknown): boolean => CantError.is(caught) && caught.error === error;
const toNumber = (text: string, base = 10): unknown => call('textToNumber', { text, base });
const toText = (number: number, base = 10): unknown => call('numberToText', { number, base });

test('reads numbers in base 10, with a sign and a fraction', () => {
  assert.equal(toNumber('42'), 42);
  assert.equal(toNumber('-3.25'), -3.25);
  assert.equal(toNumber('007'), 7);
  assert.ok(Object.is(toNumber('-0'), 0));
  assert.equal(toNumber('0.1'), 0.1);
});

test('reads numbers in other bases, with digits in either case', () => {
  assert.equal(toNumber('ff', 16), 255);
  assert.equal(toNumber('FF', 16), 255);
  assert.equal(toNumber('-101', 2), -5);
  assert.equal(toNumber('0.1', 2), 0.5);
  assert.equal(toNumber('z', 36), 35);
});

test('raises NotANumber for text that is not a number in the base', () => {
  for (const text of ['', ' 42', '42 ', '+1', '1e3', '0x1f', '1.', '.5', '1.2.3', '1_000', '--1', '١٢', 'Infinity', 'NaN']) {
    assert.throws(() => toNumber(text), raises('NotANumber'), JSON.stringify(text));
  }
  assert.throws(() => toNumber('2', 2), raises('NotANumber'));
  assert.throws(() => toNumber('g', 16), raises('NotANumber'));
  // The Kelvin sign lower-cases to `k`, but isn't a digit.
  assert.throws(() => toNumber('K', 36), raises('NotANumber'));
  // Too large for a NUMBER.
  assert.throws(() => toNumber('9'.repeat(400)), raises('NotANumber'));
});

test('writes numbers in base 10 as Cant converts them to text, and in other bases', () => {
  assert.equal(toText(42), '42');
  assert.equal(toText(-3.25), '-3.25');
  assert.equal(toText(1e21), '1000000000000000000000');
  assert.equal(toText(255, 16), 'ff');
  assert.equal(toText(-5, 2), '-101');
  assert.equal(toText(0.5, 2), '0.1');
  assert.equal(toText(-0, 2), '0');
  // The fewest digits that read back as the number, even where JavaScript's toString writes too few.
  assert.equal(toText(0.1, 3), '0.0022002200220022002200220022002201');
  assert.equal(toText(-2.9799046615492863e-13, 11), '-0.000000000000a31864396609385');
  assert.equal(toText(2 ** 60, 36), '8rc4kbdvss1s');
});

test('reads back any number written in any base as itself, down to the smallest and up to the largest', () => {
  const numbers = [0.1, 123.456, -1e-7, 2 ** 60, Number.MIN_VALUE, -Number.MAX_VALUE, Number.EPSILON, 1 / 3, 2 ** 53 + 2];
  const started = performance.now();
  for (let base = 2; base <= 36; base++) {
    for (const number of numbers) {
      assert.equal(toNumber(toText(number, base) as string, base), number, `${String(number)} in base ${String(base)}`);
    }
  }
  assert.ok(performance.now() - started < 2000, 'the extremes are written and read quickly');
});

test('raises InvalidBase for a base that is not a whole number from 2 to 36', () => {
  for (const base of [1, 37, 0, -10, 2.5]) {
    assert.throws(() => toNumber('1', base), raises('InvalidBase'), String(base));
    assert.throws(() => toText(1, base), raises('InvalidBase'), String(base));
  }
});
