import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompiledProgram, CompiledStatement, SourceMap } from '@dancrumb/cant-shared';
import { compile } from './compile.ts';
import type { Host } from './host.ts';

/** A host whose files live in memory, each given as its lines. */
const memory = (files: Record<string, string[]>): Host => ({
  readFile: (path) => files[path]?.join('\n'),
});

/** Compile `/app/main.cant` and the other files given, and fail if the program has problems. */
const compiled = (files: Record<string, string[]>): { program: CompiledProgram; sourceMap: SourceMap } => {
  const result = compile('/app/main.cant', memory(files));
  if ('diagnostics' in result) assert.fail(result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('\n'));
  return result;
};

/** A compiled action's body, without positions, so it can be compared as a whole. */
const body = (program: CompiledProgram, action: string): unknown => {
  const implementation = program.actions[action]?.implementation;
  assert.equal(implementation?.kind, 'body');
  return withoutPositions((implementation as { body: CompiledStatement[] }).body);
};

const withoutPositions = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, member: unknown) => (key === 'position' ? undefined : member))) as unknown;

test('gives the diagnostics, not a compiled program, when a program has problems', () => {
  const result = compile('/app/main.cant', memory({ '/app/main.cant': ['action A(): NUMBER', '    body', '        return "one"'] }));
  assert.ok('diagnostics' in result);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ['type-mismatch'],
  );
});

test('names modules from the root, keeps only the entry module\'s triggers, and resolves native modules', () => {
  const { program, sourceMap } = compiled({
    '/app/cant.json': ['{}'],
    '/app/main.cant': ['import "./lib/greet.cant"', 'import IO', 'trigger Greet on Start', '    arguments', '        name := "Ada"'],
    '/app/lib/greet.cant': [
      'export action Greet(name: TEXT): VOID',
      '    native "./native/greet.js"',
      'action Unused(): VOID',
      '    body',
      '        IO::write("x")',
      'import IO',
      'trigger Unused on Start',
    ],
  });
  assert.equal(program.format, 1);
  assert.equal(program.entry, 'main.cant');
  assert.deepEqual(program.actions['lib/greet.cant#Greet']?.implementation, { kind: 'native', module: 'lib/native/greet.js' });
  assert.deepEqual(program.actions['cant::IO#write']?.implementation, { kind: 'standard' });
  assert.deepEqual(program.types['cant::Errors#DivisionByZero'], { kind: 'error' });
  assert.deepEqual(
    program.triggers.map(({ action, source, arguments: args }) => ({ action, source, arguments: withoutPositions(args) })),
    [{ action: 'lib/greet.cant#Greet', source: 'Start', arguments: { name: { type: 'value', value: { kind: 'text', value: 'Ada' } } } }],
  );
  // The standard library's own source is included, for positions inside it (docs/adr/0042-io.md).
  assert.deepEqual(Object.keys(sourceMap.sources).sort(), ['cant::IO', 'lib/greet.cant', 'main.cant']);
  assert.equal(sourceMap.build, program.build);
  assert.match(program.build, /^[0-9a-f]{16}$/);
});

test('gives the same build to the same program, and a different one to a changed program', () => {
  const build = (text: string): string => compiled({ '/app/main.cant': ['action A(): TEXT', '    body', `        return "${text}"`] }).program.build;
  assert.equal(build('one'), build('one'));
  assert.notEqual(build('one'), build('two'));
});

test('resolves locals to slots, and matches arguments to parameters in order', () => {
  const { program } = compiled({
    '/app/main.cant': [
      'action Greet(name: TEXT, greeting?: TEXT := "Hello", times?: NUMBER): TEXT',
      '    native "./greet.js"',
      'action A(who: TEXT): TEXT',
      '    body',
      '        message := Greet(times := 2, name := who)',
      '        for n in [1, 2]',
      '            other := "${message} ${n}"',
      '        return message',
    ],
  });
  assert.deepEqual(body(program, 'main.cant#A'), [
    {
      type: 'let',
      slot: 1,
      value: {
        type: 'call',
        action: 'main.cant#Greet',
        arguments: [{ type: 'local', slot: 0 }, { type: 'omitted' }, { type: 'value', value: { kind: 'number', value: 2 } }],
      },
    },
    {
      type: 'for',
      slot: 2,
      iterable: {
        type: 'array',
        element: { kind: 'base', name: 'NUMBER' },
        elements: [
          { type: 'value', value: { kind: 'number', value: 1 } },
          { type: 'value', value: { kind: 'number', value: 2 } },
        ],
      },
      body: [{ type: 'let', slot: 3, value: { type: 'template', parts: [{ type: 'local', slot: 1 }, ' ', { type: 'local', slot: 2 }] } }],
    },
    { type: 'return', value: { type: 'local', slot: 1 } },
  ]);
  assert.equal(program.actions['main.cant#A']?.implementation.kind === 'body' && program.actions['main.cant#A'].implementation.locals, 4);
});

test('makes what types decide explicit: objects of models, enum values and unwrapped results', () => {
  const { program } = compiled({
    '/app/main.cant': [
      'enum Status',
      '    open',
      '    closed',
      'model Customer',
      '    name: TEXT',
      '    country?: TEXT := "GB"',
      'error NotFound',
      'action Find(name: TEXT): Customer raises NotFound',
      '    native "./find.js"',
      'action Save(customer: Customer, status: Status, tags: {TEXT}, scores: [NUMBER]): VOID',
      '    native "./save.js"',
      'action A(code: TEXT): VOID raises Errors::InvalidEnumValue',
      '    body',
      '        Save(customer := { name := "Ada" }, status := "open", tags := { a := "x" }, scores := [])',
      '        Save(customer := Find("Ada"), status := code, tags := { a := "x" }, scores := [])',
      'import cant::Errors into Errors',
    ],
  });
  const [first, second] = body(program, 'main.cant#A') as { expression: { arguments: unknown[] } }[];
  assert.deepEqual(first?.expression.arguments, [
    {
      type: 'construct',
      model: 'main.cant#Customer',
      value: { type: 'object', members: [['name', { type: 'value', value: { kind: 'text', value: 'Ada' } }]] },
    },
    { type: 'value', value: { kind: 'enum', enum: 'main.cant#Status', value: { kind: 'text', value: 'open' } } },
    { type: 'map', value: { kind: 'base', name: 'TEXT' }, members: [['a', { type: 'value', value: { kind: 'text', value: 'x' } }]] },
    { type: 'array', element: { kind: 'base', name: 'NUMBER' }, elements: [] },
  ]);
  assert.deepEqual(second?.expression.arguments.slice(0, 2), [
    { type: 'unwrap', value: { type: 'call', action: 'main.cant#Find', arguments: [{ type: 'value', value: { kind: 'text', value: 'Ada' } }] } },
    { type: 'toEnum', enum: { kind: 'named', symbol: 'main.cant#Status' }, value: { type: 'local', slot: 0 } },
  ]);
});

test('compiles statements: raise, pass, if, while, assignment and delete', () => {
  const { program } = compiled({
    '/app/main.cant': [
      'model Customer',
      '    name: TEXT',
      '    nickname?: TEXT',
      'error Missing',
      '    data',
      '        name: TEXT',
      'error Lost',
      'action Find(name: TEXT): Customer raises Lost',
      '    native "./find.js"',
      'action A(customer: Customer, flag: BOOLEAN): Customer raises Missing passes Lost',
      '    body',
      '        if flag',
      '            raise Missing(name := "x")',
      '        else if !flag',
      '            pass Find("y")',
      '        while flag',
      '            break',
      '        customer.name := "Ada"',
      '        delete customer.nickname',
      '        return customer',
    ],
  });
  assert.deepEqual(body(program, 'main.cant#A'), [
    {
      type: 'if',
      test: { type: 'local', slot: 1 },
      then: [{ type: 'raise', error: 'main.cant#Missing', data: { type: 'object', members: [['name', { type: 'value', value: { kind: 'text', value: 'x' } }]] } }],
      else: [
        {
          type: 'if',
          test: { type: 'unary', operator: '!', argument: { type: 'local', slot: 1 } },
          then: [{ type: 'pass', value: { type: 'call', action: 'main.cant#Find', arguments: [{ type: 'value', value: { kind: 'text', value: 'y' } }] } }],
        },
      ],
    },
    { type: 'while', test: { type: 'local', slot: 1 }, body: [{ type: 'break' }] },
    {
      type: 'assign',
      target: { type: 'member', object: { type: 'local', slot: 0 }, name: 'name' },
      value: { type: 'value', value: { kind: 'text', value: 'Ada' } },
      ignored: false,
    },
    { type: 'delete', target: { type: 'member', object: { type: 'local', slot: 0 }, name: 'nickname' }, ignored: false },
    { type: 'return', value: { type: 'local', slot: 0 } },
  ]);
});

test('holds constants as values, as the type they declare, with their defaults', () => {
  const { program } = compiled({
    '/app/main.cant': [
      'enum Status',
      '    open',
      'model Policy',
      '    attempts: NUMBER',
      '    backoff?: NUMBER := attempts * 2',
      'const base := "/api"',
      'const path := "${base}/users"',
      'const status: Status := "open"',
      'const policy: Policy := { attempts := 3 }',
    ],
  });
  assert.deepEqual(program.constants, {
    'main.cant#base': { kind: 'text', value: '/api' },
    'main.cant#path': { kind: 'text', value: '/api/users' },
    'main.cant#status': { kind: 'enum', enum: 'main.cant#Status', value: { kind: 'text', value: 'open' } },
    'main.cant#policy': {
      kind: 'object',
      model: 'main.cant#Policy',
      members: [
        ['attempts', { kind: 'number', value: 3 }],
        ['backoff', { kind: 'number', value: 6 }],
      ],
    },
  });
  assert.deepEqual(withoutPositions(program.types['main.cant#Policy']), {
    kind: 'model',
    fields: [
      { name: 'attempts', type: { kind: 'base', name: 'NUMBER' }, optional: false },
      {
        name: 'backoff',
        type: { kind: 'base', name: 'NUMBER' },
        optional: true,
        default: { type: 'binary', operator: '*', left: { type: 'field', name: 'attempts' }, right: { type: 'value', value: { kind: 'number', value: 2 } } },
      },
    ],
    defaultOrder: [1],
  });
});

test('describes entities: exposed fields, identity, navigation, groups and memberships', () => {
  const { program } = compiled({
    '/app/main.cant': [
      'model UserRecord',
      '    email: TEXT',
      '    passwordHash: TEXT',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      '    expose',
      '        @all',
      '        email as contactEmail',
      '    hide',
      '        passwordHash',
      'model OrgRecord',
      '    slug: TEXT',
      'entity Organization',
      '    group organization',
      '    role admin',
      '    identity slug',
      '    models',
      '        OrgRecord',
      'enum Role',
      '    admin',
      'model MembershipRecord',
      '    roles: SET(Role)',
      'entity Membership',
      '    membership user in organization with roles',
      '    identity organization, user',
      '    models',
      '        MembershipRecord',
      'relation User[memberships] 1 --- 0..* Membership[user]',
      'relation Organization[memberships] 1 --- 0..* Membership[organization]',
      'permissions organization has admin',
      '    "manage"',
    ],
  });
  assert.deepEqual(program.types['main.cant#User'], {
    kind: 'entity',
    model: 'main.cant#UserRecord',
    exposed: { contactEmail: 'email' },
    identity: [{ field: 'email' }],
    navigation: { memberships: { entity: 'main.cant#Membership', cardinality: '0..*', inverse: 'user', relation: 0 } },
    subject: true,
  });
  assert.deepEqual(program.types['main.cant#Organization'], {
    kind: 'entity',
    model: 'main.cant#OrgRecord',
    exposed: {},
    identity: [{ field: 'slug' }],
    navigation: { memberships: { entity: 'main.cant#Membership', cardinality: '0..*', inverse: 'organization', relation: 1 } },
    subject: false,
    group: { kind: 'organization', roles: ['admin'] },
  });
  assert.deepEqual(program.types['main.cant#Membership'], {
    kind: 'entity',
    model: 'main.cant#MembershipRecord',
    exposed: {},
    identity: [{ navigation: 'organization' }, { navigation: 'user' }],
    navigation: {
      user: { entity: 'main.cant#User', cardinality: '1', inverse: 'memberships', relation: 0 },
      organization: { entity: 'main.cant#Organization', cardinality: '1', inverse: 'memberships', relation: 1 },
    },
    subject: false,
    membership: { member: 'user', group: 'organization', roles: 'roles' },
  });
  assert.deepEqual(program.relations[0], {
    left: { entity: 'main.cant#User', field: 'memberships', cardinality: '1' },
    right: { entity: 'main.cant#Membership', field: 'user', cardinality: '0..*' },
  });
  assert.deepEqual(program.permissions, [{ group: 'organization', role: 'admin', permissions: ['manage'] }]);
});

test("compiles a test case: its parameters, subject, arguments and assertions", () => {
  const { program } = compiled({
    '/app/main.cant': [
      'model UserRecord',
      '    email: TEXT',
      '    name?: TEXT := "friend"',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      'action Greet(name: TEXT): TEXT',
      '    native "./greet.js"',
      'trigger Greet on TestCase',
      '    parameters',
      '        name := "greets Ada"',
      '        subject := { @entity := User, email := "ada@example.com" }',
      '    arguments',
      '        name := "Ada"',
      '    assertions',
      '        @result == "Hello, Ada", "says hello: ${@result}"',
    ],
  });
  const [trigger] = program.triggers;
  assert.deepEqual(trigger?.parameters, { name: { kind: 'text', value: 'greets Ada' } });
  assert.deepEqual(trigger.subject, {
    entity: 'main.cant#User',
    fields: {
      kind: 'object',
      model: 'main.cant#UserRecord',
      members: [
        ['email', { kind: 'text', value: 'ada@example.com' }],
        ['name', { kind: 'text', value: 'friend' }],
      ],
    },
  });
  assert.deepEqual(withoutPositions(trigger.assertions), [
    {
      test: {
        type: 'binary',
        operator: '==',
        left: { type: 'builtIn', name: 'result' },
        right: { type: 'value', value: { kind: 'text', value: 'Hello, Ada' } },
      },
      message: { type: 'template', parts: ['says hello: ', { type: 'builtIn', name: 'result' }] },
    },
  ]);
  assert.deepEqual(trigger.position, { module: 'main.cant', start: { line: 11, column: 1 }, end: trigger.position.end });
});

test("records cant::Errors' built-in errors, from its source, whether or not the program imports it", () => {
  const builtIns = (program: CompiledProgram): [string, unknown][] =>
    Object.entries(program.types).filter(([id]) => id.startsWith('cant::Errors#'));
  const plain = compiled({ '/app/main.cant': ['action A(): VOID', '    body', '        return'] }).program;
  const imports = compiled({
    '/app/main.cant': ['import cant::Errors into Errors', 'action A(): VOID raises Errors::DivisionByZero', '    body', '        return'],
  }).program;
  assert.equal(builtIns(plain).length, 8);
  assert.ok(builtIns(plain).every(([, type]) => JSON.stringify(type) === JSON.stringify({ kind: 'error' })));
  assert.deepEqual(builtIns(imports), builtIns(plain));
});
