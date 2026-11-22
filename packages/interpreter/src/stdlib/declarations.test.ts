import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@dancrumb/cant-shared';
import { STANDARD_ACTIONS } from './index.ts';

// The standard library is declared in Cant in the compiler, and implemented here, so the two must
// list the same actions (docs/adr/0036-native-modules.md).
const declarations = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'compiler', 'stdlib');

test('implements every action the standard library declares, and nothing else', () => {
  const declared = readdirSync(declarations)
    .filter((file) => file.endsWith('.cant'))
    .flatMap((file) =>
      parse(readFileSync(join(declarations, file), 'utf8'))
        .children.filter((declaration) => declaration.type === 'action')
        .map((action) => `cant::${basename(file, '.cant')}#${action.name.value}`),
    );
  assert.deepEqual([...STANDARD_ACTIONS.keys()].sort(), declared.sort());
});
