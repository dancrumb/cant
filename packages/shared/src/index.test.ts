import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cant } from './index.ts';

test('cant', () => {
  assert.equal(cant(), 'cant');
});
