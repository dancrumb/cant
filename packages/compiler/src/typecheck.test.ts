import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProgram } from './program.ts';

/** Check `/app/main.cant`, given as its lines, and list its problems as `code line:column`. */
const problems = (...lines: string[]): string[] =>
  checkProgram('/app/main.cant', { readFile: (path) => (path === '/app/main.cant' ? lines.join('\n') : undefined) }).diagnostics.map(
    ({ code, position }) => `${code} ${String(position.start.line)}:${String(position.start.column)}`,
  );

/** Problems in the body of `action A(<parameters>): <returns>`, whose lines start on line 3. */
const inBody = (signature: string, ...lines: string[]): string[] =>
  problems(`action A(${signature}`, '    body', ...lines.map((line) => `        ${line}`));

test('types literals, operators and conditions', () => {
  assert.deepEqual(
    inBody(
      '): VOID',
      'a := 1 + 2 * 3',
      'b := "x" + "y"',
      'c := 1 == "1"',
      'd := 1 < 2 and "a" < "b"',
      'e := true < false',
      'if 1',
      '    return',
      'f := !3',
    ),
    ['type-mismatch 4:14', 'type-mismatch 5:14', 'type-mismatch 7:14', 'type-mismatch 8:12', 'type-mismatch 10:15'],
  );
});

test('types dates, durations and their arithmetic', () => {
  assert.deepEqual(
    inBody(
      '): VOID',
      'due := @now + DURATION("P30D")',
      'late := @now - due',
      'weeks := late / DURATION("P7D")',
      'half := late / 2',
      'bad := @now + @now',
      'worse := DURATION("P1D") + 1',
      'if late > DURATION("P1D") and weeks > 2',
      '    return',
    ),
    ['type-mismatch 7:16', 'type-mismatch 8:18'],
  );
});

test('types the standard streams', () => {
  assert.deepEqual(
    problems(
      'import IO',
      'action Take(value: UNKNOWN): VOID',
      '    body',
      '        return',
      'action A(): VOID',
      '    body',
      '        out := @stdout',
      '        IO::write(message := "hi", stream := out)',
      '        same := out == @stderr',
      '        mixed := @stdin == @stdout',
      '        text := "to ${@stderr}"',
      '        Take(value := @stdin)',
      '        streams := [@stdout, @stderr]',
      '        Take(value := streams)',
      '        x := out.fd',
    ),
    ['type-mismatch 10:18', 'not-text 11:23', 'type-mismatch 12:23', 'type-mismatch 14:23', 'no-fields 15:18'],
  );
});

test('checks returns, and actions that can end without one', () => {
  assert.deepEqual(
    problems(
      'action Count(): NUMBER',
      '    body',
      '        return "one"',
      'action Nothing(): VOID',
      '    body',
      '        return 1',
      'action Missing(flag: BOOLEAN): NUMBER',
      '    body',
      '        if flag',
      '            return 1',
      'action Both(flag: BOOLEAN): NUMBER',
      '    body',
      '        if flag',
      '            return 1',
      '        else',
      '            return 2',
      'action Bare(): NUMBER',
      '    body',
      '        return',
      'action Maybe(): NUMBER?',
      '    body',
      '        return NOTHING',
      'action Never(): NUMBER',
      '    body',
      '        return NOTHING',
      'action Forever(): NUMBER',
      '    body',
      '        while true',
      '            return 1',
    ),
    ['type-mismatch 3:16', 'return-value 6:16', 'missing-return 7:8', 'return-value 19:9', 'return-value 25:16'],
  );
});

test('checks call arguments and results, including VOID', () => {
  assert.deepEqual(
    problems(
      'action Greet(name: TEXT, times?: NUMBER := 1): TEXT',
      '    native "./greet.js"',
      'action Say(): VOID',
      '    native "./say.js"',
      'action A(): VOID',
      '    body',
      '        a := Greet(name := 3)',
      '        b := Greet(name := "Ada", times := "twice")',
      '        c := Say()',
      '        d := Greet("Ada") + 1',
    ),
    ['type-mismatch 7:28', 'type-mismatch 8:44', 'void-value 9:14', 'type-mismatch 10:14'],
  );
});

test('checks enum values and compatibility', () => {
  assert.deepEqual(
    problems(
      'enum InvoiceStatus',
      '    draft',
      '    sent',
      '    paid',
      'enum QuoteStatus',
      '    draft',
      '    sent',
      'enum PaymentStatus',
      '    paid',
      '    refunded',
      'action Set(status: InvoiceStatus): VOID',
      '    native "./set.js"',
      'action A(code: TEXT, quote: QuoteStatus, payment: PaymentStatus): InvoiceStatus',
      '    body',
      '        Set(status := quote)',
      '        Set(status := payment)',
      '        Set(status := "paid")',
      '        Set(status := "refunded")',
      '        Set(status := code)',
      '        if quote == InvoiceStatus.draft and quote == "draft"',
      '            return "draft"',
      '        return "void"',
    ),
    ['type-mismatch 16:23', 'type-mismatch 18:23', 'type-mismatch 22:16'],
  );
});

test('checks fields of models, entities, maps and object values', () => {
  assert.deepEqual(
    problems(
      'model Customer',
      '    name: TEXT',
      '    age: NUMBER',
      '    nickname?: TEXT',
      '    country?: TEXT := "GB"',
      'entity Account',
      '    models',
      '        Customer',
      '    expose',
      '        name as fullName',
      'action Register(customer: Customer): VOID',
      '    native "./register.js"',
      'action A(c: Customer, account: Account, headers: {TEXT}): VOID',
      '    body',
      '        a := c.name',
      '        b := c.shoeSize',
      '        n := c.nickname + "!"',
      '        country := "${c.country}"',
      '        x := account.fullName',
      '        y := account.name',
      '        h := headers.contentType',
      '        "${h}"',
      '        Register(customer := { name := "Ada", age := 36 })',
      '        Register(customer := { name := "Ada" })',
      '        Register(customer := { name := "Ada", age := 36, shoeSize := 9 })',
      '        c.name := 3',
      '        delete c.name',
      '        delete c.nickname',
    ),
    [
      'unknown-field 16:16',
      'unchecked-optional 17:14',
      'unknown-field 20:22',
      'unchecked-optional 22:12',
      'type-mismatch 24:30',
      'type-mismatch 25:30',
      'type-mismatch 26:19',
      'delete-required 27:18',
    ],
  );
});

test('lets an object whose members have different types be a {UNKNOWN}, but no other map', () => {
  assert.deepEqual(
    problems(
      'action Log(data: {UNKNOWN}): VOID',
      '    native "./log.js"',
      'action Send(headers: {TEXT}): VOID',
      '    native "./send.js"',
      'action A(): VOID',
      '    body',
      '        Log(data := { name := "Ada", age := 36 })',
      '        Send(headers := { name := "Ada", age := 36 })',
    ),
    ['type-mismatch 8:25'],
  );
});

test('narrows optionals with isEmpty, through !, and, or, early returns and assert', () => {
  assert.deepEqual(
    problems(
      'action Find(email: TEXT): TEXT?',
      '    native "./find.js"',
      'action Greet(name: TEXT): VOID',
      '    native "./greet.js"',
      'action A(email: TEXT, admin: BOOLEAN): VOID',
      '    body',
      '        user := Find(email)',
      '        Greet(user)',
      '        if !isEmpty user and admin',
      '            Greet(user)',
      '        if isEmpty user or admin',
      '            Greet(user)',
      '        else',
      '            Greet(user)',
      '        name := Find(email) orElse "friend"',
      '        Greet(name)',
      '        chained := Find(email) orElse Find(email)',
      '        Greet(chained)',
      '        isEmpty email',
      '        email orElse "x"',
      '        if isEmpty user',
      '            return',
      '        Greet(user)',
      'action B(email: TEXT): VOID',
      '    body',
      '        user := Find(email)',
      '        assert !isEmpty user',
      '        Greet(user)',
    ),
    [
      'unchecked-optional 8:15',
      'unchecked-optional 12:19',
      'unchecked-optional 18:15',
      'not-optional 19:17',
      'not-optional 20:9',
    ],
  );
});

test('narrows UNKNOWN with instanceOf, and @subject with is', () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    name: TEXT',
      '    email: TEXT',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      '    expose',
      '        @all',
      'action Describe(value: UNKNOWN): TEXT',
      '    body',
      '        if value instanceOf NUMBER',
      '            return "a number: ${value + 1}"',
      '        "${value}"',
      '        if @subject is User and @subject.name == "Ada"',
      '            return @subject.name',
      '        return @subject.name',
    ),
    ['not-text 15:12', 'unknown-field 18:25'],
  );
});

test('checks collections: element types, optionals, loops and indexes', () => {
  assert.deepEqual(
    inBody(
      'scores: [NUMBER], tags: SET(TEXT), names: {TEXT}): VOID',
      'mixed := [1, "two"]',
      'first := scores[0]',
      'total := first + 1',
      'safe := (scores[0] orElse 0) + 1',
      'for tag in tags',
      '    "${tag}"',
      'for name in names',
      '    "${name}"',
      'tags[0]',
      'scores["x"]',
      'b := "x" in scores',
    ),
    ['type-mismatch 3:22', 'unchecked-optional 5:18', 'loop-over-map 9:21', 'set-index 11:9', 'type-mismatch 12:16', 'type-mismatch 13:14'],
  );
});

test('checks defaults, constants, trigger arguments, auth and assertions', () => {
  assert.deepEqual(
    problems(
      'const limit: NUMBER := "ten"',
      'const base := "/api"',
      'model M',
      '    size?: NUMBER := "big"',
      'action Greet(name: TEXT, times?: NUMBER := "twice"): VOID',
      '    native "./greet.js"',
      'trigger Greet on Start',
      '    auth',
      '        "everyone"',
      '    arguments',
      '        name := 3',
      'trigger Greet on TestCase',
      '    parameters',
      '        name := 42',
      '        now := "today"',
      '    arguments',
      '        name := base',
      '    assertions',
      '        @result, "returns"',
      '        true, 1',
    ),
    [
      'type-mismatch 1:24',
      'type-mismatch 4:22',
      'type-mismatch 5:44',
      'type-mismatch 9:9',
      'type-mismatch 11:17',
      'type-mismatch 14:17',
      'type-mismatch 15:16',
      // Greet returns VOID, so @result isn't a BOOLEAN.
      'type-mismatch 19:9',
      'type-mismatch 20:15',
    ],
  );
});

test("checks a test case's subject against its entity's model", () => {
  assert.deepEqual(
    problems(
      'model UserRecord',
      '    email: TEXT',
      '    name?: TEXT',
      'entity User',
      '    subject',
      '    identity email',
      '    models',
      '        UserRecord',
      'action Run(): VOID',
      '    native "./run.js"',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "valid"',
      '        subject := { @entity := User, email := "ada@example.com" }',
      'trigger Run on TestCase',
      '    parameters',
      '        name := "missing email"',
      '        subject := { @entity := User, name := "Ada" }',
    ),
    ['type-mismatch 18:20'],
  );
});

test('checks that within names a group', () => {
  assert.deepEqual(
    problems(
      'model OrgRecord',
      '    slug: TEXT',
      'entity Organization',
      '    group organization',
      '    identity slug',
      '    models',
      '        OrgRecord',
      'permissions organization',
      '    "read"',
      'action A(org: Organization, name: TEXT): VOID',
      '    body',
      '        if @subject can "read" within org or @subject can "read" within name',
      '            return',
    ),
    ['not-a-group 12:73'],
  );
});

test('lets a constant declare an enum type and give one of its values', () => {
  assert.deepEqual(
    problems('enum Status', '    draft', '    sent', 'const fallback: Status := "draft"', 'const wrong: Status := "paid"'),
    ['type-mismatch 5:24'],
  );
});

test("checks calls against cant::IO's declarations", () => {
  assert.deepEqual(
    problems(
      'import IO',
      'action A(doc: FILE): VOID',
      '    body',
      '        IO::write("plain")',
      '        IO::write(message := "error", stream := @stderr)',
      '        IO::write(message := "in", stream := @stdin)',
      '        IO::write(message := "file", stream := doc)',
      '        IO::write(42)',
      '        ignore IO::read()',
      '        ignore IO::read(stream := doc)',
      '        ignore IO::read(stream := @stdout)',
    ),
    ['type-mismatch 6:46', 'type-mismatch 7:48', 'type-mismatch 8:19', 'type-mismatch 11:35'],
  );
});

test("doesn't let a program name cant::IO's stream types", () => {
  assert.deepEqual(
    problems('import IO', 'action A(stream: ReadStream, out: IO::WriteStream): VOID', '    body', '        return'),
    ['unknown-name 2:18', 'unknown-name 2:35'],
  );
});

test("works out the types in calls to cant::Collections' generic actions", () => {
  assert.deepEqual(
    problems(
      'import Collections into Collections',
      'action A(scores: [NUMBER], names: [TEXT], headers: {TEXT}, tags: SET(TEXT), ids: SET(NUMBER)): VOID',
      '    body',
      '        n := Collections::length(scores) + Collections::size(headers) + Collections::length(tags)',
      '        bad := Collections::length(5)',
      '        all := Collections::concat(src := [1, 2], tgt := scores)',
      '        total := (all[0] orElse 0) + 1',
      '        mixed := Collections::concat(src := names, tgt := scores)',
      '        kinds := Collections::concat(src := tags, tgt := scores)',
      '        fresh := Collections::concat(src := [], tgt := names)',
      '        first := fresh[0] orElse "none"',
      '        joined := "${Collections::join(coll := tags, delim := ", ")}!"',
      '        nope := Collections::keys(scores)',
      '        value := Collections::values(headers)[0] orElse "x"',
      '        Collections::add(set := tags, value := "urgent")',
      '        Collections::add(set := tags, value := 3)',
      '        both := Collections::intersect(first := tags, second := ids)',
      '        sub := Collections::isSubset(subset := tags, superset := SET("a")) and true',
    ),
    ['type-mismatch 5:36', 'type-mismatch 8:59', 'type-mismatch 9:58', 'type-mismatch 13:35', 'type-mismatch 16:48', 'type-mismatch 17:65'],
  );
});

test("doesn't let a program declare type parameters or write a generic type", () => {
  assert.deepEqual(
    problems('action First<T>(items: [T]): T', '    native "./first.js"', 'action Count(items: Collection<TEXT>): NUMBER', '    native "./count.js"'),
    ['generic-action 1:14', 'generic-type 3:21'],
  );
});

test("checks calls against cant::Time's declarations", () => {
  assert.deepEqual(
    problems(
      'import Time into Time',
      'action A(): TEXT passes Time::UnknownTimeZone',
      '    body',
      '        due := Time::addDays(time := @now, days := 30, zone := "Europe/London")',
      '        if due instanceOf Time::UnknownTimeZone or due instanceOf Time::NotWholeNumber',
      '            return "bad"',
      '        later := due + DURATION("PT1H")',
      '        when := Time::parse("2026-11-21T09:30:00Z")',
      '        ignore Time::addMonths(time := "today", months := 1, zone := "UTC")',
      '        ignore Time::format(time := later, zone := "UTC", style := "weekday")',
      '        pass Time::format(time := later, zone := "UTC", style := "date")',
    ),
    ['type-mismatch 9:40', 'type-mismatch 10:68', 'unhandled-result 8:9'],
  );
});
