import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';
import { STANDARD_SOURCES } from './stdlib.ts';

// Each standard library module with Cant source is valid as a standard library module, which can
// write the internal types (docs/adr/0036-native-modules.md, docs/adr/0042-io.md).
for (const name of STANDARD_SOURCES.keys()) {
  test(`cant::${name} has no problems`, () => {
    const program = checkProgram('/app/main.cant', {
      readFile: (path) => (path === '/app/main.cant' ? `import ${name}\n` : undefined),
    });
    assert.deepEqual(
      program.diagnostics.map(({ file, code, message }) => `${file ?? ''}: ${code}: ${message}`),
      [],
    );
    assert.ok(program.modules.has(`cant::${name}`));
  });
}
