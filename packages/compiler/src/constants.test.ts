import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Host } from './host.ts';
import { checkProgram } from './program.ts';

/** A host whose files live in memory, each given as its lines. */
const memory = (files: Record<string, string[]>): Host => ({
  readFile: (path) => files[path]?.join('\n'),
});

/** Check `/app/main.cant`, given as its lines, and list its problems as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  checkProgram('/app/main.cant', memory({ '/app/main.cant': lines })).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

test('requires constant expressions for constants and source parameters', () => {
  assert.deepEqual(
    problems(
      'enum Status',
      '    Open',
      'const base := "/api"',
      'const path := "${base}/v1"',
      'const status := Status.Open',
      'const retries := { attempts := 3, delay := DURATION("PT1S") }',
      'const attempts := retries.attempts * 2',
      'const list := [1, 2]',
      'const called := Make()',
      'action Make(): NUMBER',
      '    native "./make.js"',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on HttpRequest',
      '    parameters',
      '        path := "${base}/run"',
      '        method := Make()',
    ),
    ['not-constant 8:15', 'not-constant 9:17', 'not-constant 17:19'],
  );
});

test("requires a test case's subject fields to be constant, but not its @entity", () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    email: TEXT',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      'action Email(): TEXT',
      '    native "./email.js"',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "runs"',
      '        subject := { @entity := User, email := Email() }',
    ),
    ['not-constant 15:48'],
  );
});

test('reports models that hold entities, when they make up an entity', () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    name: TEXT',
      'entity User',
      '    models',
      '        UserRecord',
      'model Line',
      '    owner: User',
      'model TaskRecord',
      '    lines: [Line]',
      'entity Task',
      '    models',
      '        TaskRecord',
      'model Request',
      '    user: User',
      'action Handle(request: Request): VOID',
      '    native "./handle.js"',
    ),
    ['model-holds-entity 12:9'],
  );
});

test('reports defaults that depend on each other in a cycle', () => {
  assert.deepEqual(
    problems(
      'action Range(start?: NUMBER := end, end?: NUMBER := start, step?: NUMBER := 1): VOID',
      '    native "./range.js"',
      'model Name',
      '    first: TEXT',
      '    display?: TEXT := first',
      '    a?: TEXT := b',
      '    b?: TEXT := c',
      '    c?: TEXT := a',
    ),
    ['default-cycle 1:14', 'default-cycle 6:5'],
  );
});

test('reports test cases with the same name across the program, including names from constants', () => {
  const program = checkProgram(
    '/app/main.cant',
    memory({
      '/app/main.cant': [
        'import "./more.cant"',
        'const suite := "invoices"',
        'action Run(): VOID',
        '    native "./run.js"',
        'trigger Run on TestCase',
        '    parameters',
        '        name := "${suite}: totals"',
        'trigger Run on TestCase',
        '    parameters',
        '        name := "invoices: totals"',
        'trigger Run on TestCase',
        '    parameters',
        '        name := "invoices: refunds"',
      ],
      '/app/more.cant': [
        'action Other(): VOID',
        '    native "./other.js"',
        'trigger Other on TestCase',
        '    parameters',
        '        name := "invoices: refunds"',
      ],
    }),
  );
  assert.deepEqual(
    program.diagnostics.map(({ file, code, position }) => `${file ?? ''} ${code} ${String(position.start.line)}`),
    ['/app/main.cant duplicate-test-case 10', '/app/more.cant duplicate-test-case 5'],
  );
});

test('treats equal dates and durations written differently as the same enum value', () => {
  assert.deepEqual(
    problems(
      'enum Grace',
      '    Short := DURATION("PT60M")',
      '    Hour := DURATION("PT1H")',
      'enum When',
      '    Utc := DATE_TIME("2026-01-01T00:00Z")',
      '    Paris := DATE_TIME("2026-01-01T01:00+01:00")',
    ),
    ['duplicate-enum-value 3:13', 'duplicate-enum-value 6:14'],
  );
});

test('reports constants whose values would fail when the program starts', () => {
  assert.deepEqual(
    problems(
      'const far := DATE_TIME("9999-12-31T00:00Z") + DURATION("P99999999D")',
      'const huge := 10 ** 400',
      'const fine := DATE_TIME("2026-11-21T00:00Z") + DURATION("P1D")',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on Schedule',
      '    parameters',
      '        every := DURATION("PT1H") * 10 ** 400',
    ),
    ['constant-panics 1:14', 'constant-panics 2:15', 'constant-panics 8:37'],
  );
});

test('compares test case names built from any constant value', () => {
  assert.deepEqual(
    problems(
      'enum Plan',
      '    pro := "Pro"',
      'const rate := 1.5',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "${Plan.pro} at ${rate}"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "Pro at 1.5"',
    ),
    ['duplicate-test-case 11:17'],
  );
});

test('finds zero divisors through constants, locals and durations', () => {
  assert.deepEqual(
    problems(
      'const none := 2 - 2',
      'action A(n: NUMBER, d: DURATION): VOID',
      '    body',
      '        zero := none * 3',
      '        a := n / none',
      '        b := n / zero',
      '        c := d / DURATION("PT0S")',
    ),
    ['division-by-zero 5:18', 'division-by-zero 6:18', 'division-by-zero 7:18'],
  );
});
