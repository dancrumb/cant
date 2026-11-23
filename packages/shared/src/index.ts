export function cant(): string {
  return 'cant';
}

export { comments, KEYWORDS, tokenize } from './tokenize.ts';
export type { Comment, Token, TokenKind } from './tokenize.ts';

export { parse, ParseError } from './parse.ts';
export { format } from './format.ts';
export type * from './ast.ts';

export { arithmetic, evaluate } from './evaluate.ts';
export type { ArithmeticResult, Evaluation, EvaluationScope, RaisedError } from './evaluate.ts';

export {
  compare,
  DATE_TIME_LIMIT,
  dateTimeMilliseconds,
  isDateTimeText,
  durationMilliseconds,
  durationToText,
  equal,
  numberToText,
  toText,
} from './values.ts';
export type { BaseValue, EnumValue, ObjectInstance, Value } from './values.ts';

export { COMPILED_FORMAT } from './compiled.ts';
export type * from './compiled.ts';
