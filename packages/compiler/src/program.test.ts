import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Host } from './host.ts';
import { checkProgram } from './program.ts';

/** A host whose files live in memory, each given as its lines. */
const memory = (files: Record<string, string[] | string>): Host => ({
  readFile: (path) => {
    const file = files[path];
    return file === undefined ? undefined : typeof file === 'string' ? file : file.join('\n');
  },
});

/** Check the program whose entry module is `/app/main.cant`, and list its problems. */
const problems = (files: Record<string, string[] | string>): string[] =>
  checkProgram('/app/main.cant', memory(files)).diagnostics.map(
    ({ file, code, position }) =>
      `${file ?? '?'} ${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

test('follows relative imports, and resolves the types and actions they bring in', () => {
  const program = checkProgram(
    '/app/main.cant',
    memory({
      '/app/main.cant': [
        'import "./billing/invoices.cant" into billing',
        'action Show(invoice: billing::Invoice): billing::Status',
        '    native "./show.js"',
        'trigger billing::Send on Start',
      ],
      '/app/billing/invoices.cant': [
        'import "./status.cant"',
        'export model Invoice',
        '    total: NUMBER',
        'export Status',
        'export action Send(): VOID',
        '    native "./send.js"',
        'model Private',
        '    x: TEXT',
      ],
      '/app/billing/status.cant': ['export enum Status', '    Open'],
    }),
  );
  assert.deepEqual(program.diagnostics, []);
  assert.deepEqual([...program.modules.keys()], ['/app/main.cant', '/app/billing/invoices.cant', '/app/billing/status.cant']);
  assert.deepEqual(
    [...program.references.values()].map(({ kind, name, module }) => `${kind} ${name} ${module}`),
    [
      'type Invoice /app/billing/invoices.cant',
      'type Status /app/billing/status.cant',
      'action Send /app/billing/invoices.cant',
    ],
  );
});

test('only lets an importer see what a module exports', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': ['import "./lib.cant" into lib', 'const p: lib::Private := 1'],
      '/app/lib.cant': ['model Private', '    x: TEXT'],
    }),
    ['/app/main.cant unknown-name 2:10'],
  );
});

test('resolves symbolic imports through cant.json, including from a directory above', () => {
  assert.deepEqual(
    problems({
      '/cant.json': '{ "scopes": { "acme": "./vendor/acme/", "app": "./app/" } }',
      '/app/main.cant': [
        'import acme::Payments into payments',
        'import app::Shared',
        'action Pay(): payments::Receipt',
        '    native "./pay.js"',
        'const c: Note := { text := "n" }',
      ],
      '/vendor/acme/Payments.cant': ['export model Receipt', '    total: NUMBER'],
      '/app/Shared.cant': ['export model Note', '    text: TEXT'],
    }),
    [],
  );
});

test('reports scopes that no manifest maps, and modules that are missing', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': ['import acme::Payments', 'import "./missing.cant"', 'import cant::Nope'],
    }),
    [
      '/app/main.cant unknown-scope 1:8',
      '/app/main.cant module-not-found 3:8',
      '/app/main.cant module-not-found 2:8',
    ],
  );
  assert.deepEqual(
    problems({
      '/app/cant.json': '{ "scopes": { "other": "./other/" } }',
      '/app/main.cant': ['import acme::Payments'],
    }),
    ['/app/main.cant unknown-scope 1:8'],
  );
});

test('reports manifests that break the rules', () => {
  assert.deepEqual(
    problems({
      '/app/cant.json': '{ "scopes": { "cant": "./std/", "a": "./a", "b": "https://example.com/b/", "c": 3 } }',
      '/app/main.cant': [],
    }),
    ['/app/cant.json manifest 1:15', '/app/cant.json manifest 1:33', '/app/cant.json manifest 1:45', '/app/cant.json manifest 1:76'],
  );
  assert.deepEqual(
    problems({ '/app/cant.json': '{ "scopes": ', '/app/main.cant': [] }),
    ['/app/cant.json manifest 1:1'],
  );
});

test('rejects remote modules and module types, for imports and native actions', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': [
        'import "https://example.com/http.cant"',
        'import "./config.json" as "json"',
        'action A(): VOID',
        '    native "https://example.com/a.js"',
        'action B(): VOID',
        '    native "file:///app/b.js"',
      ],
    }),
    ['/app/main.cant remote-module 1:8', '/app/main.cant module-type 2:27', '/app/main.cant remote-module 4:12'],
  );
});

test('gives the standard library its names', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': [
        'import cant::Errors into Errors',
        'import Collections',
        'action Average(total: NUMBER, count: NUMBER): NUMBER raises Errors::DivisionByZero, Errors::Nope',
        '    native "./average.js"',
        'trigger length on Start',
      ],
    }),
    ['/app/main.cant unknown-name 3:85'],
  );
});

test('reports names that clash when an import places them', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': [
        'import "./a.cant"',
        'import "./b.cant"',
        'import "./a.cant" into again',
        'import "./a.cant"',
        'model Thing',
        '    x: TEXT',
      ],
      '/app/a.cant': ['export model Thing', '    x: TEXT', 'export const limit := 1'],
      '/app/b.cant': ['export action limit(): VOID', '    native "./limit.js"'],
    }),
    [
      // `Thing` clashes with the model main.cant declares, and `limit`, a constant, with b's action.
      '/app/main.cant import-collision 1:8',
      '/app/main.cant import-collision 2:8',
      '/app/main.cant import-collision 4:8',
    ],
  );
});

test('resolves re-exports, and reports re-exports of names that are not imported', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': ['import "./lib.cant" into lib', 'const a: lib::Renamed := { x := "a" }', 'const b: lib::Inner := 2'],
      '/app/lib.cant': [
        'import "./inner.cant" into inner',
        'export inner::Inner as Renamed',
        'export inner::Missing',
        'export model Own',
        '    x: TEXT',
        'export Own',
      ],
      '/app/inner.cant': ['export model Inner', '    x: TEXT'],
    }),
    [
      // `Own` is exported twice: once by `export model`, once by the re-export.
      '/app/lib.cant duplicate-export 6:8',
      '/app/lib.cant unknown-name 3:8',
      '/app/lib.cant re-export-own 6:8',
      '/app/main.cant unknown-name 3:10',
    ],
  );
});

test('survives import cycles', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': ['import "./a.cant" into a', 'action F(x: a::A): VOID', '    native "./f.js"'],
      '/app/a.cant': ['import "./b.cant" into b', 'export model A', '    other: b::B'],
      '/app/b.cant': ['import "./a.cant" into a', 'export model B', '    other: a::A'],
    }),
    [],
  );
});

test('resolves names in the current namespace, and reports unknown names and namespaces', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': [
        'model Note',
        '    text: TEXT',
        'namespace billing',
        'model Invoice',
        '    note: Note',
        '    items: [Item]',
        '    owner: nowhere::User',
        'namespace __main__',
        'action Ok(invoice: billing::Invoice): VOID',
        '    native "./ok.js"',
      ],
    }),
    ['/app/main.cant unknown-name 5:11', '/app/main.cant unknown-name 6:13', '/app/main.cant unknown-namespace 7:12'],
  );
});

test('reports names that are the wrong kind of thing', () => {
  assert.deepEqual(
    problems({
      '/app/main.cant': [
        'model Receipt',
        '    total: NUMBER',
        'error Declined',
        'entity User',
        '    models',
        '        Declined',
        'action Pay(r: Declined): VOID raises Receipt',
        '    body',
        '        if r instanceOf Declined',
        '            raise Receipt',
        '        if @subject is Receipt',
        '            return',
        'error Failed',
        '    data Declined',
        'trigger Receipt on Start',
        'relation User[receipts] 1 --- 0..* Receipt[user]',
      ],
    }),
    [
      '/app/main.cant wrong-kind 6:9',
      '/app/main.cant error-as-type 7:15',
      '/app/main.cant wrong-kind 7:38',
      '/app/main.cant wrong-kind 10:19',
      '/app/main.cant wrong-kind 11:24',
      '/app/main.cant wrong-kind 14:10',
      '/app/main.cant wrong-kind 15:9',
      '/app/main.cant wrong-kind 16:36',
    ],
  );
});

test('reports a missing entry file', () => {
  assert.deepEqual(problems({}), ['/app/main.cant module-not-found 1:1']);
});

test('places a plain symbolic import in a namespace named after the module too', () => {
  assert.deepEqual(
    problems({
      '/cant.json': '{ "scopes": { "acme": "./acme/" } }',
      '/acme/Payments.cant': ['export model Receipt', '    total: NUMBER'],
      '/app/main.cant': [
        'import IO',
        'import acme::Payments',
        'import Collections into C',
        'import "./local.cant"',
        'action Say(r: Payments::Receipt, s: Receipt): VOID',
        '    body',
        '        IO::write("Hello")',
        '        write("Hello")',
        '        C::length(coll := [1])',
        '        Collections::length(coll := [1])',
        '        local::Thing()',
      ],
      '/app/local.cant': ['export action Thing(): VOID', '    native "./thing.js"'],
    }),
    // `into` places symbols only where it says, and a URL import has no module name.
    ['/app/main.cant unknown-namespace 10:9', '/app/main.cant unknown-namespace 11:9'],
  );
});
