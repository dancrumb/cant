import { CantDuration, CantFile } from '@dancrumb/cant-native';
import { toText, type BaseValue } from '@dancrumb/cant-shared';

/**
 * Cant's equality and conversion to text, for values as native code holds them: plain JavaScript
 * values (docs/adr/0036-native-modules.md#representing-values).
 */

/** A base value as the shared value helpers hold it, or `undefined` for anything else. */
function baseValue(value: unknown): BaseValue | undefined {
  if (typeof value === 'string') {
return { kind: 'text', value };
}
  if (typeof value === 'number') {
return { kind: 'number', value };
}
  if (typeof value === 'boolean') {
return { kind: 'boolean', value };
}
  if (value instanceof Date) {
return { kind: 'dateTime', value: value.getTime() };
}
  if (CantDuration.is(value)) {
return { kind: 'duration', value: value.milliseconds };
}
  return undefined;
}

/**
 * Whether two values are equal under `==` (docs/adr/0019-operators.md): base values by value, a
 * `FILE` by its URL (docs/adr/0017-faceted-types.md), and collections and objects only when they
 * are the same one.
 */
export function equal(a: unknown, b: unknown): boolean {
  if (CantFile.is(a) || CantFile.is(b)) {
return CantFile.is(a) && CantFile.is(b) && a.url().href === b.url().href;
}
  const left = baseValue(a);
  const right = baseValue(b);
  if (left === undefined || right === undefined) {
return a === b;
}
  return left.kind === right.kind && left.value === right.value;
}

/** Whether a value is an object of a model: a plain object, not a collection or a `Date`. */
const isObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
return false;
}
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Whether a set holds a value equal to `value` (docs/adr/0021-collections.md#sets). */
export const holds = (set: ReadonlySet<unknown>, value: unknown): boolean => [...set].some((element) => equal(element, value));

/** An array's elements, skipping its slots with no element (docs/adr/0021-collections.md). */
export const elements = (array: readonly unknown[]): unknown[] =>
  // `reduce` skips empty slots.
  array.reduce<unknown[]>((kept, element) => {
    kept.push(element);
    return kept;
  }, []);

/**
 * The members of a collection, each as text: an array's elements, skipping empty slots, a map's
 * members as `name: value`, in its stable order, and a set's elements
 * (docs/adr/0021-collections.md#converting-collections-to-text).
 */
export function memberTexts(collection: unknown): string[] {
  if (Array.isArray(collection)) {
return elements(collection).map(textOf);
}
  if (collection instanceof Map) {
return [...collection].map(([name, value]) => `${String(name)}: ${textOf(value)}`);
}
  if (collection instanceof Set) {
return [...collection].map(textOf);
}
  throw new TypeError('Not a collection.');
}

/**
 * A value as text (docs/adr/0011-converting-values-to-text.md): a base value as the shared
 * helpers write it, a `FILE` as its URL, a collection as its members joined with ", ", and an
 * object as its fields, `name: value`, with an object inside written as `model`, since a plain
 * object doesn't say which model it is.
 */
export function textOf(value: unknown): string {
  const base = baseValue(value);
  if (base !== undefined) {
return toText(base);
}
  if (CantFile.is(value)) {
return value.url().href;
}
  if (Array.isArray(value) || value instanceof Map || value instanceof Set) {
return memberTexts(value).join(', ');
}
  if (isObject(value)) {
    return Object.entries(value)
      .map(([name, member]) => `${name}: ${isObject(member) ? 'model' : textOf(member)}`)
      .join(', ');
  }
  throw new TypeError(`${typeof value} isn't a Cant value.`);
}
