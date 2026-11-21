import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';

/** Check `/app/main.cant`, given as its lines, and list its problems as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  checkProgram('/app/main.cant', { readFile: (path) => (path === '/app/main.cant' ? lines.join('\n') : undefined) }).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

/** A small valid security model: users, organizations and memberships. */
const SECURITY = [
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
  '    hide',
  '        passwordHash',
  'model OrganizationRecord',
  '    slug: TEXT',
  'entity Organization',
  '    group organization',
  '    role admin',
  '    identity slug',
  '    models',
  '        OrganizationRecord',
  'enum OrganizationRole',
  '    admin',
  'model MembershipRecord',
  '    roles: SET(OrganizationRole)',
  'entity Membership',
  '    membership user in organization with roles',
  '    identity user, organization',
  '    models',
  '        MembershipRecord',
  'relation Organization[memberships] 1 --- 0..* Membership[organization]',
  'relation User[memberships] 1 --- 0..* Membership[user]',
  'permissions organization has admin',
  '    "invoices:write"',
];

test('accepts a valid security model', () => {
  assert.deepEqual(
    problems(
      ...SECURITY,
      'action Approve(org: Organization): VOID',
      '    body',
      '        if @subject can "invoices:write" within org or @subject is admin within org',
      '            return',
    ),
    [],
  );
});

test('reports fields an entity names that its model does not have', () => {
  assert.deepEqual(
    problems(
      'model R',
      '    a: TEXT',
      'entity E',
      '    identity nope',
      '    models',
      '        R',
      '    expose',
      '        a',
      '        b',
      '    hide',
      '        a',
      '        c',
    ),
    ['unknown-field 9:9', 'exposed-and-hidden 11:9', 'unknown-field 12:9', 'unknown-field 4:14'],
  );
});

test('reports navigation fields that clash, and identities that reach several entities', () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    name: TEXT',
      'entity User',
      '    identity name',
      '    models',
      '        UserRecord',
      'model TaskRecord',
      '    title: TEXT',
      'entity Task',
      '    identity owner, tasks',
      '    models',
      '        TaskRecord',
      'relation User[tasks] 1 --- 0..* Task[owner]',
      'relation User[name] 1 --- 0..* Task[owner]',
      'relation Task[tasks] 0..* --- 0..* Task[others]',
    ),
    ['navigation-clash 14:15', 'navigation-clash 14:37', 'not-single 10:21'],
  );
});

test('checks subjects, groups, roles and memberships', () => {
  assert.deepEqual(
    problems(
      'model R',
      '    when: DATE_TIME',
      '    name: TEXT',
      'entity Subject',
      '    subject',
      '    models',
      '        R',
      'entity Timed',
      '    subject',
      '    identity when',
      '    models',
      '        R',
      'entity Loner',
      '    role admin',
      '    models',
      '        R',
      'entity Both',
      '    subject',
      '    identity name',
      '    membership a in b',
      '    models',
      '        R',
      'entity Member',
      '    membership name in team with missing',
      '    models',
      '        R',
    ),
    [
      'missing-identity 4:8',
      'identity-type 10:14',
      'role-without-group 14:5',
      'membership-conflict 20:5',
      'unknown-field 20:16',
      'unknown-field 20:21',
      'not-navigation 24:16',
      'unknown-field 24:24',
      'unknown-field 24:34',
    ],
  );
});

test('checks the group kinds, roles and permissions that security declarations name', () => {
  assert.deepEqual(
    problems(
      ...SECURITY,
      'model TeamRecord',
      '    slug: TEXT',
      'entity Team',
      '    group organization',
      '    models',
      '        TeamRecord',
      'permissions team',
      '    "a"',
      'permissions organization has owner',
      '    "b"',
      'action A(org: Organization): VOID',
      '    body',
      '        if @subject can "invoices:delete" within org or @subject is owner within org',
      '            return',
    ),
    [
      'duplicate-group 37:11',
      'unknown-group 40:13',
      'unknown-role 42:30',
      'unknown-permission 46:25',
      'unknown-role 46:69',
    ],
  );
});
