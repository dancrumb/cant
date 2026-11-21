/**
 * The modules of the `cant` scope, which are built into the interpreter
 * (docs/adr/0031-module-resolution.md). They are native modules whose declarations can use
 * internal types that Cant source can't write (docs/adr/0036-native-modules.md), so the compiler
 * describes them here, by the names they export, rather than reading them from Cant files.
 *
 * Only names are listed for now: their signatures arrive with type checking.
 */

/** What a standard library module exports a name as. */
export type StandardKind = 'action' | 'error';

export const STANDARD_LIBRARY: ReadonlyMap<string, ReadonlyMap<string, StandardKind>> = new Map([
  // docs/adr/0021-collections.md
  [
    'Collections',
    actions(
      'length', 'size', 'concat', 'join', 'keys', 'values',
      'add', 'remove', 'intersect', 'difference', 'isSubset',
    ),
  ],
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
  // docs/adr/0015-files.md leaves `cant::IO` to be designed. `write` is the one action the ADRs'
  // examples use (docs/adr/0006-imports.md, 0012).
  ['IO', actions('write')],
]);

function actions(...names: string[]): Map<string, StandardKind> {
  return new Map(names.map((name) => [name, 'action']));
}

function errors(...names: string[]): Map<string, StandardKind> {
  return new Map(names.map((name) => [name, 'error']));
}
