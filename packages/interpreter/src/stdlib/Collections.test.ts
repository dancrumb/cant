import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CantDuration, CantFile } from '@dancrumb/cant-native';
import { STANDARD_ACTIONS } from './index.ts';

const call = (name: string, args: Record<string, unknown>): unknown => {
  const action = STANDARD_ACTIONS.get(`cant::Collections#${name}`);
  assert.ok(action, `cant::Collections#${name} is implemented`);
  return action(args, { signal: new AbortController().signal });
};

test('length counts an array\'s empty slots, and size skips them', () => {
  const scores: number[] = [1, 2, 3];
  scores[5] = 1;
  assert.equal(call('length', { coll: scores }), 6);
  assert.equal(call('size', { coll: scores }), 4);
  assert.equal(call('length', { coll: new Map([['a', 1]]) }), 1);
  assert.equal(call('size', { coll: new Set([1, 2]) }), 2);
});

test('concat puts tgt first, keeps empty slots, lets src win in maps, and unites sets', () => {
  const tgt: number[] = [1];
  tgt[2] = 3;
  const joined = call('concat', { src: [4], tgt }) as number[];
  assert.equal(joined.length, 4);
  assert.deepEqual([0 in joined, 1 in joined, joined[0], joined[2], joined[3]], [true, false, 1, 3, 4]);
  assert.deepEqual(
    [...(call('concat', { src: new Map([['b', 3], ['c', 4]]), tgt: new Map([['a', 1], ['b', 2]]) }) as Map<string, number>)],
    [['a', 1], ['b', 3], ['c', 4]],
  );
  // Two Dates for the same instant are one element.
  const union = call('concat', { src: new Set([new Date(0), 2]), tgt: new Set([new Date(0), 1]) }) as Set<unknown>;
  assert.equal(union.size, 3);
});

test('join converts members to text, skipping empty slots', () => {
  const tags: unknown[] = ['a', 1.5, true];
  tags[4] = new CantDuration(90_000);
  assert.equal(call('join', { coll: tags, delim: ' | ' }), 'a | 1.5 | true | PT1M30S');
  assert.equal(call('join', { coll: new Map<string, unknown>([['when', new Date(0)], ['nested', [1, 2]]]), delim: '; ' }), 'when: 1970-01-01T00:00:00.000Z; nested: 1, 2');
  assert.equal(call('join', { coll: [{ name: 'Ada', address: { city: 'London' } }], delim: '' }), 'name: Ada, address: model');
});

test('keys and values list a map in its stable order', () => {
  const headers = new Map([['b', 'two'], ['a', 'one']]);
  assert.deepEqual(call('keys', { map: headers }), ['b', 'a']);
  assert.deepEqual(call('values', { map: headers }), ['two', 'one']);
});

test('changes and compares sets with Cant equality', () => {
  const set = new Set<unknown>([new Date(1000), CantFile.fromUrl('file:///a.txt')]);
  call('add', { set, value: new Date(1000) });
  call('add', { set, value: CantFile.fromUrl('file:///a.txt') });
  assert.equal(set.size, 2);
  call('add', { set, value: 'x' });
  assert.equal(set.size, 3);
  call('remove', { set, value: new Date(1000) });
  call('remove', { set, value: 'missing' });
  assert.equal(set.size, 2);

  const first = new Set([1, 2, 3]);
  const second = new Set([2, 3, 4]);
  assert.deepEqual([...(call('intersect', { first, second }) as Set<number>)], [2, 3]);
  assert.deepEqual([...(call('difference', { base: first, exclude: second }) as Set<number>)], [1]);
  assert.equal(call('isSubset', { subset: new Set([2]), superset: first }), true);
  assert.equal(call('isSubset', { subset: second, superset: first }), false);
  // Neither set is changed.
  assert.deepEqual([[...first], [...second]], [[1, 2, 3], [2, 3, 4]]);
});
