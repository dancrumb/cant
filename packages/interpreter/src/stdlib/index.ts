import type { Streams } from '../run.ts';
import * as Collections from './Collections.ts';
import * as Console from './Console.ts';
import * as Conversion from './Conversion.ts';
import * as IO from './IO.ts';
import * as Text from './Text.ts';
import * as Time from './Time.ts';

/**
 * A native action's implementation (docs/adr/0036-native-modules.md#calling-a-native-action): it
 * takes its arguments, by parameter name, and its context, and returns the action's value, or a
 * `Promise` of it. It raises one of the action's errors by throwing a `CantError`. A standard
 * library action's context also holds the streams the interpreter gives the program, which
 * `cant::Console` writes to.
 */
export type StandardAction = (args: Record<string, unknown>, context: { signal: AbortSignal; streams: Streams }) => unknown;

/**
 * The implementation of every standard library action, by the symbol a compiled program names it
 * with, such as `cant::IO#write` (docs/adr/0039-compiled-programs.md). `cant::Errors` has no
 * actions: the interpreter raises its errors itself.
 */
export const STANDARD_ACTIONS: ReadonlyMap<string, StandardAction> = new Map(
  Object.entries({ Collections, Console, Conversion, IO, Text, Time }).flatMap(([module, actions]) =>
    Object.entries(actions).map(([name, action]): [string, StandardAction] => [`cant::${module}#${name}`, action]),
  ),
);
