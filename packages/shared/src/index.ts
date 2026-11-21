export function cant(): string {
  return 'cant';
}

export { KEYWORDS, tokenize } from './tokenize.ts';
export type { Token, TokenKind } from './tokenize.ts';

export { parse, ParseError } from './parse.ts';
export type * from './ast.ts';

export { evaluate } from './evaluate.ts';
export type { Evaluation, EvaluationScope, RaisedError } from './evaluate.ts';

export {
  compare,
  DATE_TIME_LIMIT,
  dateTimeMilliseconds,
  durationMilliseconds,
  durationToText,
  equal,
  numberToText,
  toText,
} from './values.ts';
export type { BaseValue, EnumValue, ObjectInstance, Value } from './values.ts';

export { COMPILED_FORMAT } from './compiled.ts';
export type * from './compiled.ts';
