/**
 * Values, as the compiler works them out for constant expressions and the interpreter holds them
 * at runtime (docs/adr/0039-compiled-programs.md). For now, only the values that constant
 * expressions can have: collections, files and entities are still to come.
 *
 * A value is plain data, so it can be written to and read from JSON.
 */
export type Value = BaseValue | EnumValue | ObjectInstance;

/** A value of one of the base types (docs/adr/0012-base-types.md, 0026). */
export type BaseValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  /** An instant, as milliseconds since 1970-01-01T00:00:00Z (docs/adr/0026-dates-and-times.md). */
  | { kind: 'dateTime'; value: number }
  /** An exact length of time, as a whole number of milliseconds, which can be negative. */
  | { kind: 'duration'; value: number };

/** A member of an enum: the enum it belongs to, and the member's value (docs/adr/0013-enums.md). */
export interface EnumValue {
  kind: 'enum';
  /** The enum's symbol, `<module>#<name>` (docs/adr/0039-compiled-programs.md). */
  enum: string;
  value: BaseValue;
}

/**
 * An object (docs/adr/0027-object-shapes.md): of a named model, or of an anonymous one when
 * `model` is missing. Its members are in order, which converting it to text follows.
 */
export interface ObjectInstance {
  kind: 'object';
  /** The model's symbol, `<module>#<name>`. */
  model?: string;
  members: [name: string, value: Value][];
}

export const text = (value: string): BaseValue => ({ kind: 'text', value });
export const number = (value: number): BaseValue => ({ kind: 'number', value });
export const boolean = (value: boolean): BaseValue => ({ kind: 'boolean', value });

/** The range of a `DATE_TIME`, in milliseconds either side of 1970, which JavaScript's `Date` can hold. */
export const DATE_TIME_LIMIT = 8.64e15;

/** A `DATE_TIME` literal's string: an ISO 8601 date and time with a `Z` or an offset (docs/adr/0026-dates-and-times.md). */
const DATE_TIME_TEXT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Whether text is written as a `DATE_TIME` literal's string is, and names a real instant
 * (docs/adr/0026-dates-and-times.md). The parser checks literals with it, and `Time::parse` text.
 */
export function isDateTimeText(text: string): boolean {
  const match = DATE_TIME_TEXT.exec(text);
  if (match === null) {
return false;
}
  // Unmatched groups are `undefined`, so they take these defaults.
  const [year = '0', month = '0', day = '0', hour = '0', minute = '0', second = '0', offsetHours = '0', offsetMinutes = '0'] = match.slice(1);
  const daysInMonth = [31, isLeapYear(Number(year)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= (daysInMonth[Number(month) - 1] ?? 0) &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    Number(offsetHours) <= 23 &&
    Number(offsetMinutes) <= 59
  );
}

/** The instant a `DATE_TIME` literal's string names (docs/adr/0026-dates-and-times.md). */
export const dateTimeMilliseconds = (text: string): number => Date.parse(text);

/**
 * A `DURATION` literal's length in milliseconds, so that equal durations written differently,
 * such as `PT60M` and `PT1H`, are the same value (docs/adr/0026-dates-and-times.md).
 */
export function durationMilliseconds(text: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text);
  if (match === null) {
return Number.NaN;
}
  const [days = '0', hours = '0', minutes = '0', seconds = '0'] = match.slice(1);
  return Math.round(((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000 + Number(seconds) * 1000);
}

/**
 * Whether two values are equal under `==` (docs/adr/0019-operators.md): base values by value,
 * enum values by their members' values, whatever enum they belong to, and objects only when they
 * are the same object.
 */
export function equal(a: Value, b: Value): boolean {
  if (a.kind === 'object' || b.kind === 'object') {
return a === b;
}
  const left = a.kind === 'enum' ? a.value : a;
  const right = b.kind === 'enum' ? b.value : b;
  return left.kind === right.kind && left.value === right.value;
}

/**
 * How two values are ordered, for `<`, `<=`, `>` and `>=`, or `undefined` if they can't be
 * (docs/adr/0019-operators.md): numbers, text by UTF-16 code unit, instants and durations, and
 * enum values by their members' values.
 */
export function compare(a: Value, b: Value): number | undefined {
  if (a.kind === 'object' || b.kind === 'object') {
return undefined;
}
  const left = a.kind === 'enum' ? a.value : a;
  const right = b.kind === 'enum' ? b.value : b;
  if (left.kind !== right.kind || left.kind === 'boolean') {
return undefined;
}
  return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
}

/** Convert a value to text (docs/adr/0011-converting-values-to-text.md). */
export function toText(value: Value): string {
  switch (value.kind) {
    case 'text':
      return value.value;
    case 'number':
      return numberToText(value.value);
    case 'boolean':
      return String(value.value);
    case 'dateTime':
      return new Date(value.value).toISOString();
    case 'duration':
      return durationToText(value.value);
    case 'enum':
      return toText(value.value);
    case 'object':
      // One layer deep: an object inside is written as its model's name, or `model`.
      return value.members
        .map(([name, member]) => `${name}: ${member.kind === 'object' ? modelName(member) : toText(member)}`)
        .join(', ');
  }
}

const modelName = (object: ObjectInstance): string =>
  object.model === undefined ? 'model' : object.model.slice(object.model.lastIndexOf('#') + 1);

/**
 * A number in plain decimal notation, as short as it can be without losing any of its value, and
 * never with an exponent (docs/adr/0011-converting-values-to-text.md).
 */
export function numberToText(value: number): string {
  const written = String(value);
  const exponentAt = written.indexOf('e');
  if (exponentAt === -1) {
return written;
}

  const negative = written.startsWith('-');
  const mantissa = written.slice(negative ? 1 : 0, exponentAt);
  const exponent = Number(written.slice(exponentAt + 1));
  const pointAt = mantissa.indexOf('.');
  const digits = mantissa.replace('.', '');
  // Where the decimal point falls in `digits` once the exponent is applied.
  const point = (pointAt === -1 ? mantissa.length : pointAt) + exponent;

  const plain =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${'0'.repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${plain}` : plain;
}

/**
 * A duration in ISO 8601 form, in days, hours, minutes and seconds, each as large as it can be
 * and left out when it is zero (docs/adr/0026-dates-and-times.md).
 */
export function durationToText(milliseconds: number): string {
  if (milliseconds === 0) {
return 'PT0S';
}
  const sign = milliseconds < 0 ? '-' : '';
  let rest = Math.abs(milliseconds);
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  const fraction = rest - seconds * 1000;

  let time = '';
  if (hours > 0) {
time += `${String(hours)}H`;
}
  if (minutes > 0) {
time += `${String(minutes)}M`;
}
  if (fraction > 0) {
time += `${String(seconds)}.${String(fraction).padStart(3, '0')}S`;
} else if (seconds > 0) {
time += `${String(seconds)}S`;
}
  return `${sign}P${days > 0 ? `${String(days)}D` : ''}${time === '' ? '' : `T${time}`}`;
}
