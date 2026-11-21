import { resolveBodies, type Locals } from './bodies.ts';
import type { Diagnostic } from './diagnostic.ts';
import { checkEntities, type NavigationField } from './entities.ts';
import { fileSystemHost, type Host } from './host.ts';
import { loadProgram, type LoadedProgram } from './modules.ts';
import { resolveNames, type References } from './resolve.ts';
import { checkTypes } from './typecheck.ts';

export interface CheckedProgram extends LoadedProgram {
  /** The top-level names the program refers to, resolved to the symbols they mean. */
  references: References;
  /** The local binding each local name in an expression refers to. */
  locals: Locals;
  /** Each entity's navigation fields, by the entity's module and name, then the field's name. */
  navigation: Map<string, Map<string, NavigationField>>;
}

/**
 * Check a whole program, starting from its entry module: load it and every module it imports,
 * report syntax errors and names declared twice in each, resolve imports and exports, resolve
 * the names its declarations and bodies refer to, check what its entities, relations and
 * security declarations name, and check its types. Every diagnostic names its file.
 */
export function checkProgram(entry: string, host: Host = fileSystemHost): CheckedProgram {
  const program = loadProgram(entry, host);
  const names = resolveNames(program);
  const bodies = resolveBodies(program, names.references);
  const entities = checkEntities(program, names.references);
  const types = checkTypes({ ...program, references: names.references, locals: bodies.locals, navigation: entities.navigation });
  const diagnostics: Diagnostic[] = [
    ...program.diagnostics,
    ...names.diagnostics,
    ...bodies.diagnostics,
    ...entities.diagnostics,
    ...types,
  ];
  return {
    ...program,
    references: names.references,
    locals: bodies.locals,
    navigation: entities.navigation,
    diagnostics,
  };
}
