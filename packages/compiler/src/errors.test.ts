import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';

/** Check `/app/main.cant`, given as its lines, and list its problems as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  checkProgram('/app/main.cant', { readFile: (path) => (path === '/app/main.cant' ? lines.join('\n') : undefined) }).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

/** Errors and actions the tests share, on lines 1 to 15. */
const DECLARATIONS = [
  'import cant::Errors into Errors',
  'model User',
  '    name: TEXT',
  'error UserNotFound',
  'error AccountLocked',
  '    data',
  '        attempts: NUMBER',
  'error PaymentDeclined',
  '    data',
  '        reason: TEXT',
  '        retryable?: BOOLEAN := false',
  'action FindUser(email: TEXT): User raises UserNotFound, AccountLocked',
  '    native "./find.js"',
  'action Save(user: User): VOID raises PaymentDeclined',
  '    native "./save.js"',
];

test('accepts results that are checked, passed, ignored or used', () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action Welcome(email: TEXT): TEXT',
      '    body',
      '        result := FindUser(email)',
      '        if result instanceOf UserNotFound',
      '            return "No such user"',
      '        if result instanceOf AccountLocked',
      '            return "Locked after ${result.data.attempts} attempts"',
      '        return "Welcome, ${result.name}"',
      'action Passes(email: TEXT): User passes UserNotFound, AccountLocked',
      '    body',
      '        pass FindUser(email)',
      'action Uses(email: TEXT): TEXT',
      '    body',
      '        name := FindUser(email).name',
      '        Save(user := { name := name })',
      '        ignore Save(user := { name := name })',
      '        kept := ignore FindUser(email)',
      '        return name',
      'action Any(email: TEXT): TEXT',
      '    body',
      '        result := FindUser(email)',
      '        if result instanceOf ERROR',
      '            return "failed"',
      '        return result.name',
    ),
    [],
  );
});

test('reports results that are never handled, or only partly', () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action A(email: TEXT): TEXT',
      '    body',
      '        user := FindUser(email)',
      '        other := FindUser(email)',
      '        if other instanceOf UserNotFound',
      '            return "No such user"',
      '        return "Done"',
    ),
    ['unhandled-result 18:9', 'unhandled-result 19:9'],
  );
});

test("reports a return of an unchecked result, but not of a used one's value", () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action A(email: TEXT): User passes UserNotFound, AccountLocked',
      '    body',
      '        result := FindUser(email)',
      '        return result',
      'action B(email: TEXT): TEXT',
      '    body',
      '        return FindUser(email).name',
      'action C(email: TEXT): TEXT',
      '    body',
      '        name := FindUser(email).name',
      '        return name',
    ),
    ['return-unchecked 19:16', 'return-unchecked 22:16'],
  );
});

test('checks raise: that the error is declared, and its data', () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action Charge(): VOID raises PaymentDeclined, UserNotFound passes AccountLocked',
      '    body',
      '        if true',
      '            raise PaymentDeclined(reason := "Card expired")',
      '        if true',
      '            raise PaymentDeclined(reason := "x", retryable := "no")',
      '        if true',
      '            raise PaymentDeclined',
      '        if true',
      '            raise PaymentDeclined with { reason := "x" }',
      '        if true',
      '            raise UserNotFound(name := 1)',
      '        if true',
      '            raise AccountLocked(attempts := 3)',
      '        raise PaymentDeclined(code := 1)',
    ),
    [
      'type-mismatch 21:63',
      'missing-argument 23:19',
      'no-data 27:19',
      'undeclared-error 29:19',
      'unknown-parameter 30:31',
      'missing-argument 30:15',
    ],
  );
});

test('checks pass: only declared errors, and only errors or results', () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action A(email: TEXT): User passes UserNotFound',
      '    body',
      '        pass FindUser(email)',
      'action B(email: TEXT): User passes @all',
      '    body',
      '        pass FindUser(email)',
      'action C(email: TEXT): User passes UserNotFound',
      '    body',
      '        pass email',
      'action D(email: TEXT): TEXT passes UserNotFound, AccountLocked',
      '    body',
      '        pass FindUser(email)',
      'action E(email: TEXT): User passes UserNotFound',
      '    body',
      '        result := FindUser(email)',
      '        if result instanceOf UserNotFound',
      '            pass result',
      '        if result instanceOf AccountLocked',
      '            pass result',
      '        return result',
    ),
    ['undeclared-error 18:14', 'pass-non-error 24:14', 'type-mismatch 27:14', 'undeclared-error 34:18'],
  );
});

test('checks error clauses', () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'action A(): VOID raises UserNotFound passes UserNotFound',
      '    body',
      '        return',
      'action B(): VOID passes @all, @all',
      '    body',
      '        return',
      'action C(): VOID passes UserNotFound',
      '    native "./c.js"',
    ),
    ['duplicate-error 16:45', 'duplicate-error 19:31', 'native-passes 22:25'],
  );
});

test('checks division and modulo, with constant divisors', () => {
  assert.deepEqual(
    problems(
      'import cant::Errors into Errors',
      'const hour := 60 * 60',
      'action Average(total: NUMBER, count: NUMBER): NUMBER raises Errors::DivisionByZero',
      '    body',
      '        average := total / count',
      '        if average instanceOf Errors::DivisionByZero',
      '            raise Errors::DivisionByZero',
      '        return average',
      'action Hours(seconds: NUMBER): NUMBER',
      '    body',
      '        return seconds / hour',
      'action Unchecked(total: NUMBER, count: NUMBER): NUMBER',
      '    body',
      '        return total / count',
      'action Zero(n: NUMBER): NUMBER',
      '    body',
      '        return n / (2 - 2)',
      'action Modulo(n: NUMBER): NUMBER',
      '    body',
      '        a := 7.5 % 2',
      '        b := n % 3',
      '        return 7 % 3',
    ),
    ['return-unchecked 14:16', 'division-by-zero 17:21', 'fractional-modulo 20:14', 'unhandled-result 21:9'],
  );
});

test('requires raises for errors from statements, unless they are ignored', () => {
  assert.deepEqual(
    problems(
      'import cant::Errors into Errors',
      'import Collections into Collections',
      'model Customer',
      '    name: TEXT',
      '    nickname?: TEXT',
      'enum Status',
      '    open',
      'model UserRecord',
      '    name: TEXT',
      'entity User',
      '    models',
      '        UserRecord',
      'model TaskRecord',
      '    title: TEXT',
      'entity Task',
      '    models',
      '        TaskRecord',
      'relation User[tasks] 1 --- 0..* Task[owner]',
      'action A(scores: [NUMBER], i: NUMBER, c: Customer, field: TEXT, task: Task, user: User, code: TEXT): Status',
      '    body',
      '        scores[0] := 1',
      '        scores[i] := 1',
      '        ignore scores[i] := 1',
      '        c[field] := "x"',
      '        delete c[field]',
      '        task.owner := user',
      '        Collections::remove(set := user.tasks, value := task)',
      '        ignore Collections::remove(set := user.tasks, value := task)',
      '        return code',
    ),
    [
      'undeclared-error 22:16',
      'undeclared-error 24:11',
      'undeclared-error 25:18',
      'undeclared-error 26:14',
      'undeclared-error 27:9',
      'undeclared-error 29:16',
    ],
  );
});

test("types @result and @error in a test case's assertions", () => {
  assert.deepEqual(
    problems(
      ...DECLARATIONS,
      'trigger FindUser on TestCase',
      '    parameters',
      '        name := "finds Ada"',
      '    arguments',
      '        email := "ada@example.com"',
      '    assertions',
      '        isEmpty @error, "it finds her"',
      '        @result.name == "Ada", "it is Ada: ${@result.name}"',
      'trigger FindUser on TestCase',
      '    parameters',
      '        name := "reports a lock"',
      '    arguments',
      '        email := "locked@example.com"',
      '    assertions',
      '        !isEmpty @error, "it fails"',
      '        @error instanceOf AccountLocked, "the account is locked"',
      '        @error.data.attempts > 3, "after several attempts"',
      '        @error.data.missing, "nothing"',
    ),
    ['unknown-field 33:21'],
  );
});
