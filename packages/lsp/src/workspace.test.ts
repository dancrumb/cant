import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Hover, MarkupContent } from 'vscode-languageserver/node';
import { Workspace } from './workspace.ts';

const MAIN = 'file:///app/main.cant';
const LIB = 'file:///app/lib.cant';

const LIBRARY = ['export model User', '    name: TEXT', 'export action FindUser(email: TEXT): User', '    native "./find.js"'].join('\n');

/** A workspace with main.cant open, and lib.cant only on disk. */
const open = (...lines: string[]): Workspace => {
  const workspace = new Workspace({ readFile: (path) => (path === '/app/lib.cant' ? LIBRARY : undefined) });
  workspace.set(MAIN, lines.join('\n'));
  return workspace;
};

const MAIN_LINES = [
  'import "./lib.cant"',
  'action Greet(email: TEXT): TEXT',
  '    body',
  '        user := FindUser(email)',
  '        return user.name',
];

const hoverText = (hover: Hover | undefined): string | undefined => (hover?.contents as MarkupContent | undefined)?.value;

test('reports problems by file, and lists checked files with none', () => {
  const workspace = open(...MAIN_LINES, '        return missing');
  const diagnostics = workspace.diagnostics();
  assert.deepEqual([...diagnostics.keys()].sort(), [LIB, MAIN]);
  assert.deepEqual(diagnostics.get(LIB), []);
  assert.deepEqual(
    diagnostics.get(MAIN)?.map(({ code, range }) => `${String(code)} ${String(range.start.line)}:${String(range.start.character)}`),
    ['unknown-name 5:15'],
  );
});

test('uses the text of open documents rather than what is on disk', () => {
  const workspace = open(...MAIN_LINES);
  workspace.set(LIB, 'export model User\n    name: TEXT');
  assert.deepEqual(
    workspace.diagnostics().get(MAIN)?.map(({ code }) => code),
    ['unknown-name'],
  );
  workspace.close(LIB);
  assert.deepEqual(workspace.diagnostics().get(MAIN), []);
});

test('finds the definitions of top-level names in other files, and of locals', () => {
  const workspace = open(...MAIN_LINES);
  // FindUser, in lib.cant.
  assert.deepEqual(workspace.definition(MAIN, { line: 3, character: 18 }), {
    uri: LIB,
    range: { start: { line: 2, character: 14 }, end: { line: 2, character: 22 } },
  });
  // email, the parameter.
  assert.deepEqual(workspace.definition(MAIN, { line: 3, character: 26 }), {
    uri: MAIN,
    range: { start: { line: 1, character: 13 }, end: { line: 1, character: 18 } },
  });
  // user, at the end of the name.
  assert.deepEqual(workspace.definition(MAIN, { line: 4, character: 19 })?.range.start, { line: 3, character: 8 });
  assert.equal(workspace.definition(MAIN, { line: 2, character: 5 }), undefined);
});

test('finds references to a symbol across files, and to a local', () => {
  const workspace = open(...MAIN_LINES, 'trigger Greet on Start');
  const describe = (locations: { uri: string; range: { start: { line: number; character: number } } }[]): string[] =>
    locations.map(({ uri, range }) => `${uri.slice(uri.lastIndexOf('/') + 1)} ${String(range.start.line)}:${String(range.start.character)}`);

  // From the declaration of FindUser, in lib.cant, which isn't open.
  workspace.diagnostics();
  assert.deepEqual(describe(workspace.references(MAIN, { line: 3, character: 18 }, true)), ['lib.cant 2:14', 'main.cant 3:16']);
  assert.deepEqual(describe(workspace.references(MAIN, { line: 1, character: 8 }, false)), ['main.cant 5:8']);
  assert.deepEqual(describe(workspace.references(MAIN, { line: 3, character: 9 }, true)), ['main.cant 3:8', 'main.cant 4:15']);
});

test('describes names on hover', () => {
  const workspace = open(...MAIN_LINES);
  assert.equal(
    hoverText(workspace.hover(MAIN, { line: 3, character: 18 })),
    '(action) FindUser — from /app/lib.cant\n\n```cant\nexport action FindUser(email: TEXT): User\n```',
  );
  assert.equal(hoverText(workspace.hover(MAIN, { line: 3, character: 26 })), '(parameter) email\n\n```cant\nemail: TEXT\n```');
  assert.equal(hoverText(workspace.hover(MAIN, { line: 4, character: 16 })), '(local) user\n\n```cant\nuser := FindUser(email)\n```');
  assert.equal(
    hoverText(open('import IO', 'action A(): VOID', '    body', '        IO::write("hi")').hover(MAIN, { line: 3, character: 12 })),
    [
      '(action) write — from cant::IO',
      '',
      '```cant',
      'export action write(message: TEXT, stream?: WriteStream := @stdout): VOID raises StreamError',
      '```',
    ].join('\n'),
  );
});

test('outlines a document', () => {
  const workspace = open(
    'model Customer',
    '    name: TEXT',
    'enum Status',
    '    open',
    'const limit := 10',
    'action Run(count: NUMBER): VOID',
    '    native "./run.js"',
    'trigger Run on Start',
    '    arguments',
    '        count := 1',
  );
  assert.deepEqual(
    workspace.symbols(MAIN).map(({ name, children }) => [name, ...(children ?? []).map((child) => child.name)]),
    [['Customer', 'name'], ['Status', 'open'], ['limit'], ['Run', 'count'], ['Run on Start']],
  );
});

test('completes keywords, visible names and earlier locals', () => {
  const workspace = open(...MAIN_LINES);
  const labels = workspace.completions(MAIN, { line: 4, character: 15 }).map(({ label }) => label);
  for (const label of ['action', 'FindUser', 'User', 'Greet', 'email', 'user']) {
assert.ok(labels.includes(label), label);
}

  // While the file has a syntax error, the names from when it last parsed are offered.
  workspace.set(MAIN, [...MAIN_LINES, '        return (('].join('\n'));
  const broken = workspace.completions(MAIN, { line: 5, character: 16 }).map(({ label }) => label);
  assert.ok(broken.includes('FindUser'));
  assert.ok(!broken.includes('user'));
});

test('offers a name that two imports share only by its modules', () => {
  const workspace = open('import Text', 'import Collections', 'action A(): VOID', '    body', '        return');
  const labels = workspace.completions(MAIN, { line: 4, character: 14 }).map(({ label }) => label);
  assert.ok(labels.includes('Text::length'));
  assert.ok(labels.includes('Collections::length'));
  assert.ok(labels.includes('trim'));
  assert.ok(!labels.includes('length'));
});

test("doesn't give a location in a standard library module, which has no file", () => {
  const workspace = open('import IO', 'action A(): VOID', '    body', '        IO::write("hi")');
  assert.equal(workspace.definition(MAIN, { line: 3, character: 12 }), undefined);
  assert.deepEqual([...workspace.diagnostics().keys()].filter((uri) => !uri.startsWith('file:')), []);
});

test("checks imports of cant:: modules against the stdlib of the Cant that runs the program, with its unsaved changes", () => {
  const io = ['export action write(message: TEXT): VOID', '    native "./IO.js"'].join('\n');
  const disk: Record<string, string> = {
    '/repo/packages/compiler/package.json': JSON.stringify({ name: '@dancrumb/cant-compiler' }),
    '/repo/packages/compiler/stdlib/IO.cant': io,
  };
  const workspace = new Workspace({ readFile: (path) => disk[path] });
  const example = 'file:///repo/examples/main.cant';
  workspace.set(example, ['import IO', 'action Main(): VOID', '    body', '        IO::shout("hi")'].join('\n'));
  assert.deepEqual(workspace.diagnostics().get(example)?.map(({ code }) => code), ['unknown-name']);
  // Adding the action to the open, unsaved IO.cant makes the call valid.
  workspace.set('file:///repo/packages/compiler/stdlib/IO.cant', `${io}\nexport action shout(message: TEXT): VOID\n    native "./IO.js"`);
  assert.deepEqual(workspace.diagnostics().get(example), []);
});
