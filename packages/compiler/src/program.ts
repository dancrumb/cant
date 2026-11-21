import { fileSystemHost, type Host } from './host.ts';
import { loadProgram, type LoadedProgram } from './modules.ts';
import { resolveNames, type References } from './resolve.ts';
import type { Diagnostic } from './diagnostic.ts';

export interface CheckedProgram extends LoadedProgram {
  /** The top-level names that declarations refer to, resolved. */
  references: References;
}

/**
 * Check a whole program, starting from its entry module: load it and every module it imports,
 * report syntax errors and names declared twice in each, resolve imports and exports, and
 * resolve the top-level names its declarations refer to. Every diagnostic names its file.
 */
export function checkProgram(entry: string, host: Host = fileSystemHost): CheckedProgram {
  const program = loadProgram(entry, host);
  const { references, diagnostics } = resolveNames(program);
  const all: Diagnostic[] = [...program.diagnostics, ...diagnostics];
  return { ...program, references, diagnostics: all };
}
