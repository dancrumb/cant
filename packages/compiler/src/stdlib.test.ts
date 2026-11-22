import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';
import { findStandardLibrary, STANDARD_SOURCES } from './stdlib.ts';

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

const COMPILER = JSON.stringify({ name: '@dancrumb/cant-compiler' });
const ioWith = (action: string): string => `export action ${action}(): VOID\n    native "./IO.js"\n`;

test('finds the standard library of the Cant that runs a program, nearest first', () => {
  const files: Record<string, string> = {
    // Cant's own repository.
    '/repo/packages/compiler/package.json': COMPILER,
    '/repo/packages/compiler/stdlib/IO.cant': ioWith('fromRepo'),
    // A project that installs Cant, whose CLI has its own compiler, and another compiler hoisted beside it.
    '/app/node_modules/@dancrumb/cant/node_modules/@dancrumb/cant-compiler/package.json': COMPILER,
    '/app/node_modules/@dancrumb/cant/node_modules/@dancrumb/cant-compiler/stdlib/IO.cant': ioWith('fromCli'),
    '/app/node_modules/@dancrumb/cant-compiler/package.json': COMPILER,
    '/app/node_modules/@dancrumb/cant-compiler/stdlib/IO.cant': ioWith('hoisted'),
    // A nested project, whose compiler is too old to have stdlib sources.
    '/app/old/node_modules/@dancrumb/cant-compiler/package.json': COMPILER,
    // A project whose CLI's compiler is hoisted.
    '/hoisted/node_modules/@dancrumb/cant-compiler/package.json': COMPILER,
    '/hoisted/node_modules/@dancrumb/cant-compiler/stdlib/IO.cant': ioWith('hoisted'),
    // A package that only has the same folder names.
    '/other/packages/compiler/package.json': JSON.stringify({ name: 'not-cant' }),
    '/other/packages/compiler/stdlib/IO.cant': ioWith('other'),
  };
  const host = { readFile: (path: string) => files[path] };
  const found = (entry: string): string | undefined => findStandardLibrary(entry, host)?.directory;
  assert.equal(found('/repo/examples/main.cant'), '/repo/packages/compiler/stdlib');
  assert.equal(found('/repo/packages/compiler/stdlib/IO.cant'), '/repo/packages/compiler/stdlib');
  assert.equal(found('/app/src/main.cant'), '/app/node_modules/@dancrumb/cant/node_modules/@dancrumb/cant-compiler/stdlib');
  assert.equal(found('/app/old/main.cant'), '/app/node_modules/@dancrumb/cant/node_modules/@dancrumb/cant-compiler/stdlib');
  assert.equal(found('/hoisted/main.cant'), '/hoisted/node_modules/@dancrumb/cant-compiler/stdlib');
  assert.equal(found('/other/main.cant'), undefined);
  assert.equal(findStandardLibrary('/repo/examples/main.cant', host)?.source('IO'), ioWith('fromRepo'));
});

test("checks a program against the host's standard library, including a module the embedded one lacks", () => {
  const files: Record<string, string> = {
    '/repo/packages/compiler/package.json': COMPILER,
    '/repo/packages/compiler/stdlib/IO.cant': ioWith('fromRepo'),
    '/repo/packages/compiler/stdlib/Extra.cant': 'export action extra(): VOID\n    native "./Extra.js"\n',
    '/repo/main.cant': ['import IO', 'import Extra', 'action Main(): VOID', '    body', '        IO::fromRepo()', '        Extra::extra()', '        IO::write("gone")', ''].join('\n'),
  };
  const readFile = (path: string): string | undefined => files[path];
  const host = { readFile, standardLibrary: (entry: string) => findStandardLibrary(entry, { readFile }) };
  const messages = checkProgram('/repo/main.cant', host).diagnostics.map(({ message }) => message);
  assert.deepEqual(messages, ['There is no action called IO::write here.']);
  // Without one, the embedded standard library is used.
  assert.deepEqual(
    checkProgram('/repo/main.cant', { readFile }).diagnostics.map(({ message }) => message),
    ['The standard library has no module called cant::Extra.', 'There is no action called IO::fromRepo here.', 'There is no action called Extra::extra here.'],
  );
});
