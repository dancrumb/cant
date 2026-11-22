import { STANDARD_SOURCES } from './generated/stdlib.ts';
import type { Type } from './types.ts';

/**
 * The modules of the `cant` scope, which are built into the interpreter
 * (docs/adr/0031-module-resolution.md). They are native modules whose declarations can use
 * internal types that other Cant source can't write (docs/adr/0036-native-modules.md).
 *
 * A module with Cant source in ../stdlib, such as `cant::IO`, is loaded from it like any other
 * module, so calls to its actions are checked against their declarations. The others are
 * described here only by the names they export, until they have source of their own.
 */

export { STANDARD_SOURCES };

/** What a standard library module exports a name as. */
export type StandardKind = 'action' | 'error';

/** The standard library modules that have no Cant source yet, by the names they export. */
export const STANDARD_LIBRARY: ReadonlyMap<string, ReadonlyMap<string, StandardKind>> = new Map([
  // docs/adr/0023-error-handling.md, docs/adr/0035-entity-relationships.md
  [
    'Errors',
    errors(
      'DivisionByZero', 'FractionalModulo', 'InvalidEnumValue', 'IndexBeforeStart',
      'DefaultUnavailable', 'RequiredField', 'UnknownField', 'CardinalityViolation',
    ),
  ],
  // docs/adr/0026-dates-and-times.md
  [
    'Time',
    new Map([
      ...actions('addDays', 'addMonths', 'addYears', 'format', 'parse'),
      ...errors('UnknownTimeZone', 'NotWholeNumber', 'InvalidDateTime'),
    ]),
  ],
]);

/** Whether the standard library has a module called `name`. */
export const isStandardModule = (name: string): boolean => STANDARD_LIBRARY.has(name) || STANDARD_SOURCES.has(name);

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

function actions(...names: string[]): Map<string, StandardKind> {
  return new Map(names.map((name) => [name, 'action']));
}

function errors(...names: string[]): Map<string, StandardKind> {
  return new Map(names.map((name) => [name, 'error']));
}
