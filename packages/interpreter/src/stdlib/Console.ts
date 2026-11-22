import type { Writable } from 'node:stream';
import type { StandardAction } from './index.ts';
import { textOf } from './values.ts';

/**
 * cant::Console (docs/adr/0044-console.md), declared by packages/compiler/stdlib/Console.cant. Each
 * call writes one line to the program's `@stderr`: the level, padded so that messages line up,
 * the message, and, when there is any, the data as text, two spaces after it. Writing never
 * fails a call: a line that can't be written is dropped.
 */

/** Each `LogLevel` value, as a line labels it. */
const LABELS: Record<string, string> = { Error: 'ERROR', Warn: 'WARN', Info: 'INFO', Debug: 'DEBUG', Trace: 'TRACE' };

/** The widest label, which every label is padded to. */
const WIDTH = Math.max(...Object.values(LABELS).map((label) => label.length));

/** The line a call writes, ending with a line break. */
function line(level: string, message: string, data: unknown): string {
  const label = (LABELS[level] ?? level.toUpperCase()).padEnd(WIDTH);
  const details = data instanceof Map && data.size > 0 ? `  ${textOf(data)}` : '';
  return `${label} ${message}${details}\n`;
}

/** Write `text` to `stream` whole, once it is accepted, or not at all if the stream has failed. */
const write = (stream: Writable, text: string): Promise<void> =>
  new Promise((resolve) => {
    // A failure is dropped: a log line that can't be written doesn't stop the program.
    const dropped = (): void => {
      resolve();
    };
    stream.once('error', dropped);
    stream.write(text, 'utf8', () => {
      stream.off('error', dropped);
      resolve();
    });
  });

/** An action that logs at one level. */
const at =
  (level: string): StandardAction =>
  ({ message, data }, { streams }) =>
    write(streams.stderr, line(level, message as string, data));

/** Log `message`, and any `data`, as an error. */
export const error = at('Error');

/** Log `message`, and any `data`, as a warning. */
export const warn = at('Warn');

/** Log `message`, and any `data`, as information. */
export const info = at('Info');

/** Log `message`, and any `data`, as a detail for debugging. */
export const debug = at('Debug');

/** Log `message`, and any `data`, as a trace of what the program is doing. */
export const trace = at('Trace');

/** Log `message`, and any `data`, at `level`. */
export const log: StandardAction = ({ level, message, data }, { streams }) =>
  write(streams.stderr, line(level as string, message as string, data));
