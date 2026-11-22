import { parse, ParseError, type Program } from '@dancrumb/cant-shared';
import { collectDeclarations, type ModuleSymbols } from './declarations.ts';
import { error, type Diagnostic } from './diagnostic.ts';

export interface CheckResult {
  /** The module's syntax tree, unless it has a syntax error. */
  program?: Program;
  /** The module's declarations, unless it has a syntax error. */
  symbols?: ModuleSymbols;
  /** Every problem found, in the order the passes found them. Empty when the module is valid so far. */
  diagnostics: Diagnostic[];
}

/**
 * Check one module of Cant source. For now, this parses it, reporting a syntax error if there is
 * one, and gathers its declarations, reporting names that are declared twice. Resolving names
 * and checking types are still to come.
 */
export function check(source: string): CheckResult {
  let program: Program;
  try {
    program = parse(source);
  } catch (caught) {
    if (!(caught instanceof ParseError)) {
throw caught;
}
    const { start, end } = caught.location;
    return {
      diagnostics: [
        error('syntax', caught.message, {
          start: { line: start.line, column: start.column, offset: start.offset },
          end: { line: end.line, column: end.column, offset: end.offset },
        }),
      ],
    };
  }

  const { symbols, diagnostics } = collectDeclarations(program);
  return { program, symbols, diagnostics };
}
