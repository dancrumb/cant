import type { NativeAction } from '@dancrumb/cant-native';
import { elements, equal, holds, memberTexts } from './values.ts';

/**
 * cant::Collections (docs/adr/0021-collections.md, docs/adr/0043-standard-library-generics.md),
 * declared by packages/compiler/stdlib/Collections.cant. Arrays, maps and sets are passed as
 * JavaScript `Array`s, `Map`s and `Set`s, by reference (docs/adr/0036-native-modules.md). A `Set`
 * never holds two values Cant considers equal, so sets are changed and compared with Cant's
 * equality, not JavaScript's.
 */

type Collection = unknown[] | Map<string, unknown> | Set<unknown>;

/** The length of an array, counting slots with no element, or the number of members in a map or a set. */
export const length: NativeAction = ({ coll }) => {
  const collection = coll as Collection;
  return Array.isArray(collection) ? collection.length : collection.size;
};

/** The number of elements a collection holds, skipping an array's slots with no element. */
export const size: NativeAction = ({ coll }) => {
  const collection = coll as Collection;
  return Array.isArray(collection) ? elements(collection).length : collection.size;
};

/**
 * A new collection of `tgt`'s contents followed by `src`'s. An array keeps its empty slots, so
 * `src` starts at `tgt`'s full length; a map takes `src`'s value where both have a member; and a
 * set is the union. Neither is changed.
 */
export const concat: NativeAction = ({ src, tgt }) => {
  if (Array.isArray(tgt)) {
    const target: unknown[] = tgt;
    const source = src as unknown[];
    const joined: unknown[] = new Array<unknown>(target.length + source.length);
    // `forEach` skips empty slots, so they stay empty in the new array.
    target.forEach((element: unknown, index) => {
      joined[index] = element;
    });
    source.forEach((element: unknown, index) => {
      joined[target.length + index] = element;
    });
    return joined;
  }
  if (tgt instanceof Map) {
return new Map([...tgt, ...(src as Map<string, unknown>)]);
}
  const union = new Set(tgt as Set<unknown>);
  for (const element of src as Set<unknown>) {
if (!holds(union, element)) {
union.add(element);
}
}
  return union;
};

/** The members of `coll`, each converted to text, with `delim` between them. */
export const join: NativeAction = ({ coll, delim }) => memberTexts(coll).join(delim as string);

/** A map's member names, in its stable order. */
export const keys: NativeAction = ({ map }) => [...(map as Map<string, unknown>).keys()];

/** A map's member values, in its stable order. */
export const values: NativeAction = ({ map }) => [...(map as Map<string, unknown>).values()];

/** Add `value` to `set`, unless it is already there. */
export const add: NativeAction = ({ set, value }) => {
  const target = set as Set<unknown>;
  if (!holds(target, value)) {
target.add(value);
}
};

/** Remove `value` from `set`, if it is there. */
export const remove: NativeAction = ({ set, value }) => {
  const target = set as Set<unknown>;
  for (const element of target) {
if (equal(element, value)) {
target.delete(element);
}
}
};

/** A new set of the elements in both `first` and `second`. */
export const intersect: NativeAction = ({ first, second }) =>
  new Set([...(first as Set<unknown>)].filter((element) => holds(second as Set<unknown>, element)));

/** A new set of the elements of `base` that aren't in `exclude`. */
export const difference: NativeAction = ({ base, exclude }) =>
  new Set([...(base as Set<unknown>)].filter((element) => !holds(exclude as Set<unknown>, element)));

/** Whether every element of `subset` is also in `superset`. */
export const isSubset: NativeAction = ({ subset, superset }) =>
  [...(subset as Set<unknown>)].every((element) => holds(superset as Set<unknown>, element));
