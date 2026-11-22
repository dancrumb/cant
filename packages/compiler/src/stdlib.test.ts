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

// The standard library's own source files are checked as the modules they declare, as an editor
// does when one is changed, but a file with the same name anywhere else is an ordinary module.
test("checks the standard library's own files as standard library modules", () => {
  const source = STANDARD_SOURCES.get('IO') ?? '';
  const files: Record<string, string> = {
    '/repo/packages/compiler/package.json': JSON.stringify({ name: '@dancrumb/cant-compiler' }),
    '/repo/packages/compiler/stdlib/IO.cant': source,
    '/app/package.json': JSON.stringify({ name: 'my-app' }),
    '/app/stdlib/IO.cant': source,
  };
  const host = { readFile: (path: string) => files[path] };
  const codes = (entry: string): string[] => checkProgram(entry, host).diagnostics.map(({ code }) => code);
  assert.deepEqual(codes('/repo/packages/compiler/stdlib/IO.cant'), []);
  // One for each use of WriteStream or ReadStream.
  assert.deepEqual(codes('/app/stdlib/IO.cant'), ['unknown-name', 'unknown-name', 'unknown-name']);
});
