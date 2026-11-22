import { basename, dirname, extname, join } from 'node:path';
import { STANDARD_SOURCES } from './generated/stdlib.ts';
import type { Host } from './host.ts';
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

/**
 * Where a program's standard library modules come from: the copy the compiler embeds, or the
 * `stdlib` folder of a `@dancrumb/cant-compiler` package (see `findStandardLibrary`).
 */
export interface StandardLibrary {
  /** The Cant source of the module called `name`, or `undefined` if there is no such module. */
  source(name: string): string | undefined;
  /** The `stdlib` folder it is read from, if it isn't the embedded copy. */
  readonly directory?: string;
}

/** The standard library the compiler embeds, which matches the interpreter it ships with. */
export const EMBEDDED_STANDARD_LIBRARY: StandardLibrary = { source: (name) => STANDARD_SOURCES.get(name) };

/**
 * The standard library in a `stdlib` folder, read through `host`, so that an editor's unsaved
 * changes to its files are seen.
 */
export const standardLibraryIn = (directory: string, host: Host): StandardLibrary => ({
  directory,
  // A module name is an identifier, so it can't lead out of the folder.
  source: (name) => host.readFile(join(directory, `${name}.cant`)),
});

/** The path a standard library module with Cant source is loaded as, such as `cant::IO`. */
export const standardPath = (name: string): string => `cant::${name}`;

/** Whether a module's path is a standard library module's, rather than a file's. */
export const isStandardPath = (path: string): boolean => path.startsWith('cant::');

/** The package whose `stdlib` folder holds the standard library's Cant source. */
const STANDARD_PACKAGE = '@dancrumb/cant-compiler';

/** The package that holds the `cant` command, and the interpreter that runs a program. */
const CLI_PACKAGE = '@dancrumb/cant';

/** Whether `directory` holds the package called `name`. */
const isPackage = (directory: string, name: string, host: Host): boolean => {
  const manifest = host.readFile(join(directory, 'package.json'));
  if (manifest === undefined) {
    return false;
  }
  try {
    return (JSON.parse(manifest) as { name?: unknown }).name === name;
  } catch {
    return false;
  }
};

/**
 * The standard library that goes with the version of Cant that will run the program at `entry`,
 * so that an editor checks it against the same declarations. Each directory from the entry's up is
 * looked in, and the nearest wins. In each, in order, it is the `stdlib` folder of:
 *
 * 1. the `@dancrumb/cant-compiler` package that is that directory, or its `packages/compiler`, as
 *    in Cant's own repository, where the standard library is being changed;
 * 2. the `@dancrumb/cant-compiler` that the installed `@dancrumb/cant` uses, whose interpreter runs
 *    the program, in `node_modules/@dancrumb/cant/node_modules` or, hoisted, in `node_modules`.
 *
 * It is `undefined` when there is none, and the embedded copy is used. A `stdlib` folder that
 * doesn't hold `IO.cant` is too old to have its Cant source, and is passed over.
 */
export function findStandardLibrary(entry: string, host: Host): StandardLibrary | undefined {
  const usable = (directory: string): boolean =>
    isPackage(directory, STANDARD_PACKAGE, host) && host.readFile(join(directory, 'stdlib', 'IO.cant')) !== undefined;
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const candidates = [
      directory,
      join(directory, 'packages', 'compiler'),
      join(directory, 'node_modules', ...CLI_PACKAGE.split('/'), 'node_modules', ...STANDARD_PACKAGE.split('/')),
      join(directory, 'node_modules', ...STANDARD_PACKAGE.split('/')),
    ];
    const found = candidates.find(usable);
    if (found !== undefined) {
      return standardLibraryIn(join(found, 'stdlib'), host);
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
}

/**
 * Whether a file is one of the standard library's own sources, such as `stdlib/IO.cant` in
 * `@dancrumb/cant-compiler`, so that it is checked as the standard library module it declares,
 * which can write internal types (docs/adr/0036-native-modules.md). This is how an editor checks
 * the file while it is being changed. Any other file, even one called `stdlib/IO.cant`, is an
 * ordinary module.
 */
export function isStandardFile(path: string, host: Host): boolean {
  // Any module in the folder, so that a new one can be written there.
  return extname(path) === '.cant' && basename(dirname(path)) === 'stdlib' && isPackage(dirname(dirname(path)), STANDARD_PACKAGE, host);
}

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
