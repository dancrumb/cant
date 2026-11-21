import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConstDeclaration, EnumDeclaration } from './ast.ts';
import { evaluate, type Evaluation, type EvaluationScope } from './evaluate.ts';
import { parse } from './parse.ts';
import { toText } from './values.ts';

/**
 * Evaluate the last constant in a program, with its earlier constants and enums in scope, and
 * describe the result: its text for a value, or what stopped it.
 */
const run = (...lines: string[]): string => {
  const program = parse(lines.join('\n'));
  const constants = new Map<string, ConstDeclaration>();
  const enums = new Map<string, EnumDeclaration>();
  for (const declaration of program.children) {
    if (declaration.type === 'const') constants.set(declaration.name.value, declaration);
    if (declaration.type === 'enumDeclaration') enums.set(declaration.name.value, declaration);
  }
  const scope: EvaluationScope = {
    value(name) {
      const constant = name.type === 'identifier' ? constants.get(name.value) : undefined;
      if (constant === undefined) return undefined;
      const result = evaluate(constant.value, scope);
      return result.kind === 'value' ? result.value : undefined;
    },
    enumMember(object, member) {
      const declaration = object.type === 'identifier' ? enums.get(object.value) : undefined;
      const found = declaration?.members.find((candidate) => candidate.name.value === member.value);
      if (declaration === undefined || found === undefined) return undefined;
      const result: Evaluation =
        found.value === undefined ? { kind: 'value', value: { kind: 'text', value: found.name.value } } : evaluate(found.value, scope);
      if (result.kind !== 'value' || result.value.kind === 'enum' || result.value.kind === 'object') return undefined;
      return { kind: 'enum', enum: `main#${declaration.name.value}`, value: result.value };
    },
  };
  const last = [...constants.values()].at(-1);
  if (last === undefined) throw new Error('no constant');
  return describe(evaluate(last.value, scope));
};

const describe = (result: Evaluation): string => {
  switch (result.kind) {
    case 'value':
      return `${result.value.kind} ${toText(result.value)}`;
    case 'error':
      return `error ${result.error}`;
    case 'panic':
      return 'panic';
    case 'notConstant':
      return `not constant ${String(result.expression.position.start.column)}`;
  }
};

const value = (expression: string, ...before: string[]): string => run(...before, `const x := ${expression}`);

test('evaluates literals and arithmetic, with precedence', () => {
  assert.equal(value('1 + 2 * 3'), 'number 7');
  assert.equal(value('7 / 2'), 'number 3.5');
  assert.equal(value('2 ** 3 ** 2'), 'number 512');
  assert.equal(value('-2 ** 2'), 'number 4');
  assert.equal(value('-7 % 3'), 'number 2');
  assert.equal(value('7 % -3'), 'number -2');
  assert.equal(value('1e24'), 'number 1000000000000000000000000');
  assert.equal(value('0.000001 / 10'), 'number 0.0000001');
  assert.equal(value('true and !false'), 'boolean true');
});

test('raises the built-in arithmetic errors, and panics on numbers Cant can\'t hold', () => {
  assert.equal(value('1 / 0'), 'error DivisionByZero');
  assert.equal(value('1 % 0'), 'error DivisionByZero');
  assert.equal(value('7.5 % 2'), 'error FractionalModulo');
  assert.equal(value('DURATION("PT1H") / 0'), 'error DivisionByZero');
  assert.equal(value('10 ** 400'), 'panic');
});

test('compares values, enums by their values', () => {
  assert.equal(value('"apple" < "banana" and "Z" < "a"'), 'boolean true');
  assert.equal(value('1 == 1.0 and 1 != 2'), 'boolean true');
  assert.equal(value('DURATION("PT60M") == DURATION("PT1H")'), 'boolean true');
  assert.equal(value('DATE_TIME("2026-11-14T10:30Z") == DATE_TIME("2026-11-14T09:30-01:00")'), 'boolean true');
  assert.equal(
    value('Invoice.paid == Quote.paid and Invoice.paid == "paid"', 'enum Invoice', '    paid', 'enum Quote', '    paid'),
    'boolean true',
  );
  assert.equal(value('{ a := 1 } == { a := 1 }'), 'boolean false');
});

test('does arithmetic on dates and durations', () => {
  assert.equal(value('DATE_TIME("2026-11-14T09:30Z") + DURATION("P30D")'), 'dateTime 2026-12-14T09:30:00.000Z');
  assert.equal(value('DATE_TIME("2026-11-14T09:30Z") - DATE_TIME("2026-11-13T08:00Z")'), 'duration P1DT1H30M');
  assert.equal(value('DURATION("PT1S") / 3'), 'duration PT0.333S');
  assert.equal(value('DURATION("P7D") / DURATION("P1D")'), 'number 7');
  assert.equal(value('-DURATION("PT1H")'), 'duration -PT1H');
  assert.equal(value('DURATION("PT1H") - DURATION("PT1H")'), 'duration PT0S');
  assert.equal(value('DATE_TIME("9999-12-31T00:00Z") + DURATION("P99999999D")'), 'panic');
});

test('builds text from constants, enums and objects', () => {
  assert.equal(value('"${base}/invoices/${limit}"', 'const base := "/api"', 'const limit := 10'), 'text /api/invoices/10');
  assert.equal(value('"${Priority.high}"', 'enum Priority', '    high := 3'), 'text 3');
  assert.equal(value('"${DATE_TIME("2026-11-14T09:30+01:00")}"'), 'text 2026-11-14T08:30:00.000Z');
  assert.equal(value('{ name := "Ada", "full name" := "Ada L", inner := { a := 1 } }'), 'object name: Ada, full name: Ada L, inner: model');
  assert.equal(value('policy.attempts * 2', 'const policy := { attempts := 3 }'), 'number 6');
  assert.equal(value('policy["attempts"]', 'const policy := { attempts := 3 }'), 'number 3');
});

test('stops at what is not a constant expression', () => {
  assert.equal(value('Find() + 1'), 'not constant 12');
  assert.equal(value('[1, 2]'), 'not constant 12');
  assert.equal(value('missing + 1'), 'not constant 12');
  assert.equal(value('@now'), 'not constant 12');
  // `and` doesn't evaluate its right-hand side once its left decides the result.
  assert.equal(value('false and Find()'), 'boolean false');
});
