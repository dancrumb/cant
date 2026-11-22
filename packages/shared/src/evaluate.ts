import type { Position } from 'unist';
import type { BinaryExpression, Expression, Identifier, Name, UnaryExpression } from './ast.ts';
import {
  boolean,
  compare,
  DATE_TIME_LIMIT,
  dateTimeMilliseconds,
  durationMilliseconds,
  equal,
  number,
  text,
  toText,
  type BaseValue,
  type Value,
} from './values.ts';

/**
 * What the names in an expression mean. The compiler and the interpreter each provide one, from
 * their own view of the program: the compiler from its symbol tables, the interpreter from a
 * compiled program (docs/adr/0039-compiled-programs.md).
 */
export interface EvaluationScope {
  /** The value a name has, or `undefined` if it isn't known before the program runs. */
  value(name: Name): Value | undefined;
  /** The value of `member` of the enum `object` names, or `undefined` if `object` doesn't name an enum. */
  enumMember(object: Name, member: Identifier): Value | undefined;
}

/** A built-in error that an expression raises (docs/adr/0019-operators.md, 0023). */
export type RaisedError = 'DivisionByZero' | 'FractionalModulo';

/** What evaluating an expression gives. */
export type Evaluation =
  | { kind: 'value'; value: Value }
  /** It raises a built-in error, at `position`. */
  | { kind: 'error'; error: RaisedError; position: Position }
  /** It panics, at `position` (docs/adr/0023-error-handling.md). */
  | { kind: 'panic'; message: string; position: Position }
  /** `expression` isn't a constant expression, so its value isn't known (docs/adr/0023-error-handling.md). */
  | { kind: 'notConstant'; expression: Expression };

/** A value the caller can't work with, such as an operand of the wrong type, ends evaluation. */
class Stop extends Error {
  readonly result: Exclude<Evaluation, { kind: 'value' }>;
  constructor(result: Exclude<Evaluation, { kind: 'value' }>) {
    super(result.kind);
    this.result = result;
  }
}

/**
 * Evaluate a constant expression (docs/adr/0023-error-handling.md, 0034): literals, strings,
 * enum members, constants, objects, and the operators on them (docs/adr/0019-operators.md,
 * 0026). Anything else, such as a call or a collection, is not a constant expression.
 *
 * The compiler has already checked the expression's types, so an operand of the wrong type ends
 * evaluation as not constant rather than being reported again.
 */
export function evaluate(expression: Expression, scope: EvaluationScope): Evaluation {
  try {
    return { kind: 'value', value: new Evaluator(scope).value(expression) };
  } catch (stop) {
    if (stop instanceof Stop) {
return stop.result;
}
    throw stop;
  }
}

class Evaluator {
  private readonly scope: EvaluationScope;

  constructor(scope: EvaluationScope) {
    this.scope = scope;
  }

  value(expression: Expression): Value {
    switch (expression.type) {
      case 'number':
        return number(expression.value);
      case 'boolean':
        return boolean(expression.value);
      case 'dateTime':
        return { kind: 'dateTime', value: dateTimeMilliseconds(expression.value) };
      case 'duration':
        return { kind: 'duration', value: durationMilliseconds(expression.value) };
      case 'string':
        return text(
          expression.parts.map((part) => (part.type === 'text' ? part.value : toText(this.value(part.expression)))).join(''),
        );
      case 'identifier':
      case 'qualifiedIdentifier':
        return this.scope.value(expression) ?? notConstant(expression);
      case 'object': {
        const members: [string, Value][] = [];
        for (const item of expression.items) {
          // A built-in name, such as `@entity` in a test case's subject, names a type, not a
          // value (docs/adr/0037-test-case-trigger-source.md), so it isn't a member.
          if (item.name.type === 'builtIn') {
continue;
}
          const name = item.name.type === 'identifier' ? item.name.value : this.text(item.name);
          members.push([name, this.value(item.value)]);
        }
        return { kind: 'object', members };
      }
      case 'member': {
        const object = expression.object;
        if (object.type === 'identifier' || object.type === 'qualifiedIdentifier') {
          const member = this.scope.enumMember(object, expression.property);
          if (member !== undefined) {
return member;
}
        }
        return this.member(this.value(object), expression.property.value, expression);
      }
      case 'index': {
        const object = this.value(expression.object);
        const index = this.value(expression.index);
        return index.kind === 'text' ? this.member(object, index.value, expression) : notConstant(expression);
      }
      case 'unary':
        return this.unary(expression);
      case 'binary':
        return this.binary(expression);
      default:
        return notConstant(expression);
    }
  }

  private text(expression: Expression): string {
    const value = this.value(expression);
    return value.kind === 'text' ? value.value : notConstant(expression);
  }

  private member(object: Value, name: string, expression: Expression): Value {
    if (object.kind !== 'object') {
return notConstant(expression);
}
    return object.members.find(([member]) => member === name)?.[1] ?? notConstant(expression);
  }

  private unary(expression: UnaryExpression): Value {
    const argument = this.base(expression.argument);
    switch (expression.operator) {
      case '!':
        return argument.kind === 'boolean' ? boolean(!argument.value) : notConstant(expression);
      case '-':
        if (argument.kind === 'number') {
return number(-argument.value);
}
        if (argument.kind === 'duration') {
return { kind: 'duration', value: 0 - argument.value };
}
        return notConstant(expression);
      default:
        // `isEmpty` and `ignore` need optionals and results, which constants never are.
        return notConstant(expression);
    }
  }

  private binary(expression: BinaryExpression): Value {
    const { operator } = expression;
    if (operator === 'and' || operator === 'or') {
      // Short-circuiting: the right-hand side is only evaluated when it decides the result.
      const left = this.boolean(expression.left);
      if (operator === 'and' ? !left : left) {
return boolean(left);
}
      return boolean(this.boolean(expression.right));
    }
    if (operator === 'orElse' || operator === 'in') {
return notConstant(expression);
}

    const leftValue = this.value(expression.left);
    const rightValue = this.value(expression.right);
    if (operator === '==') {
return boolean(equal(leftValue, rightValue));
}
    if (operator === '!=') {
return boolean(!equal(leftValue, rightValue));
}
    if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=') {
      const order = compare(leftValue, rightValue);
      if (order === undefined) {
return notConstant(expression);
}
      return boolean(operator === '<' ? order < 0 : operator === '<=' ? order <= 0 : operator === '>' ? order > 0 : order >= 0);
    }

    // Arithmetic acts on enum members' values (docs/adr/0019-operators.md).
    const left = baseOf(leftValue) ?? notConstant(expression.left);
    const right = baseOf(rightValue) ?? notConstant(expression.right);
    return this.arithmetic(expression, left, right);
  }

  /** The arithmetic operators, on numbers, and on dates and durations (docs/adr/0019-operators.md, 0026). */
  private arithmetic(expression: BinaryExpression, left: BaseValue, right: BaseValue): Value {
    const { operator } = expression;
    if (left.kind === 'number' && right.kind === 'number') {
      switch (operator) {
        case '+':
          return this.finite(left.value + right.value, expression);
        case '-':
          return this.finite(left.value - right.value, expression);
        case '*':
          return this.finite(left.value * right.value, expression);
        case '**':
          return this.finite(left.value ** right.value, expression);
        case '/':
          if (right.value === 0) {
return raise('DivisionByZero', expression);
}
          return this.finite(left.value / right.value, expression);
        case '%':
          if (right.value === 0) {
return raise('DivisionByZero', expression);
}
          if (!Number.isInteger(left.value) || !Number.isInteger(right.value)) {
return raise('FractionalModulo', expression);
}
          // A mathematical modulo: the result has the sign of the right operand.
          return number((((left.value % right.value) + right.value) % right.value) + 0);
        default:
          return notConstant(expression);
      }
    }

    const duration = (milliseconds: number): Value => ({ kind: 'duration', value: Math.trunc(milliseconds) + 0 });
    const dateTime = (milliseconds: number): Value => {
      if (Math.abs(milliseconds) > DATE_TIME_LIMIT) {
        panic('The result is outside the range of instants a DATE_TIME can hold.', expression);
      }
      return { kind: 'dateTime', value: milliseconds };
    };

    switch (`${left.kind} ${operator} ${right.kind}`) {
      case 'dateTime + duration':
        return dateTime(left.value as number + (right.value as number));
      case 'duration + dateTime':
        return dateTime(left.value as number + (right.value as number));
      case 'dateTime - duration':
        return dateTime(left.value as number - (right.value as number));
      case 'dateTime - dateTime':
        return duration(left.value as number - (right.value as number));
      case 'duration + duration':
        return duration(left.value as number + (right.value as number));
      case 'duration - duration':
        return duration(left.value as number - (right.value as number));
      case 'duration * number':
        return duration(left.value as number * (right.value as number));
      case 'number * duration':
        return duration(left.value as number * (right.value as number));
      case 'duration / number':
        if (right.value === 0) {
return raise('DivisionByZero', expression);
}
        return duration(left.value as number / (right.value as number));
      case 'duration / duration':
        if (right.value === 0) {
return raise('DivisionByZero', expression);
}
        return number(left.value as number / (right.value as number));
      default:
        return notConstant(expression);
    }
  }

  /** Cant has no `Infinity` or `NaN` (docs/adr/0019-operators.md), so a result that would be one panics. */
  private finite(value: number, expression: Expression): Value {
    if (!Number.isFinite(value)) {
panic('The result is not a number Cant can hold: it is too large, or not a real number.', expression);
}
    return number(value + 0);
  }

  private base(expression: Expression): BaseValue {
    return baseOf(this.value(expression)) ?? notConstant(expression);
  }

  private boolean(expression: Expression): boolean {
    const value = this.base(expression);
    return value.kind === 'boolean' ? value.value : notConstant(expression);
  }
}

/** A base value, or an enum member's value, which operators act on. */
const baseOf = (value: Value): BaseValue | undefined =>
  value.kind === 'object' ? undefined : value.kind === 'enum' ? value.value : value;

const notConstant = (expression: Expression): never => {
  throw new Stop({ kind: 'notConstant', expression });
};

const raise = (error: 'DivisionByZero' | 'FractionalModulo', expression: Expression): never => {
  throw new Stop({ kind: 'error', error, position: expression.position });
};

const panic = (message: string, expression: Expression): never => {
  throw new Stop({ kind: 'panic', message, position: expression.position });
};
