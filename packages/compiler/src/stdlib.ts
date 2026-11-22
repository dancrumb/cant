import { STANDARD_SOURCES } from './generated/stdlib.ts';
import type { Type } from './types.ts';

/**
 * The modules of the `cant` scope, which are built into the interpreter
 * (docs/adr/0031-module-resolution.md). They are native modules whose declarations can use
 * internal types that other Cant source can't write (docs/adr/0036-native-modules.md).
 *
 * Each one is declared in Cant, in ../stdlib, which the compiler embeds. A program that imports
 * one loads it like any other module, so calls to its actions are checked against their
 * declarations.
 */

export { STANDARD_SOURCES };

/** Whether the standard library has a module called `name`. */
export const isStandardModule = (name: string): boolean => STANDARD_SOURCES.has(name);

/** The path a standard library module with Cant source is loaded as, such as `cant::IO`. */
export const standardPath = (name: string): string => `cant::${name}`;

/** Whether a module's path is a standard library module's, rather than a file's. */
export const isStandardPath = (path: string): boolean => path.startsWith('cant::');

/**
 * The internal types that only standard library modules can write
 * (docs/adr/0036-native-modules.md): the stream types of docs/adr/0040-standard-streams.md, as
 * `cant::IO` names them (docs/adr/0042-io.md), of which a `ReadStream` is also given a `FILE`, and
 * `Collection` (docs/adr/0021-collections.md).
 */
export const INTERNAL_TYPES: ReadonlyMap<string, Type> = new Map<string, Type>([
  ['ReadStream', { kind: 'stream', direction: 'input', file: true }],
  ['WriteStream', { kind: 'stream', direction: 'output' }],
  // Any collection of anything, as a type parameter's bound, as in `<C: Collection>`
  // (docs/adr/0043-standard-library-generics.md).
  ['Collection', { kind: 'collection', element: { kind: 'unchecked' } }],
]);

/** The generic types that only standard library modules can write, by how many type arguments they take. */
export const GENERIC_TYPES: ReadonlyMap<string, number> = new Map([['Collection', 1]]);
