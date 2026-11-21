export { check } from './check.ts';
export type { CheckResult } from './check.ts';

export { checkProgram } from './program.ts';
export type { CheckedProgram } from './program.ts';

export { collectDeclarations, MAIN_NAMESPACE } from './declarations.ts';
export type {
  CollectedDeclarations,
  InNamespace,
  ModuleSymbols,
  NamespaceSymbols,
  TypeDeclaration,
} from './declarations.ts';

export { formatDiagnostic } from './diagnostic.ts';
export type { Diagnostic } from './diagnostic.ts';

export { fileSystemHost } from './host.ts';
export type { Host } from './host.ts';

export { findManifest, MANIFEST, readManifest } from './manifest.ts';
export type { Manifest } from './manifest.ts';

export { loadProgram, symbolOf } from './modules.ts';
export type {
  ImportedSymbol,
  ImportTarget,
  LoadedProgram,
  Module,
  ModuleSymbol,
  SymbolKind,
  TypeKind,
} from './modules.ts';

export { resolveBodies } from './bodies.ts';
export type { LocalBinding, Locals } from './bodies.ts';

export { checkEntities } from './entities.ts';
export type { NavigationField } from './entities.ts';

export { resolveNames } from './resolve.ts';
export type { References } from './resolve.ts';

export { checkConstants } from './constants.ts';
export type { ConstantsInput } from './constants.ts';

export { checkTypes } from './typecheck.ts';
export type { ResolvedProgram } from './typecheck.ts';

export { createAssignable, describe as describeType, typeOf } from './types.ts';
export type { Assignable, Type } from './types.ts';

export { STANDARD_LIBRARY } from './stdlib.ts';
export type { StandardKind } from './stdlib.ts';
