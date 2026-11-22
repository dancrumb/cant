import type { Position } from 'unist';

/** A problem the compiler found in a module, and where in its source it is. */
export interface Diagnostic {
  severity: 'error';
  /** A short, stable name for the kind of problem, such as `duplicate-type`. */
  code: string;
  message: string;
  /** Where the problem is. Lines and columns are 1-based and offsets are 0-based, as in unist. */
  position: Position;
  /** The file the problem is in, when the compiler checks more than one. */
  file?: string;
}

export const error = (code: string, message: string, position: Position): Diagnostic => ({
  severity: 'error',
  code,
  message,
  position,
});

/**
 * Write a diagnostic for people: `file:line:column: error: message`, then the line of source it
 * points to, with carets under the part it is about.
 */
export function formatDiagnostic(file: string, source: string, diagnostic: Diagnostic): string {
  const { start, end } = diagnostic.position;
  const header = `${file}:${String(start.line)}:${String(start.column)}: ${diagnostic.severity}: ${diagnostic.message}`;
  const line = source.split(/\r?\n/)[start.line - 1];
  if (line === undefined) {
return header;
}

  // Underline to the end of the position, or to the end of the line if it runs onto later lines.
  const width = end.line === start.line ? Math.max(1, end.column - start.column) : Math.max(1, line.length - start.column + 1);
  const gutter = String(start.line).length;
  return [
    header,
    `${' '.repeat(gutter)} |`,
    `${String(start.line)} | ${line}`,
    `${' '.repeat(gutter)} | ${' '.repeat(start.column - 1)}${'^'.repeat(width)}`,
  ].join('\n');
}
