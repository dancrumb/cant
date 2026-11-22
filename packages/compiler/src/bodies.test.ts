import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';

/** Check `/app/main.cant`, given as its lines, and list its problems as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  checkProgram('/app/main.cant', { readFile: (path) => (path === '/app/main.cant' ? lines.join('\n') : undefined) }).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

test('resolves parameters, locals, loop variables and top-level constants', () => {
  assert.deepEqual(
    problems(
      'const limit := 10',
      'action Sum(items: [NUMBER], start?: NUMBER := limit): NUMBER',
      '    body',
      '        total := [start]',
      '        for item in items',
      '            next := item + limit',
      '            total[0] := next',
      '        return total[0] orElse 0',
    ),
    [],
  );
});

test('reports names that are not in scope', () => {
  assert.deepEqual(
    problems(
      'action A(): VOID',
      '    body',
      '        if true',
      '            inner := 1',
      '        x := inner',
      '        y := later',
      '        later := 2',
      '        for item in [1]',
      '            z := item',
      '        w := item',
    ),
    ['unknown-name 5:14', 'unknown-name 6:14', 'unknown-name 10:14'],
  );
});

test('lets defaults use other parameters, and field defaults other fields', () => {
  assert.deepEqual(
    problems(
      'action Range(end?: NUMBER := start, start: NUMBER): VOID',
      '    body',
      '        return',
      'model Person',
      '    name: TEXT',
      '    displayName?: TEXT := name',
      '    nickname?: TEXT := missing',
    ),
    ['unknown-name 7:24'],
  );
});

test('reports an identifier assigned twice in one block, but allows shadowing', () => {
  assert.deepEqual(
    problems(
      'action A(name: TEXT): VOID',
      '    body',
      '        name := "shadows the parameter"',
      '        user := 1',
      '        user := 2',
      '        if true',
      '            user := 3',
      '        for item in [1]',
      '            item := 2',
    ),
    ['reassignment 5:9', 'reassignment 9:13'],
  );
});

test('reports break and continue outside a loop', () => {
  assert.deepEqual(
    problems(
      'action A(): VOID',
      '    body',
      '        while true',
      '            if true',
      '                break',
      '            continue',
      '        break',
    ),
    ['outside-loop 7:9'],
  );
});

test('resolves calls, and reports what can not be called', () => {
  assert.deepEqual(
    problems(
      'import IO into IO',
      'model M',
      '    x: TEXT',
      'const c := 1',
      'action Run(): VOID',
      '    body',
      '        IO::write("hi")',
      '        local := 1',
      '        local()',
      '        M()',
      '        Missing()',
      '        IO::stdout.write("hi")',
      '        c()',
    ),
    ['not-callable 9:9', 'not-callable 10:9', 'unknown-name 11:9', 'not-callable 12:9', 'not-callable 13:9'],
  );
});

test('reports actions and types used as values', () => {
  assert.deepEqual(
    problems(
      'enum Status',
      '    Open',
      'model M',
      '    x: TEXT',
      'action Run(): VOID',
      '    body',
      '        a := Run',
      '        b := Status',
      '        c := M',
    ),
    ['action-as-value 7:14', 'type-as-value 8:14', 'type-as-value 9:14'],
  );
});

test('checks call arguments against parameters, with the short forms', () => {
  assert.deepEqual(
    problems(
      'action Greet(user: TEXT, greeting?: TEXT := "Hello"): VOID',
      '    native "./greet.js"',
      'action Set(id: TEXT, status: TEXT): VOID',
      '    native "./set.js"',
      'action Run(id: TEXT, status: TEXT): VOID',
      '    body',
      '        Greet(user := "Ada")',
      '        Greet("Ada")',
      '        Greet(user := "Ada", greeting := "Hi")',
      '        Set(id, status)',
      '        Greet("Ada", greeting := "Hi")',
      '        Greet(nobody := 1)',
      '        Greet(user := "a", user := "b")',
      '        Set(id)',
      '        Set("x")',
    ),
    [
      'unnamed-argument 11:15',
      'unknown-parameter 12:15',
      'missing-argument 12:9',
      'duplicate-argument 13:28',
      'missing-argument 14:9',
      'unnamed-argument 15:13',
    ],
  );
});

test('checks trigger arguments and TestCase parameters', () => {
  assert.deepEqual(
    problems(
      'action Greet(user: TEXT, greeting?: TEXT): VOID',
      '    native "./greet.js"',
      'trigger Greet on Start',
      '    arguments',
      '        greeting := "Hi"',
      '        other := 1',
      'trigger Greet on TestCase',
      '    parameters',
      '        title := "greets"',
      '    arguments',
      '        user := "Ada"',
    ),
    ['unknown-parameter 6:9', 'missing-argument 3:9', 'unknown-parameter 9:9', 'missing-parameter 7:18'],
  );
});

test('resolves enum members, unless a local shadows the enum', () => {
  assert.deepEqual(
    problems(
      'enum Status',
      '    Open',
      '    Closed',
      'action Run(): VOID',
      '    body',
      '        a := Status.Open',
      '        b := Status.Pending',
      '        Status := { Pending := 1 }',
      '        c := Status.Pending',
    ),
    ['unknown-enum-member 7:21'],
  );
});

test('checks built-in values and where they are used', () => {
  assert.deepEqual(
    problems(
      'const bad := @now',
      'action Run(): VOID',
      '    body',
      '        a := @subject',
      '        b := @now',
      '        c := @request',
      '        d := @nope',
      '        e := @all',
      '        if @subject is @now',
      '            return',
      'trigger Run on Start',
      '    parameters',
      '        when := @now',
      '    auth',
      '        @subject is @defined and @error == @result',
    ),
    [
      'misplaced-built-in 1:14',
      'misplaced-built-in 6:14',
      'unknown-built-in 7:14',
      'misplaced-built-in 8:14',
      'misplaced-built-in 9:24',
      'misplaced-built-in 13:17',
      'misplaced-built-in 15:34',
    ],
  );
});

test('lets the standard streams be used anywhere but in a constant expression', () => {
  assert.deepEqual(
    problems(
      'const bad := @stdin',
      'action Run(): VOID',
      '    body',
      '        a := @stdin',
      '        b := @stdout',
      '        c := @stderr',
      'trigger Run on Start',
      '    auth',
      '        @stdout == @stderr',
    ),
    ['misplaced-built-in 1:14'],
  );
});

test("checks a TestCase's subject and assertions", () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    email: TEXT',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "runs as Ada"',
      '        subject := { @entity := User, email := "ada@example.com" }',
      '    assertions',
      '        isEmpty @error, "it works: ${@result}"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "needs an entity"',
      '        subject := { email := "ada@example.com", @nope := 1 }',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "not an entity"',
      '        subject := { @entity := UserRecord }',
      'const x := { @entity := User }',
    ),
    [
      'misplaced-built-in 19:50',
      'missing-entity 19:20',
      'wrong-kind 23:33',
      'misplaced-built-in 24:14',
      // Run can't give an error, and returns VOID, which can't be interpolated.
      'no-errors 15:17',
      'not-text 15:38',
    ],
  );
});
