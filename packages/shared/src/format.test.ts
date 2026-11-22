import assert from 'node:assert/strict';
import { test } from 'node:test';
import { format } from './format.ts';
import { ParseError } from './parse.ts';

/** Source from lines, with a final line break. */
const lines = (...source: string[]): string => `${source.join('\n')}\n`;

/** An action whose body holds the given statements, each line indented to the body. */
const inBody = (...statements: string[]): string =>
  lines('action A(): VOID', '    body', ...statements.map((statement) => (statement === '' ? '' : `        ${statement}`)));

/** Assert that `source` formats to `expected`, and that formatting that changes nothing. */
const formatsTo = (source: string, expected: string): void => {
  assert.equal(format(source), expected);
  assert.equal(format(expected), expected);
};

test('formats an empty file as an empty file', () => {
  assert.equal(format(''), '');
  assert.equal(format('\n\n'), '');
});

test('spaces declarations, signatures and named values', () => {
  formatsTo(
    lines(
      'import   acme::Payments   into payments',
      'export const LIMIT:NUMBER:=0xFF_FF',
      'action SayHello( name:TEXT , greeting ?:TEXT:="Hi" ):VOID passes @all',
      '    body',
      '        IO::write(stream:=@stdout, message:="Hello")',
      'trigger SayHello on Start',
    ),
    lines(
      'import acme::Payments into payments',
      'export const LIMIT: NUMBER := 0xFF_FF',
      'action SayHello(name: TEXT, greeting?: TEXT := "Hi"): VOID passes @all',
      '    body',
      '        IO::write(stream := @stdout, message := "Hello")',
      'trigger SayHello on Start',
    ),
  );
});

test('indents blocks by four spaces, whatever the source uses', () => {
  formatsTo(
    lines('enum Status', '\tDraft', '\tPaid := "paid"', 'model M', '  a: [TEXT]', '  b?: {NUMBER}'),
    lines('enum Status', '    Draft', '    Paid := "paid"', 'model M', '    a: [TEXT]', '    b?: {NUMBER}'),
  );
});

test('keeps literals as they are written', () => {
  formatsTo(
    inBody('x := 0b1010 + 1_000.5e3', 'y := "tab\\t \\u{1F600} \\$ ${ a+b }"', 'z := DATE_TIME( "2026-11-21T09:30:00Z" )'),
    inBody('x := 0b1010 + 1_000.5e3', 'y := "tab\\t \\u{1F600} \\$ ${a + b}"', 'z := DATE_TIME("2026-11-21T09:30:00Z")'),
  );
});

test('writes only the parentheses that precedence needs', () => {
  formatsTo(
    inBody(
      'a := ((x + y)) * z',
      'b := x - (y - z)',
      'c := (x - y) - z',
      'd := x ** (y ** z)',
      'e := (x ** y) ** z',
      'f := -(x ** 2)',
      'g := !(x and y)',
      'h := (x == y) == z',
      'i := (x orElse y) orElse - z',
      'j := @subject can "p" within (org.parent)',
      'k := (1).x',
    ),
    inBody(
      'a := (x + y) * z',
      'b := x - (y - z)',
      'c := x - y - z',
      'd := x ** y ** z',
      'e := (x ** y) ** z',
      'f := -(x ** 2)',
      'g := !(x and y)',
      'h := (x == y) == z',
      'i := x orElse y orElse -z',
      'j := @subject can "p" within org.parent',
      'k := (1).x',
    ),
  );
});

test('keeps parentheses that make grouping plain', () => {
  formatsTo(inBody('a := x and y or z', 'b := (-x) ** 2'), inBody('a := (x and y) or z', 'b := (-x) ** 2'));
});

test('keeps a collection on one line if it is written on one line', () => {
  formatsTo(
    inBody('a := [ 1,2 , 3, ]', 'b := {name:="Ada"}', 'c := SET( 1 )', 'd := {}', 'e := {', '}'),
    inBody('a := [1, 2, 3]', 'b := { name := "Ada" }', 'c := SET(1)', 'd := {}', 'e := {}'),
  );
});

test('puts each item of a collection that spans lines on its own line, with a trailing comma', () => {
  formatsTo(
    inBody('subject := { name := "Ada", tags := [1,', '    2] }', 'Call(values := SET(1,', '2))'),
    inBody(
      'subject := {',
      '    name := "Ada",',
      '    tags := [',
      '        1,',
      '        2,',
      '    ],',
      '}',
      'Call(values := SET(',
      '    1,',
      '    2,',
      '))',
    ),
  );
});

test('keeps comments at the ends of lines, lining up those on consecutive lines', () => {
  formatsTo(
    inBody('x := 1 // one', 'longer := 2      // two', '', 'y := 3        // alone'),
    inBody('x := 1       // one', 'longer := 2  // two', '', 'y := 3  // alone'),
  );
});

test('keeps comments on their own lines, indented with the code they belong to', () => {
  formatsTo(
    lines(
      '// header',
      '',
      'action A(): VOID',
      '  // before body',
      '  body',
      '      x := 1',
      '      // end of the block',
      '// before the trigger',
      'trigger A on Start',
      '// end of file',
    ),
    lines(
      '// header',
      '',
      'action A(): VOID',
      '    // before body',
      '    body',
      '        x := 1',
      '        // end of the block',
      '// before the trigger',
      'trigger A on Start',
      '// end of file',
    ),
  );
});

test('keeps a block that holds only comments', () => {
  formatsTo(
    lines('action A(): VOID', '  body', '     // to do', 'action B(): VOID', '  body', '    if x', '      // to do', '    else', '      return'),
    lines(
      'action A(): VOID',
      '    body',
      '        // to do',
      'action B(): VOID',
      '    body',
      '        if x',
      '            // to do',
      '        else',
      '            return',
    ),
  );
});

test('keeps comments inside a collection', () => {
  formatsTo(
    inBody('x := { // first', '  a := 1,', '  // before b', '  b := 2 // b', '}'),
    inBody('x := {  // first', '    a := 1,', '    // before b', '    b := 2,  // b', '}'),
  );
});

test('formats a file of only comments', () => {
  formatsTo('// one\n\n\n   // two', lines('// one', '', '// two'));
});

test('keeps single blank lines, but none at the start of a block or before a closing bracket', () => {
  formatsTo(
    lines('import IO', '', '', '', 'action A(): VOID', '    body', '', '        x := {', '', '            a := 1', '', '        }', '', '        y := 2', ''),
    lines('import IO', '', 'action A(): VOID', '    body', '        x := {', '            a := 1,', '        }', '', '        y := 2'),
  );
});

test("keeps a trigger's blocks and an action's clauses in source order", () => {
  formatsTo(
    lines(
      'action A(): VOID passes @all raises Bad',
      '    native "./a.ts"',
      'trigger A on TestCase',
      '    parameters',
      '        name := "case"',
      '    auth',
      '        @subject is User',
      '    assertions',
      '        @result == 1, "one"',
    ),
    lines(
      'action A(): VOID passes @all raises Bad',
      '    native "./a.ts"',
      'trigger A on TestCase',
      '    parameters',
      '        name := "case"',
      '    auth',
      '        @subject is User',
      '    assertions',
      '        @result == 1, "one"',
    ),
  );
});

test('formats entities, errors, permissions and relations', () => {
  formatsTo(
    lines(
      'entity User',
      '  subject',
      '  identity email,name',
      '  membership user in org   with roles',
      '  expose',
      '    email   as address',
      '    @all',
      'error Bad',
      '  data',
      '    reason:TEXT',
      'permissions org   has admin',
      '  "invoice.approve"',
      'relation User[ tasks ] 1 --- 0..* Task[owner]',
    ),
    lines(
      'entity User',
      '    subject',
      '    identity email, name',
      '    membership user in org with roles',
      '    expose',
      '        email as address',
      '        @all',
      'error Bad',
      '    data',
      '        reason: TEXT',
      'permissions org has admin',
      '    "invoice.approve"',
      'relation User[tasks] 1 --- 0..* Task[owner]',
    ),
  );
});

test('keeps Windows line endings', () => {
  formatsTo('import IO\r\naction A():VOID\r\n    body\r\n        return\r\n', 'import IO\r\naction A(): VOID\r\n    body\r\n        return\r\n');
});

test('rejects source that is not valid Cant', () => {
  assert.throws(() => format('action ('), ParseError);
});

test("formats the standard library's type parameters and generic types", () => {
  formatsTo(
    lines('export action concat < C : Collection > ( src:C, tgt:C ):C', '    native "./c.js"', 'export action length<T>(coll: Collection< T >): NUMBER', '    native "./c.js"'),
    lines('export action concat<C: Collection>(src: C, tgt: C): C', '    native "./c.js"', 'export action length<T>(coll: Collection<T>): NUMBER', '    native "./c.js"'),
  );
});
