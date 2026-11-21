import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from './check.ts';
import { formatDiagnostic } from './diagnostic.ts';

/** Check a module and return its diagnostics as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  check(lines.join('\n')).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

test('accepts a valid module', () => {
  assert.deepEqual(
    problems(
      'import IO',
      'model Receipt',
      '    total: NUMBER',
      'action SayHello(): VOID',
      '    body',
      '        IO::write("Hello World!")',
      'trigger SayHello on Start',
    ),
    [],
  );
});

test('reports a syntax error where it is, and stops there', () => {
  const result = check('action A(): VOID\n    body\n        x := := 1');
  assert.equal(result.program, undefined);
  assert.equal(result.symbols, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code, position }) => [code, position.start.line, position.start.column]),
    [['syntax', 3, 14]],
  );
});

test('reports types with the same name in a namespace', () => {
  assert.deepEqual(
    problems(
      'enum Status',
      '    Open',
      'model Status',
      '    name: TEXT',
      'error Status',
      'namespace billing',
      'model Status',
      '    name: TEXT',
    ),
    ['duplicate-declaration 3:7', 'duplicate-declaration 5:7'],
  );
});

test('reports actions with the same name, but lets an action share a name with a type', () => {
  assert.deepEqual(
    problems(
      'action Greet(): VOID',
      '    native "./greet.js"',
      'action Greet(): VOID',
      '    native "./greet.js"',
      'model Greet',
      '    text: TEXT',
    ),
    ['duplicate-declaration 3:8'],
  );
});

test('reports a constant that clashes with any other name in its namespace', () => {
  assert.deepEqual(
    problems(
      'const apiBase := "/api"',
      'const apiBase := "/api/v2"',
      'model Config',
      '    base: TEXT',
      'const Config := 1',
      'action run(): VOID',
      '    native "./run.js"',
      'const run := 2',
      'namespace other',
      'const apiBase := "/other"',
    ),
    ['duplicate-declaration 2:7', 'duplicate-declaration 5:7', 'duplicate-declaration 8:7'],
  );
});

test('reports two exported symbols with the same name, across namespaces and re-exports', () => {
  assert.deepEqual(
    problems(
      'import "./users.cant" into accounts',
      'export const limit := 1',
      'namespace other',
      'export const limit := 2',
      'export accounts::FindUser',
      'export accounts::FindUser as LookupUser',
      'export accounts::LookupUser',
    ),
    ['duplicate-export 4:14', 'duplicate-export 7:18'],
  );
});

test('reports names repeated inside a declaration', () => {
  assert.deepEqual(
    problems(
      'action A(x: TEXT, x?: NUMBER): VOID',
      '    native "./a.js"',
      'model M',
      '    name: TEXT',
      '    name: NUMBER',
      'error E',
      '    data',
      '        code: TEXT',
      '        code: TEXT',
      'enum Status',
      '    Open',
      '    Open',
      '    Shut := "Open"',
      'enum Priority',
      '    Low := 1',
      '    High := 1',
    ),
    [
      'duplicate-parameter 1:19',
      'duplicate-field 5:5',
      'duplicate-field 9:9',
      'duplicate-enum-member 12:5',
      'duplicate-enum-value 13:13',
      'duplicate-enum-value 16:13',
    ],
  );
});

test('reports lines an entity can have only one of', () => {
  assert.deepEqual(
    problems(
      'entity Membership',
      '    membership user in organization',
      '    membership person in team',
      '    identity user',
      '    identity organization',
      '    group org',
      '    role admin',
      '    role admin',
      '    expose',
      '        @all',
      '    expose',
      '        name',
      '    hide',
      '        a',
      '    hide',
      '        b',
    ),
    [
      'duplicate-entity-line 3:5',
      'duplicate-entity-line 5:5',
      'duplicate-entity-line 11:5',
      'duplicate-entity-line 15:5',
      'duplicate-role 8:10',
    ],
  );
});

test('collects declarations into namespaces, and lists what later passes resolve', () => {
  const { symbols } = check(
    [
      'import IO',
      'model Receipt',
      '    total: NUMBER',
      'namespace billing',
      'action Charge(): Receipt',
      '    native "./charge.js"',
      'export const fee := 2',
      'trigger Charge on Start',
      'relation User[tasks] 1 --- 0..* Task[owner]',
      'permissions organization',
      '    "invoices:read"',
    ].join('\n'),
  );
  assert.ok(symbols);
  assert.deepEqual([...symbols.namespaces.keys()], ['__main__', 'billing']);
  assert.deepEqual([...(symbols.namespaces.get('__main__')?.types.keys() ?? [])], ['Receipt']);
  assert.deepEqual([...(symbols.namespaces.get('billing')?.actions.keys() ?? [])], ['Charge']);
  assert.deepEqual([...(symbols.namespaces.get('billing')?.constants.keys() ?? [])], ['fee']);
  assert.deepEqual([...symbols.exports.keys()], ['fee']);
  assert.deepEqual(
    [symbols.imports, symbols.triggers, symbols.relations, symbols.permissions].map((list) =>
      list.map(({ namespace }) => namespace),
    ),
    [['__main__'], ['billing'], ['billing'], ['billing']],
  );
});

test('formats a diagnostic with the line it points to', () => {
  const source = 'model M\n    name: TEXT\n    name: NUMBER';
  const [diagnostic] = check(source).diagnostics;
  assert.ok(diagnostic);
  assert.equal(
    formatDiagnostic('m.cant', source, diagnostic),
    [
      'm.cant:3:5: error: There is already a field called name, on line 2.',
      '  |',
      '3 |     name: NUMBER',
      '  |     ^^^^',
    ].join('\n'),
  );
});
