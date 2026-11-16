import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionDeclaration } from './ast.ts';
import { parse, ParseError } from './parse.ts';

/** Copy a tree without its `position` fields, so tests can compare just its shape. */
const withoutPositions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutPositions);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'position')
      .map(([key, child]) => [key, withoutPositions(child)]),
  );
};

const identifier = (value: string) => ({ type: 'identifier', value });
const qualified = (namespace: string, name: string) => ({
  type: 'qualifiedIdentifier',
  namespace: identifier(namespace),
  name: identifier(name),
});
const builtIn = (name: string) => ({ type: 'builtIn', name });
const moduleName = (name: string) => ({
  type: 'moduleName',
  name: identifier(name),
});
const string = (value: string) => ({
  type: 'string',
  parts: value === '' ? [] : [{ type: 'text', value }],
});
const number = (value: number) => ({ type: 'number', value });
const boolean = (value: boolean) => ({ type: 'boolean', value });
const baseType = (name: string) => ({ type: 'baseType', name });
const argument = (value: unknown, name?: string) => ({
  type: 'argument',
  ...(name !== undefined && { name: identifier(name) }),
  value,
});
const call = (callee: unknown, ...args: unknown[]) => ({ type: 'call', callee, arguments: args });
const binary = (operator: string, left: unknown, right: unknown) => ({
  type: 'binary',
  operator,
  left,
  right,
});
const unary = (operator: string, value: unknown) => ({ type: 'unary', operator, argument: value });
const member = (object: unknown, property: string) => ({
  type: 'member',
  object,
  property: identifier(property),
});
const index = (object: unknown, value: unknown) => ({ type: 'index', object, index: value });
const statement = (expression: unknown) => ({
  type: 'expressionStatement',
  expression,
});

/** Parse a program and return its declarations without positions. */
const parseProgram = (...lines: string[]): unknown =>
  withoutPositions(parse(lines.join('\n')).children);

/** Parse a single action and return it. */
const parseAction = (source: string): ActionDeclaration => {
  const [action] = parse(source).children;
  assert.equal(action?.type, 'action');
  return action;
};

/** Parse statements as the body of an action, and return them without positions. */
const parseBody = (...lines: string[]): unknown =>
  withoutPositions(
    parseAction(['action A():VOID', '  body', ...lines.map((line) => `    ${line}`)].join('\n'))
      .children,
  );

/** Parse an expression, as the value of a `return`, and return it without positions. */
const parseExpression = (source: string): unknown => {
  const [returned] = parseAction(`action A(): TEXT\n  body\n    return ${source}`).children;
  assert.equal(returned?.type, 'return');
  return withoutPositions(returned.argument);
};

test('parses the hello world example', () => {
  const source = [
    'import IO',
    '',
    'action SayHello():VOID',
    '    body',
    '        IO::stdout.write("Hello World!")',
    '',
    'trigger SayHello on Start',
  ].join('\n');

  assert.deepEqual(withoutPositions(parse(source)), {
    type: 'program',
    children: [
      { type: 'import', module: moduleName('IO') },
      {
        type: 'action',
        name: identifier('SayHello'),
        parameters: [],
        returnType: { type: 'voidType' },
        optional: false,
        raises: [],
        passes: [],
        children: [
          statement(
            call(member(qualified('IO', 'stdout'), 'write'), argument(string('Hello World!'))),
          ),
        ],
      },
      {
        type: 'trigger',
        action: identifier('SayHello'),
        source: identifier('Start'),
      },
    ],
  });
});

test('parses an empty program', () => {
  assert.deepEqual(withoutPositions(parse('  \n ')), {
    type: 'program',
    children: [],
  });
});

test('allows blank lines and trailing whitespace anywhere', () => {
  const program = parse('\n\nimport IO  \n\n  \naction A():VOID\n\n  body  \n\n    f()\n\n');
  assert.deepEqual(
    program.children.map((declaration) => declaration.type),
    ['import', 'action'],
  );
});

test('requires top-level declarations to start in the first column', () => {
  assert.throws(() => parse('  import IO'), ParseError);
  assert.throws(() => parse('import IO\n  import Other'), ParseError);
});

// ----- Comments: docs/adr/0007-actions.md -----

test('skips comments on their own lines and at the ends of lines', () => {
  const source = [
    '// A program',
    'import IO // the IO module',
    '',
    'action A(): VOID // an action',
    '    // before the body',
    '    body',
    '        // a comment',
    '        f() // a call',
    '            // deeper',
    '// at the end',
  ].join('\n');

  assert.deepEqual(parseProgram(source), [
    { type: 'import', module: moduleName('IO') },
    {
      type: 'action',
      name: identifier('A'),
      parameters: [],
      returnType: { type: 'voidType' },
      optional: false,
      raises: [],
      passes: [],
      children: [statement(call(identifier('f')))],
    },
  ]);
});

test('allows a block that holds only comments', () => {
  assert.deepEqual(
    parseProgram('action A(): VOID', '    body', '        // ...', '', 'trigger A on Start'),
    [
      {
        type: 'action',
        name: identifier('A'),
        parameters: [],
        returnType: { type: 'voidType' },
        optional: false,
        raises: [],
        passes: [],
        children: [],
      },
      { type: 'trigger', action: identifier('A'), source: identifier('Start') },
    ],
  );
  assert.deepEqual(parseBody('if a', '  // nothing yet'), [
    { type: 'if', test: identifier('a'), children: [{ type: 'block', children: [] }] },
  ]);
});

test('does not treat // in a string as a comment', () => {
  assert.deepEqual(parseBody('f("a // b")'), [statement(call(identifier('f'), argument(string('a // b'))))]);
});

// ----- Actions: docs/adr/0007-actions.md -----

test('parses action signatures', () => {
  const action = parseAction(
    [
      'action Greet(name: TEXT, greeting?: TEXT := "Hello, ", tone: enum("warm", "dry")): accounts::Greeting?',
      '  body',
      '    return greeting',
    ].join('\n'),
  );

  assert.deepEqual(withoutPositions({ ...action, children: [] }), {
    type: 'action',
    name: identifier('Greet'),
    parameters: [
      {
        type: 'parameter',
        name: identifier('name'),
        optional: false,
        valueType: baseType('TEXT'),
      },
      {
        type: 'parameter',
        name: identifier('greeting'),
        optional: true,
        valueType: baseType('TEXT'),
        defaultValue: string('Hello, '),
      },
      {
        type: 'parameter',
        name: identifier('tone'),
        optional: false,
        valueType: { type: 'enum', values: [string('warm'), string('dry')] },
      },
    ],
    returnType: qualified('accounts', 'Greeting'),
    optional: true,
    raises: [],
    passes: [],
    children: [],
  });
});

test('parses defaults that are any expression', () => {
  const [, end] = parseAction(
    'action Span(start: NUMBER, end?: NUMBER := start + 1): VOID\n  body\n    f()',
  ).parameters;
  assert.deepEqual(withoutPositions(end?.defaultValue), binary('+', identifier('start'), number(1)));
});

test('rejects VOID? as a return type', () => {
  assert.throws(() => parse('action A(): VOID?\n  body\n    f()'), ParseError);
});

test('parses raises and passes clauses, in either order', () => {
  const clauses = (signature: string) => {
    const { raises, passes } = parseAction(`action ${signature}\n  body\n    f()`);
    return withoutPositions({ raises, passes });
  };

  assert.deepEqual(clauses('A(): User raises UserNotFound, billing::Declined'), {
    raises: [identifier('UserNotFound'), qualified('billing', 'Declined')],
    passes: [],
  });
  assert.deepEqual(clauses('A(): User passes @all, Locked raises NotFound'), {
    raises: [identifier('NotFound')],
    passes: [builtIn('all'), identifier('Locked')],
  });
  assert.throws(() => parse('action A(): VOID raises X raises Y\n  body\n    f()'), ParseError);
  assert.throws(() => parse('action A(): VOID raises @all\n  body\n    f()'), ParseError);
});

test('requires an action to have an indented body', () => {
  assert.throws(() => parse('action A():VOID'), ParseError);
  assert.throws(() => parse('action A():VOID\nbody\n  f()'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n  f()'), ParseError);
});

test('rejects statements that are not indented consistently', () => {
  assert.throws(() => parse('action A():VOID\n  body\n    f()\n      g()'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    f()\n   g()'), ParseError);
});

test('rejects blocks delimited by braces', () => {
  assert.throws(() => parse('action A():VOID { f() }'), ParseError);
  assert.throws(() => parse('action A():VOID {\n  f()\n}'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body {\n    f()\n  }'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    if a {\n      f()\n    }'), ParseError);
});

// ----- Types: docs/adr/0012-base-types.md, docs/adr/0021-collections.md -----

test('parses every kind of type', () => {
  const types = (...valueTypes: string[]) =>
    withoutPositions(
      parseAction(
        `action A(${valueTypes.map((valueType, i) => `p${String(i)}: ${valueType}`).join(', ')}): VOID\n  body\n    f()`,
      ).parameters.map((parameter) => parameter.valueType),
    );

  assert.deepEqual(
    types(
      'TEXT',
      'NUMBER',
      'BOOLEAN',
      'DATE_TIME',
      'FILE',
      'UNKNOWN',
      '[TEXT]',
      '{NUMBER}',
      'SET(TEXT)',
      '[{SET(User)}]',
      'enum(1, 2)',
      'enum(true)',
    ),
    [
      baseType('TEXT'),
      baseType('NUMBER'),
      baseType('BOOLEAN'),
      baseType('DATE_TIME'),
      baseType('FILE'),
      { type: 'unknownType' },
      { type: 'arrayType', elementType: baseType('TEXT') },
      { type: 'mapType', valueType: baseType('NUMBER') },
      { type: 'setType', elementType: baseType('TEXT') },
      {
        type: 'arrayType',
        elementType: {
          type: 'mapType',
          valueType: { type: 'setType', elementType: identifier('User') },
        },
      },
      { type: 'enum', values: [number(1), number(2)] },
      { type: 'enum', values: [boolean(true)] },
    ],
  );
});

test('only allows VOID as a return type', () => {
  assert.throws(() => parse('action A(x: VOID): VOID\n  body\n    f()'), ParseError);
  assert.throws(() => parse('action A(): [VOID]\n  body\n    f()'), ParseError);
});

test('rejects interpolation in an inline enum', () => {
  assert.throws(() => parse('action A(x: enum("${a}")): VOID\n  body\n    f()'), ParseError);
});

// ----- Statements: docs/adr/0007-actions.md -----

test('parses calls with named and unnamed arguments, and chained calls', () => {
  assert.deepEqual(parseBody('f("a", name := b)(c)'), [
    statement(
      call(
        call(identifier('f'), argument(string('a')), argument(identifier('b'), 'name')),
        argument(identifier('c')),
      ),
    ),
  ]);
});

test('parses return, with and without a value, break and continue', () => {
  assert.deepEqual(parseBody('return x', 'return', 'return NOTHING', 'break', 'continue'), [
    { type: 'return', argument: identifier('x') },
    { type: 'return' },
    { type: 'return', argument: { type: 'nothing' } },
    { type: 'break' },
    { type: 'continue' },
  ]);
});

test('only allows NOTHING in a return', () => {
  assert.throws(() => parseBody('x := NOTHING'), ParseError);
  assert.throws(() => parseBody('f(NOTHING)'), ParseError);
  assert.throws(() => parseBody('if x == NOTHING', '  f()'), ParseError);
});

test('parses assignments to identifiers, members and indexes', () => {
  assert.deepEqual(parseBody('x := 1', 'user.name := "Ada"', 'scores[0] := 10'), [
    { type: 'assignment', target: identifier('x'), value: number(1) },
    { type: 'assignment', target: member(identifier('user'), 'name'), value: string('Ada') },
    { type: 'assignment', target: index(identifier('scores'), number(0)), value: number(10) },
  ]);
  assert.throws(() => parseBody('f() := 1'), ParseError);
});

test('parses delete, and ignore before an assignment or delete', () => {
  assert.deepEqual(parseBody('delete a[1]', 'ignore delete user.nickname', 'ignore c[k] := v'), [
    { type: 'delete', target: index(identifier('a'), number(1)) },
    {
      type: 'ignoredStatement',
      statement: { type: 'delete', target: member(identifier('user'), 'nickname') },
    },
    {
      type: 'ignoredStatement',
      statement: {
        type: 'assignment',
        target: index(identifier('c'), identifier('k')),
        value: identifier('v'),
      },
    },
  ]);
  assert.throws(() => parseBody('delete user'), ParseError);
});

test('parses raise, pass and assert', () => {
  assert.deepEqual(
    parseBody(
      'raise UserNotFound',
      'raise billing::Declined(reason := "Expired", retryable)',
      'raise AccountLocked with lookup',
      'pass result',
      'assert count > 0',
      'assert ok, "not ok"',
    ),
    [
      { type: 'raise', error: identifier('UserNotFound') },
      {
        type: 'raise',
        error: qualified('billing', 'Declined'),
        arguments: [
          argument(string('Expired'), 'reason'),
          argument(identifier('retryable')),
        ],
      },
      { type: 'raise', error: identifier('AccountLocked'), data: identifier('lookup') },
      { type: 'pass', argument: identifier('result') },
      { type: 'assert', test: binary('>', identifier('count'), number(0)) },
      { type: 'assert', test: identifier('ok'), message: string('not ok') },
    ],
  );
});

test('parses ignore as a prefix operator in an expression', () => {
  assert.deepEqual(parseBody('ignore SendReceipt(invoice)', 'owner := ignore Find(email)'), [
    statement(unary('ignore', call(identifier('SendReceipt'), argument(identifier('invoice'))))),
    {
      type: 'assignment',
      target: identifier('owner'),
      value: unary('ignore', call(identifier('Find'), argument(identifier('email')))),
    },
  ]);
});

test('parses for and while loops with nested blocks', () => {
  assert.deepEqual(parseBody('for item in items', '  while ready', '    f(item)', '  g()', 'h()'), [
    {
      type: 'for',
      variable: identifier('item'),
      iterable: identifier('items'),
      children: [
        {
          type: 'while',
          test: identifier('ready'),
          children: [statement(call(identifier('f'), argument(identifier('item'))))],
        },
        statement(call(identifier('g'))),
      ],
    },
    statement(call(identifier('h'))),
  ]);
});

test('parses if, else if and else', () => {
  const callStatement = (name: string) => statement(call(identifier(name)));
  const block = (...children: unknown[]) => ({ type: 'block', children });

  assert.deepEqual(parseBody('if a', '  f()', 'else if b', '  g()', 'else', '  h()'), [
    {
      type: 'if',
      test: identifier('a'),
      children: [
        block(callStatement('f')),
        {
          type: 'if',
          test: identifier('b'),
          children: [block(callStatement('g')), block(callStatement('h'))],
        },
      ],
    },
  ]);
  assert.deepEqual(parseBody('if a', '  f()', 'g()'), [
    { type: 'if', test: identifier('a'), children: [block(callStatement('f'))] },
    callStatement('g'),
  ]);
});

test('spans a block from its first statement to its last', () => {
  const [ifStatement] = parseAction(
    'action A():VOID\n  body\n    if a\n      f()\n      g()',
  ).children;
  assert.equal(ifStatement?.type, 'if');
  assert.deepEqual(ifStatement.children[0].position, {
    start: { line: 4, column: 7, offset: 38 },
    end: { line: 5, column: 10, offset: 51 },
  });
});

test('gives every node a unist position', () => {
  const program = parse('import IO\ntrigger Go on Start');
  const [, trigger] = program.children;

  assert.deepEqual(program.position, {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 2, column: 20, offset: 29 },
  });
  assert.equal(trigger?.type, 'trigger');
  assert.deepEqual(trigger.position, {
    start: { line: 2, column: 1, offset: 10 },
    end: { line: 2, column: 20, offset: 29 },
  });
  assert.deepEqual(trigger.source.position, {
    start: { line: 2, column: 15, offset: 24 },
    end: { line: 2, column: 20, offset: 29 },
  });
});

test('spans a member expression from its object to its property', () => {
  const [statement] = parseAction('action A():VOID\n  body\n    user.email').children;
  assert.equal(statement?.type, 'expressionStatement');
  assert.deepEqual(statement.expression.position, {
    start: { line: 3, column: 5, offset: 27 },
    end: { line: 3, column: 15, offset: 37 },
  });
});

// ----- Expressions: docs/adr/0019-operators.md -----

test('parses number and boolean literals as in JavaScript', () => {
  assert.deepEqual(
    ['42', '3.14', '.5', '5.', '1e3', '2.5E-4', '1_000_000', '0xFF', '0o17', '0b1010', 'true', 'false'].map(
      parseExpression,
    ),
    [
      number(42),
      number(3.14),
      number(0.5),
      number(5),
      number(1000),
      number(0.00025),
      number(1_000_000),
      number(255),
      number(15),
      number(10),
      boolean(true),
      boolean(false),
    ],
  );
  assert.deepEqual(parseExpression('-1'), unary('-', number(1)));
  for (const invalid of ['017', '1__0', '1_', '0x', '1e']) {
    assert.throws(() => parseExpression(invalid), ParseError, invalid);
  }
});

test('applies the order of precedence', () => {
  const a = identifier('a');
  const b = identifier('b');
  const c = identifier('c');

  assert.deepEqual(parseExpression('a + b * c'), binary('+', a, binary('*', b, c)));
  assert.deepEqual(parseExpression('a - b - c'), binary('-', binary('-', a, b), c));
  assert.deepEqual(parseExpression('a ** b ** c'), binary('**', a, binary('**', b, c)));
  assert.deepEqual(parseExpression('-a ** b'), binary('**', unary('-', a), b));
  assert.deepEqual(parseExpression('a or b and c'), binary('or', a, binary('and', b, c)));
  assert.deepEqual(parseExpression('!a == b'), binary('==', unary('!', a), b));
  assert.deepEqual(parseExpression('a orElse 0 + 1'), binary('+', binary('orElse', a, number(0)), number(1)));
  assert.deepEqual(parseExpression('isEmpty a orElse b'), unary('isEmpty', binary('orElse', a, b)));
  assert.deepEqual(parseExpression('a orElse -b'), binary('orElse', a, unary('-', b)));
  assert.deepEqual(parseExpression('(a + b) * c'), binary('*', binary('+', a, b), c));
  assert.deepEqual(
    parseExpression('a % b / c <= a'),
    binary('<=', binary('/', binary('%', a, b), c), a),
  );
  assert.deepEqual(parseExpression('a in b and c != a'), binary('and', binary('in', a, b), binary('!=', c, a)));
});

test('makes comparisons non-associative', () => {
  assert.throws(() => parseExpression('a == b == c'), ParseError);
  assert.throws(() => parseExpression('a < b < c'), ParseError);
});

test('parses instanceOf with a type, an optional type, or ERROR', () => {
  assert.deepEqual(parseExpression('value instanceOf TEXT'), {
    type: 'instanceOf',
    value: identifier('value'),
    target: baseType('TEXT'),
    optional: false,
  });
  assert.deepEqual(parseExpression('value instanceOf [User]?'), {
    type: 'instanceOf',
    value: identifier('value'),
    target: { type: 'arrayType', elementType: identifier('User') },
    optional: true,
  });
  assert.deepEqual(parseExpression('!(result instanceOf ERROR)'), unary('!', {
    type: 'instanceOf',
    value: identifier('result'),
    target: { type: 'errorType' },
    optional: false,
  }));
});

test('parses members, indexes and calls on any value', () => {
  assert.deepEqual(
    parseExpression('grid[1][2].body'),
    member(index(index(identifier('grid'), number(1)), number(2)), 'body'),
  );
  assert.deepEqual(
    parseExpression('billing::InvoiceStatus.paid'),
    member(qualified('billing', 'InvoiceStatus'), 'paid'),
  );
});

test('parses built-in values', () => {
  assert.deepEqual(parseExpression('@message.user'), member(builtIn('message'), 'user'));
});

test('parses security predicates', () => {
  const subject = builtIn('subject');
  assert.deepEqual(parseExpression('@subject can "invoices:read"'), {
    type: 'canPredicate',
    subject,
    permission: string('invoices:read'),
  });
  assert.deepEqual(parseExpression('@subject can "invoices:read" within org'), {
    type: 'canPredicate',
    subject,
    permission: string('invoices:read'),
    group: identifier('org'),
  });
  assert.deepEqual(parseExpression('@subject is @defined and @subject is User'), binary(
    'and',
    { type: 'isPredicate', subject, subjectType: builtIn('defined') },
    { type: 'isPredicate', subject, subjectType: identifier('User') },
  ));
  assert.deepEqual(parseExpression('@subject is admin within billing'), {
    type: 'rolePredicate',
    subject,
    role: identifier('admin'),
    group: identifier('billing'),
  });
  assert.throws(() => parseExpression('@subject can permission'), ParseError);
});

// ----- Collections: docs/adr/0021-collections.md -----

test('parses array, object and set values', () => {
  assert.deepEqual(parseExpression('[1, 2, 3,]'), {
    type: 'array',
    elements: [number(1), number(2), number(3)],
  });
  assert.deepEqual(parseExpression('[]'), { type: 'array', elements: [] });
  assert.deepEqual(parseExpression('{ name := "Ada", body := b, "Content-Type" := t }'), {
    type: 'object',
    items: [
      { type: 'objectItem', name: identifier('name'), value: string('Ada') },
      { type: 'objectItem', name: identifier('body'), value: identifier('b') },
      { type: 'objectItem', name: string('Content-Type'), value: identifier('t') },
    ],
  });
  assert.deepEqual(parseExpression('{}'), { type: 'object', items: [] });
  assert.deepEqual(parseExpression('SET("a", "b")'), {
    type: 'set',
    elements: [string('a'), string('b')],
  });
  assert.deepEqual(parseExpression('SET()'), { type: 'set', elements: [] });
});

test('lets collection values span lines, with comments', () => {
  assert.deepEqual(
    parseBody(
      'headers := {',
      '        "Content-Type" := "text/plain", // the type',
      '  "Cache-Control" := "no-store",',
      '}',
      'f()',
    ),
    [
      {
        type: 'assignment',
        target: identifier('headers'),
        value: {
          type: 'object',
          items: [
            { type: 'objectItem', name: string('Content-Type'), value: string('text/plain') },
            { type: 'objectItem', name: string('Cache-Control'), value: string('no-store') },
          ],
        },
      },
      statement(call(identifier('f'))),
    ],
  );
});

// ----- Triggers: docs/adr/0009-triggers.md, docs/adr/0025-trigger-sources.md -----

test('parses triggers with auth, arguments and parameters blocks', () => {
  assert.deepEqual(
    parseProgram(
      'trigger billing::GetInvoice on HttpRequest',
      '    parameters',
      '        method := "GET"',
      '        path := "${apiBase}/invoices/{id}"',
      '    // who can do this',
      '    auth',
      '        @subject is @defined and @subject can "invoices:read"',
      '    arguments',
      '        invoiceId := @request.path.id',
    ),
    [
      {
        type: 'trigger',
        action: qualified('billing', 'GetInvoice'),
        source: identifier('HttpRequest'),
        parameters: [
          { type: 'namedValue', name: identifier('method'), value: string('GET') },
          {
            type: 'namedValue',
            name: identifier('path'),
            value: {
              type: 'string',
              parts: [
                { type: 'interpolation', expression: identifier('apiBase') },
                { type: 'text', value: '/invoices/{id}' },
              ],
            },
          },
        ],
        auth: binary(
          'and',
          { type: 'isPredicate', subject: builtIn('subject'), subjectType: builtIn('defined') },
          {
            type: 'canPredicate',
            subject: builtIn('subject'),
            permission: string('invoices:read'),
          },
        ),
        arguments: [
          {
            type: 'namedValue',
            name: identifier('invoiceId'),
            value: member(member(builtIn('request'), 'path'), 'id'),
          },
        ],
      },
    ],
  );
});

test('rejects a trigger with two blocks of the same kind', () => {
  assert.throws(
    () => parse('trigger A on B\n  arguments\n    a := 1\n  arguments\n    b := 2'),
    ParseError,
  );
});

// ----- Declarations -----

test('parses permissions declarations', () => {
  assert.deepEqual(
    parseProgram('permissions organization', '    "invoices:read"', 'permissions organization has admin', '    "a"', '    "b"'),
    [
      {
        type: 'permissions',
        group: identifier('organization'),
        permissions: [string('invoices:read')],
      },
      {
        type: 'permissions',
        group: identifier('organization'),
        role: identifier('admin'),
        permissions: [string('a'), string('b')],
      },
    ],
  );
});

test('parses enum declarations', () => {
  assert.deepEqual(
    parseProgram('enum Status', '    Idle', '    InProgress := "In Progress"', '    Done := 3'),
    [
      {
        type: 'enumDeclaration',
        name: identifier('Status'),
        members: [
          { type: 'enumMember', name: identifier('Idle') },
          { type: 'enumMember', name: identifier('InProgress'), value: string('In Progress') },
          { type: 'enumMember', name: identifier('Done'), value: number(3) },
        ],
      },
    ],
  );
  assert.throws(() => parse('enum Empty'), ParseError);
});

test('parses model declarations', () => {
  assert.deepEqual(
    parseProgram('model Customer', '    name: TEXT', '    country?: TEXT := "GB"'),
    [
      {
        type: 'model',
        name: identifier('Customer'),
        fields: [
          { type: 'field', name: identifier('name'), optional: false, valueType: baseType('TEXT') },
          {
            type: 'field',
            name: identifier('country'),
            optional: true,
            valueType: baseType('TEXT'),
            defaultValue: string('GB'),
          },
        ],
      },
    ],
  );
});

test('parses entity declarations', () => {
  assert.deepEqual(
    parseProgram(
      'entity Customer',
      '    subject',
      '    identity email, name',
      '    group organization',
      '    role admin',
      '    models',
      '        crm::CustomerRecord',
      '    expose',
      '        @all',
      '        email as contactEmail',
      '    hide',
      '        passwordHash',
    ),
    [
      {
        type: 'entity',
        name: identifier('Customer'),
        lines: [
          { type: 'subjectLine' },
          { type: 'identityLine', fields: [identifier('email'), identifier('name')] },
          { type: 'groupLine', name: identifier('organization') },
          { type: 'roleLine', name: identifier('admin') },
          { type: 'modelsBlock', models: [qualified('crm', 'CustomerRecord')] },
          {
            type: 'exposeBlock',
            items: [
              builtIn('all'),
              { type: 'exposedField', field: identifier('email'), as: identifier('contactEmail') },
            ],
          },
          { type: 'hideBlock', items: [identifier('passwordHash')] },
        ],
      },
    ],
  );
});

test('parses error declarations, with named and anonymous data', () => {
  assert.deepEqual(
    parseProgram(
      'error UserNotFound',
      'error AccountLocked',
      '    data AccountLookup',
      'error PaymentDeclined',
      '    data',
      '        reason: TEXT',
    ),
    [
      { type: 'errorDeclaration', name: identifier('UserNotFound') },
      { type: 'errorDeclaration', name: identifier('AccountLocked'), data: identifier('AccountLookup') },
      {
        type: 'errorDeclaration',
        name: identifier('PaymentDeclined'),
        data: [{ type: 'field', name: identifier('reason'), optional: false, valueType: baseType('TEXT') }],
      },
    ],
  );
});

test('parses constant declarations', () => {
  assert.deepEqual(
    parseProgram('const apiBase := "/api/v1"', 'const retries: NUMBER := 3'),
    [
      { type: 'const', name: identifier('apiBase'), value: string('/api/v1') },
      { type: 'const', name: identifier('retries'), valueType: baseType('NUMBER'), value: number(3) },
    ],
  );
});

test('marks exported declarations', () => {
  const declarations = parse(
    [
      'export const a := 1',
      'export error E',
      'export enum S',
      '    A',
      'export model M',
      '    x: TEXT',
      'export entity N',
      '    models',
      '        M',
      'export action F(): VOID',
      '    body',
      '        f()',
      'const b := 2',
    ].join('\n'),
  ).children;

  assert.deepEqual(
    declarations.map((declaration) => [declaration.type, 'exported' in declaration]),
    [
      ['const', true],
      ['errorDeclaration', true],
      ['enumDeclaration', true],
      ['model', true],
      ['entity', true],
      ['action', true],
      ['const', false],
    ],
  );
  assert.deepEqual(declarations[0]?.position.start, { line: 1, column: 1, offset: 0 });
});

test('does not let triggers, permissions or imports be exported', () => {
  assert.throws(() => parse('export trigger A on Start'), ParseError);
  assert.throws(() => parse('export permissions org\n  "a"'), ParseError);
  assert.throws(() => parse('export import IO'), ParseError);
});

// ----- Keywords -----

test('accepts identifiers that start with a keyword', () => {
  assert.deepEqual(withoutPositions(parse('import onStart').children), [
    { type: 'import', module: moduleName('onStart') },
  ]);
});

test('rejects a keyword used as an identifier, reporting where', () => {
  assert.throws(
    () => parse('import IO\ntrigger on on Start'),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.deepEqual(error.location.start, {
        line: 2,
        column: 9,
        offset: 18,
      });
      return true;
    },
  );
});

test('reserves keywords from every ADR', () => {
  for (const keyword of ['TEXT', 'SET', 'ERROR', 'error', 'raise', 'pass', 'model', 'const', 'export', 'delete', 'true', 'orElse', 'isEmpty']) {
    assert.throws(() => parseBody(`${keyword} := 1`), ParseError, keyword);
  }
});

test('lets contextual keywords be identifiers elsewhere', () => {
  const names = ['into', 'as', 'raises', 'passes', 'with', 'data', 'auth', 'arguments', 'parameters', 'has', 'can', 'is', 'within', 'subject', 'identity', 'group', 'role', 'models', 'expose', 'hide'];
  assert.deepEqual(
    parseBody(...names.map((name) => `${name} := 1`)),
    names.map((name) => ({ type: 'assignment', target: identifier(name), value: number(1) })),
  );
});

// ----- Imports and namespaces -----

test('parses symbolic imports with and without a scope', () => {
  assert.deepEqual(withoutPositions(parse('import IO\nimport acme::Http').children), [
    { type: 'import', module: moduleName('IO') },
    {
      type: 'import',
      module: {
        type: 'moduleName',
        scope: identifier('acme'),
        name: identifier('Http'),
      },
    },
  ]);
});

test('parses URL imports with into and as', () => {
  assert.deepEqual(
    withoutPositions(parse('import "./config.json" into config as "json"').children),
    [
      {
        type: 'import',
        module: string('./config.json'),
        namespace: identifier('config'),
        moduleType: string('json'),
      },
    ],
  );
  assert.deepEqual(withoutPositions(parse('import IO as "cant"').children), [
    { type: 'import', module: moduleName('IO'), moduleType: string('cant') },
  ]);
});

test('rejects interpolation in strings that must be constant', () => {
  assert.throws(() => parse('import "./${name}.cant"'), ParseError);
  assert.throws(() => parse('import IO as "${kind}"'), ParseError);
});

test('lets into and as be identifiers outside imports', () => {
  assert.deepEqual(withoutPositions(parse('import into into as').children), [
    { type: 'import', module: moduleName('into'), namespace: identifier('as') },
  ]);
});

test('parses namespace declarations', () => {
  assert.deepEqual(withoutPositions(parse('namespace Greetings\nnamespace __main__').children), [
    { type: 'namespace', name: identifier('Greetings') },
    { type: 'namespace', name: identifier('__main__') },
  ]);
  assert.throws(() => parse('namespace namespace'), ParseError);
});

test('parses namespace-qualified references in expressions', () => {
  assert.deepEqual(parseBody('io::write("hi")'), [
    statement(call(qualified('io', 'write'), argument(string('hi')))),
  ]);
});

// ----- Strings -----

/** Parse a string literal as the argument of a call, and return it without positions. */
const parseString = (literal: string): unknown => {
  const [statement] = parseAction(`action A():VOID\n  body\n    f(${literal})`).children;
  assert.equal(statement?.type, 'expressionStatement');
  assert.equal(statement.expression.type, 'call');
  return withoutPositions(statement.expression.arguments[0]?.value);
};

test('parses an empty string', () => {
  assert.deepEqual(parseString('""'), string(''));
});

test('decodes escape sequences', () => {
  assert.deepEqual(
    parseString(String.raw`"a\"b\\c\$d\ne\tf\u{1F600}"`),
    string('a"b\\c$d\ne\tf\u{1F600}'),
  );
  assert.deepEqual(parseString(String.raw`"\${not interpolated}"`), string('${not interpolated}'));
});

test('treats a $ that does not start an interpolation as text', () => {
  assert.deepEqual(parseString('"costs $5 or $"'), string('costs $5 or $'));
});

test('rejects unknown escapes and out-of-range code points', () => {
  assert.throws(() => parseString(String.raw`"\q"`), ParseError);
  assert.throws(() => parseString(String.raw`"\u{110000}"`), ParseError);
});

test('parses interpolations, including strings and objects inside them', () => {
  assert.deepEqual(parseString('"Hello, ${name}! ${greet("you")} ${{ a := 1 }}"'), {
    type: 'string',
    parts: [
      { type: 'text', value: 'Hello, ' },
      { type: 'interpolation', expression: identifier('name') },
      { type: 'text', value: '! ' },
      {
        type: 'interpolation',
        expression: call(identifier('greet'), argument(string('you'))),
      },
      { type: 'text', value: ' ' },
      {
        type: 'interpolation',
        expression: {
          type: 'object',
          items: [{ type: 'objectItem', name: identifier('a'), value: number(1) }],
        },
      },
    ],
  });
});

test('rejects unterminated strings and interpolations', () => {
  assert.throws(() => parseString('"oops'), ParseError);
  assert.throws(() => parseString('"a ${b"'), ParseError);
  assert.throws(() => parse('action A():VOID\n  body\n    f("one\ntwo")'), ParseError);
});
